import type { SheetData } from "../types";
import { computeRatios, type Ratios } from "../lib/ratios";

interface Props {
  actif: SheetData;
  passif: SheetData;
  tr: SheetData;
}

const pct = (n: number) => `${n.toFixed(2)} %`;
const da = (n: number) =>
  new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 0 }).format(Math.round(n)) + " DA";
const ratio = (n: number) => n.toFixed(3);

type Status = "good" | "warning" | "bad" | "neutral";

function badge(status: Status) {
  const cls =
    status === "good"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
      : status === "warning"
      ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
      : status === "bad"
      ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
      : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400";
  const label =
    status === "good" ? "✓ Bon" : status === "warning" ? "⚠ Moyen" : status === "bad" ? "✗ Faible" : "—";
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>;
}

interface RatioRow {
  name: string;
  formula: string;
  value: string;
  norme: string;
  status: Status;
}

function buildRows(r: Ratios): RatioRow[] {
  return [
    {
      name: "Fonds de Roulement (FR)",
      formula: "CP + PNC − ANC",
      value: da(r.fr),
      norme: "> 0",
      status: r.fr > 0 ? "good" : "bad",
    },
    {
      name: "Besoin en FDR (BFR)",
      formula: "Stocks + Créances − Dettes CT",
      value: da(r.bfr),
      norme: "< FR",
      status: r.bfr < r.fr ? "good" : r.bfr < 0 ? "good" : "warning",
    },
    {
      name: "Trésorerie Nette (TN)",
      formula: "FR − BFR",
      value: da(r.tn),
      norme: "> 0",
      status: r.tn > 0 ? "good" : "bad",
    },
    {
      name: "Liquidité Générale",
      formula: "Actif Courant / Passif Courant",
      value: ratio(r.liquiditeG),
      norme: "> 1",
      status: r.liquiditeG > 1.5 ? "good" : r.liquiditeG > 1 ? "warning" : "bad",
    },
    {
      name: "Liquidité Réduite",
      formula: "(AC − Stocks) / Passif Courant",
      value: ratio(r.liquiditeR),
      norme: "> 0.8",
      status: r.liquiditeR > 1 ? "good" : r.liquiditeR > 0.8 ? "warning" : "bad",
    },
    {
      name: "Autonomie Financière",
      formula: "Capitaux Propres / Total Passif",
      value: pct(r.autonomie),
      norme: "> 30 %",
      status: r.autonomie > 50 ? "good" : r.autonomie > 30 ? "warning" : "bad",
    },
    {
      name: "Taux d'Endettement",
      formula: "(PNC + PC) / Total Passif",
      value: pct(r.endettement),
      norme: "< 70 %",
      status: r.endettement < 50 ? "good" : r.endettement < 70 ? "warning" : "bad",
    },
    {
      name: "Solvabilité Générale",
      formula: "Total Actif / Total Dettes",
      value: ratio(r.solvabilite),
      norme: "> 1",
      status: r.solvabilite > 1.5 ? "good" : r.solvabilite > 1 ? "warning" : "bad",
    },
    {
      name: "ROE — Rentabilité FP",
      formula: "Résultat Net / Capitaux Propres",
      value: pct(r.roe),
      norme: "> 10 %",
      status: r.roe > 10 ? "good" : r.roe > 0 ? "warning" : "bad",
    },
    {
      name: "ROA — Rentabilité Actif",
      formula: "Résultat Net / Total Actif",
      value: pct(r.roa),
      norme: "> 5 %",
      status: r.roa > 5 ? "good" : r.roa > 0 ? "warning" : "bad",
    },
    {
      name: "Marge Nette",
      formula: "Résultat Net / Ventes",
      value: pct(r.margeNette),
      norme: "> 5 %",
      status: r.margeNette > 5 ? "good" : r.margeNette > 0 ? "warning" : "bad",
    },
    {
      name: "Taux de Valeur Ajoutée",
      formula: "VA / Production",
      value: pct(r.tauxVA),
      norme: "> 40 %",
      status: r.tauxVA > 40 ? "good" : r.tauxVA > 20 ? "warning" : "bad",
    },
    {
      name: "Productivité du Personnel",
      formula: "VA / Charges de Personnel",
      value: ratio(r.productivitePerso),
      norme: "> 1",
      status: r.productivitePerso > 1 ? "good" : r.productivitePerso > 0.8 ? "warning" : "bad",
    },
    {
      name: "EBE / CA",
      formula: "EBE / Ventes",
      value: pct(r.ebeCA),
      norme: "> 10 %",
      status: r.ebeCA > 10 ? "good" : r.ebeCA > 0 ? "warning" : "bad",
    },
  ];
}

export default function RatiosFinanciers({ actif, passif, tr }: Props) {
  const years = actif.years;

  return (
    <div className="space-y-4">
      {years.map((year) => {
        const r = computeRatios(actif, passif, tr, year);
        const rows = buildRows(r);
        return (
          <div key={year} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700">
              <h3 className="text-sm font-bold text-slate-700 dark:text-white">
                Ratios Financiers — Exercice {year}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
                    <th className="text-left px-4 py-2 font-medium">Ratio</th>
                    <th className="text-left px-4 py-2 font-medium">Formule</th>
                    <th className="text-right px-4 py-2 font-medium">Valeur</th>
                    <th className="text-center px-4 py-2 font-medium">Norme</th>
                    <th className="text-center px-4 py-2 font-medium">Appréciation</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.name}
                      className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-200">{row.name}</td>
                      <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 font-mono text-xs">{row.formula}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-slate-800 dark:text-white tabular-nums">{row.value}</td>
                      <td className="px-4 py-2.5 text-center text-slate-500 dark:text-slate-400">{row.norme}</td>
                      <td className="px-4 py-2.5 text-center">{badge(row.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
