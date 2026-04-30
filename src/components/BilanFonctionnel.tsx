import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { invokeTauri } from "../lib/tauri";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DetteAge {
  category: string;
  label: string;
  total: number;
  moins_1_an: number;
  plus_1_an: number;
}

interface BilanFonctionnelData {
  year: number;
  actifs_fixes: number;
  actifs_circulants: number;
  disponibilites: number;
  total_actif_bf: number;
  pct_actifs_fixes: number;
  pct_actifs_circulants: number;
  pct_disponibilites: number;
  capitaux_propres: number;
  dlmt: number;
  dct: number;
  total_passif_bf: number;
  pct_cp: number;
  pct_dlmt: number;
  pct_dct: number;
  amort_anc: number;
  prov_stocks: number;
  prov_creances: number;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 0 }).format(v);
const pct = (v: number) =>
  isFinite(v) ? v.toFixed(2) + "%" : "—";

// ── Sub-component: Dettes par âge ────────────────────────────────────────────

function DettesParAge({
  year,
  dettes,
  onUpdate,
}: {
  year: number;
  dettes: DetteAge[];
  onUpdate: () => void;
}) {
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const handleChange = (cat: string, val: string) => {
    setEditing((p) => ({ ...p, [cat]: val }));
  };

  const handleBlur = async (cat: string, total: number) => {
    const raw = editing[cat];
    if (raw === undefined) return;
    const parsed = parseFloat(raw.replace(/\s/g, "").replace(",", "."));
    if (isNaN(parsed) || parsed < 0 || parsed > total) {
      // Reset
      setEditing((p) => { const n = { ...p }; delete n[cat]; return n; });
      return;
    }
    setSaving(cat);
    try {
      await invokeTauri("set_dette_age", { year, category: cat, moins1An: parsed });
      onUpdate();
    } finally {
      setSaving(null);
      setEditing((p) => { const n = { ...p }; delete n[cat]; return n; });
    }
  };

  const totals = dettes.reduce(
    (acc, d) => ({
      total: acc.total + d.total,
      moins_1_an: acc.moins_1_an + d.moins_1_an,
      plus_1_an: acc.plus_1_an + d.plus_1_an,
    }),
    { total: 0, moins_1_an: 0, plus_1_an: 0 }
  );

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-5">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-white mb-4 flex items-center gap-2">
        <span>📅</span> Tableau des dettes par âge — {year}
      </h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 italic">
        Saisir la partie courante (&lt; 1 an) pour chaque poste. Le reste est classé en DLMT (&gt; 1 an).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-700">
              <th className="text-left py-2 px-3 font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                Désignation
              </th>
              <th className="text-right py-2 px-3 font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                Total
              </th>
              <th className="text-right py-2 px-3 font-semibold text-emerald-600 dark:text-emerald-400 border border-slate-200 dark:border-slate-600">
                Moins d'1 an (à saisir)
              </th>
              <th className="text-right py-2 px-3 font-semibold text-blue-600 dark:text-blue-400 border border-slate-200 dark:border-slate-600">
                Plus d'1 an
              </th>
            </tr>
          </thead>
          <tbody>
            {dettes.map((d) => {
              const editVal = editing[d.category];
              const isSaving = saving === d.category;
              return (
                <tr
                  key={d.category}
                  className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30"
                >
                  <td className="py-2 px-3 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300">
                    {d.label}
                  </td>
                  <td className="py-2 px-3 border border-slate-200 dark:border-slate-600 text-right font-mono text-slate-700 dark:text-slate-300">
                    {fmt(d.total)}
                  </td>
                  <td className="py-1 px-2 border border-slate-200 dark:border-slate-600">
                    <input
                      type="text"
                      className={`w-full text-right font-mono px-2 py-1 rounded border ${
                        isSaving
                          ? "bg-yellow-50 dark:bg-yellow-900/20"
                          : "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
                      } focus:outline-none focus:ring-2 focus:ring-emerald-400 text-emerald-800 dark:text-emerald-300`}
                      value={editVal !== undefined ? editVal : fmt(d.moins_1_an)}
                      onChange={(e) => handleChange(d.category, e.target.value)}
                      onBlur={() => handleBlur(d.category, d.total)}
                      onFocus={(e) => {
                        handleChange(d.category, String(d.moins_1_an));
                        e.target.select();
                      }}
                    />
                  </td>
                  <td className="py-2 px-3 border border-slate-200 dark:border-slate-600 text-right font-mono text-blue-700 dark:text-blue-400">
                    {fmt(d.plus_1_an)}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-slate-100 dark:bg-slate-700 font-bold">
              <td className="py-2 px-3 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white">
                TOTAL
              </td>
              <td className="py-2 px-3 border border-slate-200 dark:border-slate-600 text-right font-mono text-slate-800 dark:text-white">
                {fmt(totals.total)}
              </td>
              <td className="py-2 px-3 border border-slate-200 dark:border-slate-600 text-right font-mono text-emerald-700 dark:text-emerald-300">
                {fmt(totals.moins_1_an)}
              </td>
              <td className="py-2 px-3 border border-slate-200 dark:border-slate-600 text-right font-mono text-blue-700 dark:text-blue-300">
                {fmt(totals.plus_1_an)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Sub-component: Bilan Fonctionnel Table ────────────────────────────────────

function BFTable({ bf }: { bf: BilanFonctionnelData }) {
  const actifRows = [
    { label: "Actifs Fixes (Brut)", value: bf.actifs_fixes, pct: bf.pct_actifs_fixes, color: "text-blue-700 dark:text-blue-300", bg: "bg-blue-50 dark:bg-blue-900/20" },
    { label: "Actifs Circulants (Brut)", value: bf.actifs_circulants, pct: bf.pct_actifs_circulants, color: "text-indigo-700 dark:text-indigo-300", bg: "bg-indigo-50 dark:bg-indigo-900/20" },
    { label: "Disponibilités", value: bf.disponibilites, pct: bf.pct_disponibilites, color: "text-cyan-700 dark:text-cyan-300", bg: "bg-cyan-50 dark:bg-cyan-900/20" },
  ];
  const passifRows = [
    { label: "Capitaux Propres", value: bf.capitaux_propres, pct: bf.pct_cp, color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
    { label: "D.L.M.T. (> 1 an)", value: bf.dlmt, pct: bf.pct_dlmt, color: "text-orange-700 dark:text-orange-300", bg: "bg-orange-50 dark:bg-orange-900/20" },
    { label: "D.C.T. (< 1 an)", value: bf.dct, pct: bf.pct_dct, color: "text-rose-700 dark:text-rose-300", bg: "bg-rose-50 dark:bg-rose-900/20" },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* ACTIF */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
        <div className="bg-blue-600 px-4 py-2">
          <h4 className="text-white font-bold text-sm tracking-wide">ACTIF</h4>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-700">
              <th className="text-left py-2 px-3 text-slate-600 dark:text-slate-300 font-semibold">Libellé</th>
              <th className="text-right py-2 px-3 text-slate-600 dark:text-slate-300 font-semibold">Montant</th>
              <th className="text-right py-2 px-3 text-slate-600 dark:text-slate-300 font-semibold">%</th>
            </tr>
          </thead>
          <tbody>
            {actifRows.map((r) => (
              <tr key={r.label} className={r.bg}>
                <td className={`py-2.5 px-3 font-medium ${r.color}`}>{r.label}</td>
                <td className={`py-2.5 px-3 text-right font-mono font-semibold ${r.color}`}>{fmt(r.value)}</td>
                <td className={`py-2.5 px-3 text-right ${r.color}`}>{pct(r.pct)}</td>
              </tr>
            ))}
            <tr className="bg-blue-600">
              <td className="py-2.5 px-3 font-bold text-white">TOTAL ACTIF</td>
              <td className="py-2.5 px-3 text-right font-mono font-bold text-white">{fmt(bf.total_actif_bf)}</td>
              <td className="py-2.5 px-3 text-right text-white">100%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* PASSIF */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
        <div className="bg-emerald-600 px-4 py-2">
          <h4 className="text-white font-bold text-sm tracking-wide">PASSIF</h4>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-700">
              <th className="text-left py-2 px-3 text-slate-600 dark:text-slate-300 font-semibold">Libellé</th>
              <th className="text-right py-2 px-3 text-slate-600 dark:text-slate-300 font-semibold">Montant</th>
              <th className="text-right py-2 px-3 text-slate-600 dark:text-slate-300 font-semibold">%</th>
            </tr>
          </thead>
          <tbody>
            {passifRows.map((r) => (
              <tr key={r.label} className={r.bg}>
                <td className={`py-2.5 px-3 font-medium ${r.color}`}>{r.label}</td>
                <td className={`py-2.5 px-3 text-right font-mono font-semibold ${r.color}`}>{fmt(r.value)}</td>
                <td className={`py-2.5 px-3 text-right ${r.color}`}>{pct(r.pct)}</td>
              </tr>
            ))}
            <tr className="bg-emerald-600">
              <td className="py-2.5 px-3 font-bold text-white">TOTAL PASSIF</td>
              <td className="py-2.5 px-3 text-right font-mono font-bold text-white">{fmt(bf.total_passif_bf)}</td>
              <td className="py-2.5 px-3 text-right text-white">100%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Sub-component: Histogram ──────────────────────────────────────────────────

function BFHistogram({ bf }: { bf: BilanFonctionnelData }) {
  const M = 1_000_000;

  const data = [
    {
      name: "ACTIF",
      "Actifs Fixes": bf.actifs_fixes / M,
      "Actifs Circulants": bf.actifs_circulants / M,
      "Disponibilités": bf.disponibilites / M,
    },
    {
      name: "PASSIF",
      "Capitaux Propres": bf.capitaux_propres / M,
      "D.L.M.T.": bf.dlmt / M,
      "D.C.T.": bf.dct / M,
    },
  ];

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-5">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-white mb-4 flex items-center gap-2">
        <span>📊</span> Histogramme — Bilan Fonctionnel (M DA) — {bf.year}
      </h3>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 10 }} barGap={20}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="name" tick={{ fontSize: 13, fontWeight: 600 }} />
          <YAxis tickFormatter={(v) => `${v}M`} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => [`${Number(v ?? 0).toFixed(2)} M DA`]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {/* ACTIF bars */}
          <Bar dataKey="Actifs Fixes" fill="#3b82f6" radius={[4, 4, 0, 0]} stackId="actif" />
          <Bar dataKey="Actifs Circulants" fill="#818cf8" radius={[4, 4, 0, 0]} stackId="actif" />
          <Bar dataKey="Disponibilités" fill="#06b6d4" radius={[4, 4, 0, 0]} stackId="actif" />
          {/* PASSIF bars */}
          <Bar dataKey="Capitaux Propres" fill="#10b981" radius={[4, 4, 0, 0]} stackId="passif" />
          <Bar dataKey="D.L.M.T." fill="#f97316" radius={[4, 4, 0, 0]} stackId="passif" />
          <Bar dataKey="D.C.T." fill="#ef4444" radius={[4, 4, 0, 0]} stackId="passif" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  companySwitchKey: number;
}

export default function BilanFonctionnel({ companySwitchKey }: Props) {
  const [years, setYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(0);
  const [dettes, setDettes] = useState<DetteAge[]>([]);
  const [bf, setBf] = useState<BilanFonctionnelData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (year: number) => {
    if (!year) return;
    setLoading(true);
    setError(null);
    try {
      const [dettesData, bfData] = await Promise.all([
        invokeTauri<DetteAge[]>("get_dettes_par_age", { year }),
        invokeTauri<BilanFonctionnelData>("get_bilan_fonctionnel", { year }),
      ]);
      setDettes(dettesData);
      setBf(bfData);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    invokeTauri<number[]>("get_years").then((yrs) => {
      setYears(yrs);
      if (yrs.length > 0) {
        const y = yrs[yrs.length - 1];
        setSelectedYear(y);
        load(y);
      }
    });
  }, [companySwitchKey, load]);

  const handleDettesUpdate = () => load(selectedYear);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">Chargement…</div>
    );
  }
  if (error) {
    return <div className="p-4 text-red-600">Erreur: {error}</div>;
  }

  return (
    <div className="space-y-6 px-4 py-4">
      {/* Year selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Exercice :</label>
        <div className="flex gap-1">
          {years.map((y) => (
            <button
              key={y}
              onClick={() => { setSelectedYear(y); load(y); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedYear === y
                  ? "bg-blue-600 text-white shadow"
                  : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* Dettes par âge table */}
      {dettes.length > 0 && (
        <DettesParAge year={selectedYear} dettes={dettes} onUpdate={handleDettesUpdate} />
      )}

      {/* Bilan Fonctionnel table */}
      {bf && (
        <>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-5">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-white mb-4 flex items-center gap-2">
              <span>⚖️</span> Bilan Fonctionnel — {bf.year}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1">
                (retraitements automatisés : amort. immo {fmt(bf.amort_anc)} · prov. stocks {fmt(bf.prov_stocks)} · prov. créances {fmt(bf.prov_creances)})
              </span>
            </h3>
            <BFTable bf={bf} />
          </div>

          {/* Histogram */}
          <BFHistogram bf={bf} />
        </>
      )}

      {!bf && !loading && (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-8 text-center text-slate-500 dark:text-slate-400 border border-slate-100 dark:border-slate-700">
          Aucune donnée pour l'exercice {selectedYear}. Importez d'abord les états financiers.
        </div>
      )}
    </div>
  );
}
