import type { SheetData } from "../types";
import { computeRatios, type Ratios } from "../lib/ratios";

interface Props {
  actif: SheetData;
  passif: SheetData;
  tr: SheetData;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

const fmtPct  = (n: number) => isFinite(n) ? `${n.toFixed(2)} %` : "N/A";
const fmtDA   = (n: number) => isFinite(n)
  ? new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 0 }).format(Math.round(n)) + " DA"
  : "N/A";
const fmtNum  = (n: number, dec = 3) => isFinite(n) ? n.toFixed(dec) : "N/A";
const fmtDays = (n: number) => isFinite(n) ? `${Math.round(n)} j` : "N/A";

type Status = "good" | "warning" | "bad" | "neutral";

function Badge({ status }: { status: Status }) {
  const cfg: Record<Status, { cls: string; label: string }> = {
    good:    { cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", label: "✓ Bon" },
    warning: { cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",   label: "⚠ Moyen" },
    bad:     { cls: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",               label: "✗ Faible" },
    neutral: { cls: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400",          label: "—" },
  };
  const { cls, label } = cfg[status];
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>;
}

// ── Row type ──────────────────────────────────────────────────────────────────

interface RatioRow {
  name: string;
  formula: string;
  value: string;
  norme: string;
  status: Status;
  note?: string;
}

// ── Section ───────────────────────────────────────────────────────────────────

interface Section {
  title: string;
  color: string;
  rows: RatioRow[];
}

function buildSections(r: Ratios): Section[] {
  return [
    // ── 1. RATIOS DE STRUCTURE ──────────────────────────────────────────────
    {
      title: "Ratios de structure",
      color: "bg-blue-600",
      rows: [
        {
          name: "Financement des immobilisations",
          formula: "(CP + PNC) / ANC",
          value: fmtNum(r.structure.financementImmob, 3),
          norme: "> 1",
          status: r.structure.financementImmob > 1 ? "good" : "bad",
          note: "Les ressources stables doivent financer les actifs LT",
        },
        {
          name: "Immobilisation de l'actif",
          formula: "ANC / Total Actif",
          value: fmtPct(r.structure.immobilisationActif),
          norme: "Sectoriel",
          status: "neutral",
          note: "Part des actifs immobilisés dans l'actif total",
        },
        {
          name: "Liquidité de l'actif",
          formula: "AC / Total Actif",
          value: fmtPct(r.structure.liquiditeActif),
          norme: "Sectoriel",
          status: "neutral",
          note: "Vision inverse du ratio d'immobilisation",
        },
      ],
    },

    // ── 2. RENDEMENT / RENTABILITÉ / MARGE ──────────────────────────────────
    {
      title: "Ratios de rendement, de rentabilité et de marge",
      color: "bg-violet-600",
      rows: [
        {
          name: "Marge brute d'exploitation (EBE / CA)",
          formula: "EBE / Chiffre d'Affaires",
          value: fmtPct(r.rentabilite.margeBruteExpl),
          norme: "> 10 %",
          status: r.rentabilite.margeBruteExpl > 10 ? "good"
                : r.rentabilite.margeBruteExpl > 0  ? "warning" : "bad",
          note: "Rentabilité brute de l'exploitation",
        },
        {
          name: "Marge opérationnelle (ROS)",
          formula: "Résultat opérationnel / CA",
          value: fmtPct(r.rentabilite.margeOperationnelle),
          norme: "> 5 %",
          status: r.rentabilite.margeOperationnelle > 5 ? "good"
                : r.rentabilite.margeOperationnelle > 0 ? "warning" : "bad",
          note: "Rentabilité économique de l'exploitation",
        },
        {
          name: "Marge nette",
          formula: "Résultat net / CA",
          value: fmtPct(r.rentabilite.margeNette),
          norme: "> 5 %",
          status: r.rentabilite.margeNette > 5 ? "good"
                : r.rentabilite.margeNette > 0 ? "warning" : "bad",
          note: "Rentabilité nette de l'établissement",
        },
        {
          name: "Taux de Valeur Ajoutée",
          formula: "VA / Production de l'exercice",
          value: fmtPct(r.rentabilite.tauxVA),
          norme: "> 40 %",
          status: r.rentabilite.tauxVA > 40 ? "good"
                : r.rentabilite.tauxVA > 20 ? "warning" : "bad",
        },
        {
          name: "Productivité du capital",
          formula: "VA / Total Bilan",
          value: fmtNum(r.rentabilite.productiviteCapital, 3),
          norme: "Sectoriel",
          status: "neutral",
        },
        {
          name: "Rémunération du travail",
          formula: "Charges de personnel / VA",
          value: fmtPct(r.rentabilite.remunerationTravail),
          norme: "< 70 %",
          status: r.rentabilite.remunerationTravail < 70 ? "good"
                : r.rentabilite.remunerationTravail < 85 ? "warning" : "bad",
          note: "Part de la valeur ajoutée attribuée aux employés",
        },
        {
          name: "ROE — Rendement des capitaux propres",
          formula: "Résultat net / Capitaux propres",
          value: fmtPct(r.rentabilite.roe),
          norme: "> 10 %",
          status: r.rentabilite.roe > 10 ? "good"
                : r.rentabilite.roe > 0  ? "warning" : "bad",
          note: "Rentabilité des capitaux apportés",
        },
        {
          name: "ROA — Rentabilité économique",
          formula: "Résultat net / Total Actif",
          value: fmtPct(r.rentabilite.roa),
          norme: "> 5 %",
          status: r.rentabilite.roa > 5 ? "good"
                : r.rentabilite.roa > 0 ? "warning" : "bad",
          note: "Rentabilité des moyens utilisés",
        },
        {
          name: "Rentabilité de l'activité",
          formula: "CAF / Chiffre d'Affaires",
          value: fmtPct(r.rentabilite.rentabiliteActivite),
          norme: "> 5 %",
          status: r.rentabilite.rentabiliteActivite > 5 ? "good"
                : r.rentabilite.rentabiliteActivite > 0 ? "warning" : "bad",
          note: "CAF = Résultat net + Dotations aux amortissements et provisions",
        },
      ],
    },

    // ── 3. ÉQUILIBRE FINANCIER ──────────────────────────────────────────────
    {
      title: "Équilibre financier — FRNG / BFR / Trésorerie nette",
      color: "bg-teal-600",
      rows: [
        {
          name: "Fonds de Roulement Net Global (FRNG)",
          formula: "(CP + PNC) − ANC",
          value: fmtDA(r.equilibre.fr),
          norme: "> 0",
          status: r.equilibre.fr > 0 ? "good" : "bad",
          note: "Excédent de capitaux stables par rapport aux emplois durables",
        },
        {
          name: "Besoin en Fonds de Roulement (BFR)",
          formula: "Stocks + Créances − Dettes CT exploitation",
          value: fmtDA(r.equilibre.bfr),
          norme: "< FRNG",
          status: r.equilibre.bfr < r.equilibre.fr ? "good"
                : r.equilibre.bfr < 0 ? "good" : "warning",
          note: "BFR = BFRE + BFRHE",
        },
        {
          name: "Trésorerie Nette (TN)",
          formula: "FRNG − BFR",
          value: fmtDA(r.equilibre.tn),
          norme: "> 0",
          status: r.equilibre.tn > 0 ? "good" : "bad",
          note: "Positive : capitaux permanents financent l'actif circulant de tréso",
        },
      ],
    },

    // ── 4. SOLVABILITÉ / LIQUIDITÉ / ENDETTEMENT ───────────────────────────
    {
      title: "Ratios de solvabilité, de liquidité et d'endettement",
      color: "bg-orange-600",
      rows: [
        {
          name: "Autonomie financière",
          formula: "Capitaux propres / Total Bilan",
          value: fmtPct(r.solvabilite.autonomieFinanciere),
          norme: "> 20 %",
          status: r.solvabilite.autonomieFinanciere > 30 ? "good"
                : r.solvabilite.autonomieFinanciere > 20 ? "warning" : "bad",
          note: "Part des financements propres ; correct à partir de 20 %",
        },
        {
          name: "Capacité de remboursement",
          formula: "Dette nette / EBE",
          value: fmtNum(r.solvabilite.capaciteRemboursement, 2),
          norme: "< 3",
          status: r.solvabilite.capaciteRemboursement < 3 ? "good"
                : r.solvabilite.capaciteRemboursement < 5 ? "warning" : "bad",
          note: "Dette nette = Emprunts + Tréso passif − Tréso active",
        },
        {
          name: "Endettement net (Net Gearing)",
          formula: "Dette nette / Capitaux propres",
          value: fmtNum(r.solvabilite.endettementNet, 2),
          norme: "< 1",
          status: r.solvabilite.endettementNet < 1 ? "good"
                : r.solvabilite.endettementNet < 2 ? "warning" : "bad",
        },
        {
          name: "Endettement brut (Gross Gearing)",
          formula: "(PNC + PC) / Capitaux propres",
          value: fmtNum(r.solvabilite.endettementBrut, 2),
          norme: "< 1",
          status: r.solvabilite.endettementBrut < 1 ? "good"
                : r.solvabilite.endettementBrut < 2 ? "warning" : "bad",
          note: "Estimation du niveau d'endettement",
        },
        {
          name: "Indépendance financière à long terme",
          formula: "Capitaux propres / Capitaux stables",
          value: fmtPct(r.solvabilite.independanceLT),
          norme: "> 50 %",
          status: r.solvabilite.independanceLT > 50 ? "good"
                : r.solvabilite.independanceLT > 30 ? "warning" : "bad",
          note: "Capitaux stables = CP + PNC",
        },
        {
          name: "Indépendance financière",
          formula: "Capitaux propres / Emprunts",
          value: fmtNum(r.solvabilite.independanceFinanciere, 2),
          norme: "> 1",
          status: r.solvabilite.independanceFinanciere > 1 ? "good"
                : r.solvabilite.independanceFinanciere > 0.5 ? "warning" : "bad",
        },
        {
          name: "Liquidité générale",
          formula: "Actif Courant / Passif Courant",
          value: fmtNum(r.solvabilite.liquiditeGenerale, 3),
          norme: "> 1",
          status: r.solvabilite.liquiditeGenerale > 1.5 ? "good"
                : r.solvabilite.liquiditeGenerale > 1   ? "warning" : "bad",
          note: "Capacité à régler ses dettes à CT ; > 1 : entreprise solvable",
        },
        {
          name: "Liquidité réduite",
          formula: "(AC − Stocks) / Passif Courant",
          value: fmtNum(r.solvabilite.liquiditeReduite, 3),
          norme: "> 0.8",
          status: r.solvabilite.liquiditeReduite > 1   ? "good"
                : r.solvabilite.liquiditeReduite > 0.8 ? "warning" : "bad",
        },
      ],
    },

    // ── 5. RATIOS DE ROTATION ───────────────────────────────────────────────
    {
      title: "Ratios de rotation",
      color: "bg-rose-600",
      rows: [
        {
          name: "Délai moyen des encaissements clients",
          formula: "Clients × 360 / CA",
          value: fmtDays(r.rotation.delaiClients),
          norme: "< 60 j",
          status: r.rotation.delaiClients < 45 ? "good"
                : r.rotation.delaiClients < 60 ? "warning" : "bad",
          note: "Délai moyen de paiement accordé aux clients",
        },
        {
          name: "Délai moyen des règlements fournisseurs",
          formula: "Fournisseurs × 360 / Achats",
          value: fmtDays(r.rotation.delaiFournisseurs),
          norme: "30–90 j",
          status: r.rotation.delaiFournisseurs > 30 && r.rotation.delaiFournisseurs < 90 ? "good"
                : r.rotation.delaiFournisseurs < 120 ? "warning" : "bad",
          note: "Délai moyen de paiement des fournisseurs",
        },
        {
          name: "Rotation du BFR",
          formula: "BFR × 360 / CA",
          value: fmtDays(r.rotation.rotationBFR),
          norme: "< 60 j",
          status: r.rotation.rotationBFR < 60 ? "good"
                : r.rotation.rotationBFR < 90 ? "warning" : "bad",
          note: "Fonds mobilisés par le cycle d'exploitation",
        },
      ],
    },
  ];
}

// ── Section table ─────────────────────────────────────────────────────────────

function SectionTable({ section }: { section: Section }) {
  return (
    <div className="rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
      <div className={`${section.color} px-5 py-2.5`}>
        <h4 className="text-white font-bold text-sm tracking-wide">{section.title}</h4>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
              <th className="text-left px-4 py-2 font-medium w-72">Ratio</th>
              <th className="text-left px-4 py-2 font-medium">Formule</th>
              <th className="text-right px-4 py-2 font-medium w-36">Valeur</th>
              <th className="text-center px-4 py-2 font-medium w-28">Norme</th>
              <th className="text-center px-4 py-2 font-medium w-24">Appréciation</th>
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row) => (
              <tr
                key={row.name}
                className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
              >
                <td className="px-4 py-2.5">
                  <div className="font-medium text-slate-700 dark:text-slate-200">{row.name}</div>
                  {row.note && (
                    <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 italic">{row.note}</div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 font-mono text-xs">{row.formula}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-slate-800 dark:text-white tabular-nums">{row.value}</td>
                <td className="px-4 py-2.5 text-center text-slate-500 dark:text-slate-400 text-xs">{row.norme}</td>
                <td className="px-4 py-2.5 text-center"><Badge status={row.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RatiosFinanciers({ actif, passif, tr }: Props) {
  const years = actif.years;

  return (
    <div className="space-y-8">
      {years.map((year) => {
        const r = computeRatios(actif, passif, tr, year);
        const sections = buildSections(r);
        return (
          <div key={year} className="space-y-4">
            <h3 className="text-base font-bold text-slate-700 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2 px-1">
              Exercice {year}
            </h3>
            {sections.map((section) => (
              <SectionTable key={section.title} section={section} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

