import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { SheetData, SheetType, ImportRow } from "../types";
import { flattenTree, buildTree } from "../hooks/useFinancialData";
import { invokeTauri, isTauriRuntime } from "../lib/tauri";

interface Props {
  sheet: SheetType;
  data: SheetData | null;
  onImportDone: () => void;
}

function detectSheetType(sheetName: string): string | null {
  const n = sheetName.toUpperCase();
  if (n.includes("ACTIF")) return "ACTIF";
  if (n.includes("PASSIF")) return "PASSIF";
  if (n.includes("TR") || n.includes("RESULTAT")) return "TR";
  return null;
}

export default function ImportExport({ sheet, data, onImportDone }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tauriMode = isTauriRuntime();

  /** Write bytes via Rust → OS Downloads folder (avoids Tauri WebView download restrictions) */
  const saveViaRust = async (filename: string, bytes: Uint8Array): Promise<string> => {
    return invokeTauri<string>("save_file", { filename, data: Array.from(bytes) });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!tauriMode) {
      setStatus("Mode navigateur: import indisponible (utilisez l'app desktop Tauri).");
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setStatus(null);
    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: "array" });

      let totalImported = 0;
      for (const sheetName of wb.SheetNames) {
        const targetSheet = detectSheetType(sheetName);
        if (!targetSheet) continue;

        const ws = wb.Sheets[sheetName];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];

        if (rows.length < 3) continue;

        // ── Detect format: Brut / Amort / Net (one-year SCF format) ──────────
        const isBrutFormat = (() => {
          for (let ri = 0; ri < Math.min(5, rows.length); ri++) {
            const cells = (rows[ri] as unknown[]).map((c) => String(c ?? "").toLowerCase());
            const hasBrut = cells.some((c) => c.startsWith("brut"));
            const hasAmort = cells.some((c) => c.includes("amort") || c.includes("prov"));
            if (hasBrut && hasAmort) return ri;
          }
          return -1;
        })();

        if (isBrutFormat >= 0 && targetSheet === "ACTIF") {
          // ── New Brut/Amort/Net format ─────────────────────────────────────
          const headerRow = rows[isBrutFormat] as unknown[];

          // Extract year: look for "YYYY" in any header cell
          let year = 0;
          for (const cell of headerRow) {
            const s = String(cell ?? "");
            const m = s.match(/\b(20\d{2})\b/);
            if (m) { year = parseInt(m[1]); break; }
          }
          // Also search in rows 0 and 1
          if (!year) {
            for (let ri = 0; ri < isBrutFormat; ri++) {
              for (const cell of rows[ri] as unknown[]) {
                const m = String(cell ?? "").match(/\b(20\d{2})\b/);
                if (m) { year = parseInt(m[1]); break; }
              }
              if (year) break;
            }
          }
          // Fallback: use last year known by the app
          if (!year && data?.years?.length) {
            year = data.years[data.years.length - 1];
          }
          if (!year) continue;

          // Find column indices: col 0 = label, col 1 = Brut, col 2 = Amort, col 3 = Net
          let amortCol = 2, netCol = 3;
          for (let ci = 0; ci < headerRow.length; ci++) {
            const h = String(headerRow[ci] ?? "").toLowerCase();
            if (h.includes("amort") || h.includes("prov") || h.includes("dép")) amortCol = ci;
            else if (h.startsWith("net")) netCol = ci;
          }

          const importRows: ImportRow[] = [];
          // Collect per-key amort values (first-match-wins to avoid double-counting sections + children)
          const amortByKey: Record<string, number> = {};

          const parseNum = (v: unknown): number | null => {
            if (v === null || v === undefined || v === "") return null;
            const n = parseFloat(String(v));
            return isNaN(n) ? null : n;
          };

          for (let ri = isBrutFormat + 1; ri < rows.length; ri++) {
            const row = rows[ri] as unknown[];
            const label = String(row[0] ?? "").trim();
            if (!label) continue;

            const netVal  = parseNum(row[netCol]);
            const amortVal = parseNum(row[amortCol]) ?? 0;

            // Store NET for all rows
            if (netVal !== null) {
              importRows.push({ label, year, value: netVal });
            }

            if (amortVal === 0) continue;

            // Normalize: lowercase + strip accents
            const norm = label.toLowerCase()
              .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

            // Map label → amort key (first match wins per key)
            if (norm.includes("incorporell") && !("imm_incorp" in amortByKey)) {
              amortByKey["imm_incorp"] = amortVal;
            } else if (norm.includes("corporell") && !norm.includes("incorporell") && !("imm_corp" in amortByKey)) {
              amortByKey["imm_corp"] = amortVal;
            } else if ((norm.startsWith("stocks") || norm === "stocks et encours") && !("stocks" in amortByKey)) {
              amortByKey["stocks"] = amortVal;
            } else if (norm.includes("creances") && !norm.includes("autres") && !("creances" in amortByKey)) {
              amortByKey["creances"] = amortVal;
            }
          }

          const count = await invokeTauri<number>("import_values", { rows: importRows, sheetType: targetSheet });
          totalImported += count;

          // Store per-key amorts in financial_amorts (feeds journal de retraitement)
          for (const [key, val] of Object.entries(amortByKey)) {
            if (val >= 0) {
              await invokeTauri("set_actif_amort", { year, amortKey: key, amort: val });
            }
          }

          // Also persist as combined retraitements (backward compat + manual edits)
          const amortAnc    = (amortByKey["imm_incorp"] ?? 0) + (amortByKey["imm_corp"] ?? 0);
          const provStocks  = amortByKey["stocks"]   ?? 0;
          const provCreances = amortByKey["creances"] ?? 0;
          if (amortAnc + provStocks + provCreances > 0) {
            await invokeTauri("set_retraitement_values", { year, amortAnc, provStocks, provCreances });
          }
          continue;
        }

        // ── Standard year-column format ───────────────────────────────────────
        const headers = rows[1] as unknown[];
        const yearCols: Array<{ colIndex: number; year: number }> = [];
        headers.forEach((h, i) => {
          if (i < 2) return;
          const y = parseInt(String(h));
          if (!isNaN(y) && y > 1990 && y < 2100) yearCols.push({ colIndex: i, year: y });
        });

        if (yearCols.length === 0) continue;

        const importRows: ImportRow[] = [];
        for (let ri = 2; ri < rows.length; ri++) {
          const row = rows[ri] as unknown[];
          const label = String(row[1] ?? "").trim();
          if (!label) continue;

          for (const { colIndex, year } of yearCols) {
            const raw = row[colIndex];
            let value: number | null = null;
            if (raw !== null && raw !== undefined && raw !== "") {
              const parsed = parseFloat(String(raw));
              if (!isNaN(parsed)) value = parsed;
            }
            importRows.push({ label, year, value });
          }
        }

        const count = await invokeTauri<number>("import_values", { rows: importRows, sheetType: targetSheet });
        totalImported += count;
      }

      setStatus(`✓ ${totalImported} valeurs importées`);
      onImportDone();
    } catch (err) {
      setStatus(`Erreur: ${err}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const exportExcel = async () => {
    if (!tauriMode) {
      setStatus("Mode navigateur: export indisponible (utilisez l'app desktop Tauri).");
      return;
    }

    if (!data) return;
    setBusy(true);
    setStatus(null);
    try {
      const tree = buildTree(data.entries);
      const flat = flattenTree(tree, new Set());

      const headerRow = ["LIBELLÉ", ...data.years.map(String)];
      const dataRows = flat.map(node => [
        node.label,
        ...data.years.map(y => node.values[String(y)] ?? ""),
      ]);

      const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheet);
      const wbout: ArrayBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });

      const path = await saveViaRust(`${sheet}_export.xlsx`, new Uint8Array(wbout));
      setStatus(`✓ Sauvegardé dans ${path}`);
    } catch (e) {
      setStatus(`Erreur export: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  const exportPDF = async () => {
    if (!tauriMode) {
      setStatus("Mode navigateur: export indisponible (utilisez l'app desktop Tauri).");
      return;
    }

    if (!data) return;
    setBusy(true);
    setStatus(null);
    try {
      const tree = buildTree(data.entries);
      const flat = flattenTree(tree, new Set());

      const doc = new jsPDF({ orientation: "landscape", format: "a4" });
      doc.setFontSize(14);
      doc.text(`${sheet} – Analyse Financière`, 14, 14);

      const fmt = (v: number | null | undefined) => {
        if (v === null || v === undefined || v === 0) return "";
        return new Intl.NumberFormat("fr-DZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
      };

      const head = [["LIBELLÉ", ...data.years.map(String)]];
      const body = flat.map(node => [
        node.label,
        ...data.years.map(y => fmt(node.values[String(y)])),
      ]);

      autoTable(doc, {
        head,
        body,
        startY: 22,
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [30, 41, 59], textColor: 255 },
        didParseCell: (data) => {
          if (data.section === "body") {
            const node = flat[data.row.index];
            if (node?.is_total) {
              data.cell.styles.fontStyle = "bold";
              data.cell.styles.fillColor = [239, 246, 255];
            } else if (node?.is_section_header) {
              data.cell.styles.fontStyle = "bold";
              data.cell.styles.fillColor = [241, 245, 249];
            }
          }
        },
      });

      const pdfBytes = doc.output("arraybuffer");
      const path = await saveViaRust(`${sheet}_bilan.pdf`, new Uint8Array(pdfBytes));
      setStatus(`✓ Sauvegardé dans ${path}`);
    } catch (e) {
      setStatus(`Erreur export: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleImport}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy || !tauriMode}
        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-sm rounded hover:bg-emerald-700 disabled:opacity-50"
      >
        📥 Importer Excel
      </button>
      <button
        onClick={exportExcel}
        disabled={!data || busy || !tauriMode}
        className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
      >
        📤 Exporter Excel
      </button>
      <button
        onClick={exportPDF}
        disabled={!data || busy || sheet === "BILAN" || !tauriMode}
        className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50"
      >
        📄 Exporter PDF
      </button>
      {status && (
        <span className={`text-sm ${status.startsWith("✓") ? "text-emerald-600" : "text-red-600"}`}>
          {status}
        </span>
      )}
    </div>
  );
}
