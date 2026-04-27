import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { SheetData } from "../types";
import { val } from "../lib/ratios";

interface Props {
  actif: SheetData;
  passif: SheetData;
  tr: SheetData;
}

const M = 1_000_000;
const fmtM = (n: number) =>
  (n / M).toFixed(2) + " M DA";

export default function Dashboard({ actif, passif, tr }: Props) {
  const years = actif.years;

  // Build chart data per year
  const revenueData = years.map((y) => ({
    year: String(y),
    "Chiffre d'Affaires": val(tr, "ventes", y) / M,
    "Production": val(tr, "production", y) / M,
    "Valeur Ajoutée": val(tr, "valeur_ajoutee", y) / M,
  }));

  const resultatData = years.map((y) => ({
    year: String(y),
    "EBE": val(tr, "ebe", y) / M,
    "Rés. Opérationnel": val(tr, "res_op", y) / M,
    "Rés. Net": val(tr, "res_net", y) / M,
  }));

  const bilanData = years.map((y) => ({
    year: String(y),
    "Actif Non Courant": val(actif, "total_anc", y) / M,
    "Actif Courant": val(actif, "total_ac", y) / M,
  }));

  const frBfrData = years.map((y) => {
    const anc = val(actif, "total_anc", y);
    const ac = val(actif, "total_ac", y);
    const stocks = val(actif, "stocks", y);
    const tres = val(actif, "tres_actif", y) + val(actif, "placements", y);
    const cp = val(passif, "total_cp", y);
    const pnc = val(passif, "total_pnc", y);
    const four = val(passif, "fournisseurs", y);
    const impP = val(passif, "impots_pc", y);
    const autDette = val(passif, "autres_dettes_c", y);
    const creances = ac - stocks - tres;
    const fr = (cp + pnc - anc) / M;
    const bfr = (stocks + creances - four - impP - autDette) / M;
    return { year: String(y), "FR": fr, "BFR": bfr, "TN": fr - bfr };
  });

  // KPI cards from last year
  const lastYear = years[years.length - 1] ?? years[0];
  const kpis = lastYear ? [
    { label: "Chiffre d'Affaires", value: fmtM(val(tr, "ventes", lastYear)), color: "bg-blue-500" },
    { label: "Valeur Ajoutée", value: fmtM(val(tr, "valeur_ajoutee", lastYear)), color: "bg-emerald-500" },
    { label: "EBE", value: fmtM(val(tr, "ebe", lastYear)), color: "bg-purple-500" },
    { label: "Résultat Net", value: fmtM(val(tr, "res_net", lastYear)), color: "bg-orange-500" },
    { label: "Total Actif", value: fmtM(val(actif, "total_actif", lastYear)), color: "bg-slate-500" },
    { label: "Capitaux Propres", value: fmtM(val(passif, "total_cp", lastYear)), color: "bg-teal-500" },
  ] : [];

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
            <div className={`w-2 h-2 rounded-full ${k.color} mb-2`} />
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-tight">{k.label}</p>
            <p className="text-sm font-bold text-slate-800 dark:text-white mt-1">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Revenue & Production chart */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-white mb-4">
          Évolution du Chiffre d'Affaires & Valeur Ajoutée (M DA)
        </h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={revenueData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}M`} />
            <Tooltip formatter={(v: any) => [`${Number(v).toFixed(2)} M DA`]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Chiffre d'Affaires" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Valeur Ajoutée" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Résultats chart */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-white mb-4">
          Résultats de l'Exercice (M DA)
        </h3>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={resultatData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}M`} />
            <Tooltip formatter={(v: any) => [`${Number(v).toFixed(2)} M DA`]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="EBE" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="Rés. Opérationnel" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="Rés. Net" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* FR / BFR / TN chart */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-white mb-4">
          Fonds de Roulement — BFR — Trésorerie Nette (M DA)
        </h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={frBfrData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}M`} />
            <Tooltip formatter={(v: any) => [`${Number(v).toFixed(2)} M DA`]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="FR" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="BFR" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            <Bar dataKey="TN" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Structure de Bilan */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-white mb-4">
          Structure de l'Actif (M DA)
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={bilanData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}M`} />
            <Tooltip formatter={(v: any) => [`${Number(v).toFixed(2)} M DA`]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Actif Non Courant" stackId="a" fill="#6366f1" />
            <Bar dataKey="Actif Courant" stackId="a" fill="#a5b4fc" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
