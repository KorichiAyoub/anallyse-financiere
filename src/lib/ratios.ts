import type { SheetData } from "../types";

/** Extract a computed/stored value by entry_key for a given year from a sheet */
export function val(sheet: SheetData, key: string, year: number): number {
  const entry = sheet.entries.find((e) => e.entry_key === key);
  if (!entry) return 0;
  return (entry.values[String(year)] ?? 0) ?? 0;
}

export interface Ratios {
  fr: number;       // Fonds de Roulement
  bfr: number;      // Besoin en Fonds de Roulement
  tn: number;       // Trésorerie Nette
  liquiditeG: number;   // Liquidité Générale
  liquiditeR: number;   // Liquidité Réduite
  autonomie: number;    // Autonomie Financière (%)
  endettement: number;  // Taux d'Endettement (%)
  solvabilite: number;  // Solvabilité Générale
  roe: number;          // ROE (%)
  roa: number;          // ROA (%)
  margeNette: number;   // Marge Nette (%)
  tauxVA: number;       // Taux de Valeur Ajoutée (%)
  productivitePerso: number; // Productivité Personnel
  ebeCA: number;        // EBE / CA (%)
}

export function computeRatios(
  actif: SheetData,
  passif: SheetData,
  tr: SheetData,
  year: number,
): Ratios {
  const a = (k: string) => val(actif, k, year);
  const p = (k: string) => val(passif, k, year);
  const t = (k: string) => val(tr, k, year);

  const totalAnc = a("total_anc");
  const totalAc = a("total_ac");
  const stocks = a("stocks");
  const tresorActif = a("tres_actif") + a("placements");

  const totalCp = p("total_cp");
  const totalPnc = p("total_pnc");
  const totalPc = p("total_pc");
  const totalPassif = p("total_passif") || p("total_cp") + p("total_pnc") + p("total_pc");
  const fournisseurs = p("fournisseurs");
  const impotsPc = p("impots_pc");
  const autresDettesC = p("autres_dettes_c");

  const ventes = t("ventes");
  const production = t("production");
  const va = t("valeur_ajoutee");
  const ebe = t("ebe");
  const resNet = t("res_net");
  const chargesPerso = t("charges_pers");

  const totalActif = a("total_actif") || totalAnc + totalAc;
  const totalDettes = totalPnc + totalPc;

  const creances = totalAc - stocks - tresorActif;
  const fr = totalCp + totalPnc - totalAnc;
  const bfr = stocks + creances - (fournisseurs + impotsPc + autresDettesC);
  const tn = fr - bfr;

  const safe = (num: number, den: number) =>
    den !== 0 ? num / den : 0;

  return {
    fr,
    bfr,
    tn,
    liquiditeG: safe(totalAc, totalPc),
    liquiditeR: safe(totalAc - stocks, totalPc),
    autonomie: safe(totalCp, totalPassif) * 100,
    endettement: safe(totalDettes, totalPassif) * 100,
    solvabilite: safe(totalActif, totalDettes),
    roe: safe(resNet, totalCp) * 100,
    roa: safe(resNet, totalActif) * 100,
    margeNette: safe(resNet, ventes) * 100,
    tauxVA: safe(va, production) * 100,
    productivitePerso: safe(va, chargesPerso),
    ebeCA: safe(ebe, ventes) * 100,
  };
}
