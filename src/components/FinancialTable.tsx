import { useState, useRef } from "react";
import { SheetType } from "../types";
import { buildTree, flattenTree } from "../hooks/useFinancialData";
import { SheetData } from "../types";

interface Props {
  data: SheetData;
  sheet: SheetType;
  onUpdate: (entryId: number, year: number, value: number | null) => Promise<void>;
  readOnly?: boolean;
}

function fmt(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  if (v === 0) return "–";
  return new Intl.NumberFormat("fr-DZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

interface CellProps {
  entryId: number;
  year: number;
  value: number | null;
  isTotal: boolean;
  readOnly: boolean;
  onUpdate: (entryId: number, year: number, value: number | null) => Promise<void>;
}

function EditableCell({ entryId, year, value, isTotal, readOnly, onUpdate }: CellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  if (isTotal || readOnly) {
    return (
      <td className={`px-3 py-1 text-right font-semibold tabular-nums ${isTotal ? "text-blue-800" : "text-gray-700"}`}>
        {fmt(value)}
      </td>
    );
  }

  const startEdit = () => {
    setDraft(value !== null ? String(value) : "");
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commit = async () => {
    setEditing(false);
    const parsed = draft.trim() === "" ? null : parseFloat(draft.replace(/\s/g, "").replace(",", "."));
    const newVal = parsed !== null && !isNaN(parsed) ? parsed : null;
    if (newVal !== value) {
      await onUpdate(entryId, year, newVal);
    }
  };

  if (editing) {
    return (
      <td className="px-1 py-0">
        <input
          ref={inputRef}
          className="w-full text-right border border-blue-400 rounded px-2 py-0.5 tabular-nums focus:outline-none"
          value={draft}
          autoFocus
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        />
      </td>
    );
  }

  return (
    <td
      className="px-3 py-1 text-right tabular-nums cursor-pointer hover:bg-blue-50"
      onClick={startEdit}
    >
      {fmt(value)}
    </td>
  );
}

export default function FinancialTable({ data, sheet, onUpdate, readOnly = false }: Props) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const toggle = (id: number) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const tree = buildTree(data.entries);
  const rows = flattenTree(tree, collapsed);

  const isBilan = sheet === "BILAN";

  return (
    <div className="overflow-auto">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-700 text-white">
            <th className="px-3 py-2 text-left font-semibold min-w-80">LIBELLÉ</th>
            {data.years.map(y => (
              <th key={y} className="px-3 py-2 text-right font-semibold tabular-nums min-w-36">{y}</th>
            ))}
            {isBilan && data.years.map(y => (
              <th key={`tx-${y}`} className="px-3 py-2 text-right font-semibold text-yellow-200 min-w-20">Tx {y}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((node, idx) => {
            const isEven = idx % 2 === 0;
            const rowBg = node.is_total
              ? "bg-blue-50 border-t border-b border-blue-200"
              : node.is_section_header
              ? "bg-slate-100"
              : isEven ? "bg-white" : "bg-gray-50";

            const indent = node.depth * 20;
            const hasChildren = node.children.length > 0;
            const isOpen = !collapsed.has(node.id);

            // For BILAN, compute Tx = value / total_actif(or passif) per year
            const bilanTotals: Record<string, number> = {};
            if (isBilan) {
              // Find total_actif or total_passif value for each year from data
              const totalActif = data.entries.find(e => e.entry_key === "total_actif");
              const totalPassif = data.entries.find(e => e.entry_key === "total_passif");
              data.years.forEach(y => {
                const yk = String(y);
                const tv = (node.sheet_type === "ACTIF" ? totalActif : totalPassif)?.values[yk];
                bilanTotals[yk] = tv ?? 0;
              });
            }

            return (
              <tr key={node.id} className={rowBg}>
                <td className="px-3 py-1" style={{ paddingLeft: `${12 + indent}px` }}>
                  <div className="flex items-center gap-1">
                    {hasChildren && (
                      <button
                        className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-800"
                        onClick={() => toggle(node.id)}
                      >
                        {isOpen ? "▾" : "▸"}
                      </button>
                    )}
                    {!hasChildren && <span className="w-5 flex-shrink-0" />}
                    <span className={`${node.is_total ? "font-bold text-blue-900 uppercase text-xs" : ""} ${node.is_section_header ? "font-semibold text-slate-700" : "text-slate-900"}`}>
                      {node.label}
                    </span>
                  </div>
                </td>
                {data.years.map(y => {
                  const yk = String(y);
                  const v = node.values[yk] ?? null;
                  return (
                    <EditableCell
                      key={y}
                      entryId={node.id}
                      year={y}
                      value={v}
                      isTotal={node.is_total || node.is_section_header}
                      readOnly={readOnly}
                      onUpdate={onUpdate}
                    />
                  );
                })}
                {isBilan && data.years.map(y => {
                  const yk = String(y);
                  const v = node.values[yk] ?? 0;
                  const total = bilanTotals[yk] ?? 0;
                  const tx = total !== 0 ? (v / Math.abs(total)) * 100 : null;
                  return (
                    <td key={`tx-${y}`} className="px-3 py-1 text-right tabular-nums text-amber-700 text-xs">
                      {tx !== null ? `${tx.toFixed(1)}%` : "–"}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
