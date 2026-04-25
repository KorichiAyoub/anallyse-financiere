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

        if (rows.length < 2) continue;

        // Row 1 (index 1) contains headers: LIBELLE, year1, year2, ...
        const headers = rows[1] as unknown[];
        const yearCols: Array<{ colIndex: number; year: number }> = [];
        headers.forEach((h, i) => {
          if (i < 2) return; // skip first 2 cols (empty + label)
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
