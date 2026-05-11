import type { SheetData } from "../types";

/** Extract a computed/stored value by entry_key for a given year from a sheet */
export function val(sheet: SheetData, key: string, year: number): number {
  const entry = sheet.entries.find((e) => e.entry_key === key);
  if (!entry) return 0;
  return (entry.values[String(year)] ?? 0) ?? 0;
}

// ── Ratios de structure ────────────────────────────────────────────────────────
export interface RatiosStructure {
  financementImmob: number;   // Capitaux stables / Immo nettes (> 1)
  immobilisationActif: number; // ANC / Total Actif (%)
  liquiditeActif: number;     // AC / Total Actif (%)
}

// ── Ratios de rendement, rentabilité, marge ───────────────────────────────────
export interface RatiosRentabilite {
  margeBruteExpl: number;   // EBE / CA (%)
  margeOperationnelle: number; // Résultat opérationnel / CA (%)
  margeNette: number;        // Résultat net / CA (%)
  productiviteCapital: number; // VA / Total Bilan
  remunerationTravail: number; // Charges personnel / VA (%)
  roe: number;               // Résultat net / CP (%)
  roa: number;               // Résultat net / Total Actif (%)
  rentabiliteActivite: number; // CAF / CA (%)
  tauxVA: number;            // VA / Production (%)
}

// ── Équilibre financier ────────────────────────────────────────────────────────
export interface RatiosEquilibre {
  fr: number;   // Fonds de Roulement net global
  bfr: number;  // Besoin en Fonds de Roulement
  tn: number;   // Trésorerie Nette
}

// ── Solvabilité, liquidité, endettement ───────────────────────────────────────
export interface RatiosSolvabilite {
  autonomieFinanciere: number;    // CP / Total Bilan (%)
  capaciteRemboursement: number;  // Dette nette / EBE
  endettementNet: number;         // Dette nette / CP (Net Gearing)
  endettementBrut: number;        // Total Dettes / CP (Gross Gearing)
  independanceLT: number;         // CP / Capitaux stables (%)
  independanceFinanciere: number; // CP / Endettement financier
  liquiditeGenerale: number;      // AC / PC
  liquiditeReduite: number;       // (AC - Stocks) / PC
}

// ── Ratios de rotation ─────────────────────────────────────────────────────────
export interface RatiosRotation {
  delaiClients: number;      // Clients × 360 / CA (jours)
  delaiFournisseurs: number; // Fournisseurs × 360 / Achats (jours)
  rotationBFR: number;       // BFR × 360 / CA (jours)
}

export interface Ratios {
  structure: RatiosStructure;
  rentabilite: RatiosRentabilite;
  equilibre: RatiosEquilibre;
  solvabilite: RatiosSolvabilite;
  rotation: RatiosRotation;
  // Keep flat aliases used by Dashboard
  fr: number;
  bfr: number;
  tn: number;
  liquiditeG: number;
  autonomie: number;
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

  // ── ACTIF ──────────────────────────────────────────────────────────────────
  const totalAnc    = a("total_anc");
  const totalAc     = a("total_ac");
  const stocks      = a("stocks");
  const clients     = a("clients");
  const tresorActif = a("tres_actif") + a("placements");
  const totalActif  = a("total_actif") || totalAnc + totalAc;

  // ── PASSIF ─────────────────────────────────────────────────────────────────
  const totalCp       = p("total_cp");
  const totalPnc      = p("total_pnc");
  const totalPc       = p("total_pc");
  const totalPassif   = p("total_passif") || totalCp + totalPnc + totalPc;
  const emprunts      = p("emprunts");
  const fournisseurs  = p("fournisseurs");
  const impotsPc      = p("impots_pc");
  const autresDettesC = p("autres_dettes_c");
  const tresorPassif  = p("tres_passif");

  // ── COMPTE DE RÉSULTAT ─────────────────────────────────────────────────────
  const ventes      = t("ventes");
  const production  = t("production");
  const va          = t("valeur_ajoutee");
  const ebe         = t("ebe");
  const resOp       = t("res_op");
  const resNet      = t("res_net");
  const dotations   = t("dotations");
  const achats      = t("achats");
  const chargesPerso = t("charges_pers");

  const safe = (num: number, den: number) => (den !== 0 ? num / den : 0);

  // ── Intermédiaires ─────────────────────────────────────────────────────────
  const capitauxStables = totalCp + totalPnc;
  const totalDettes     = totalPnc + totalPc;
  const creances        = totalAc - stocks - tresorActif;
  const detteNette      = emprunts + tresorPassif - tresorActif; // dette financière - tréso active
  const caf             = resNet + dotations; // Capacité d'autofinancement

  // ── Équilibre financier ────────────────────────────────────────────────────
  const fr  = capitauxStables - totalAnc;
  const bfr = stocks + creances - (fournisseurs + impotsPc + autresDettesC);
  const tn  = fr - bfr;

  return {
    // Flat aliases (Dashboard compat)
    fr, bfr, tn,
    liquiditeG: safe(totalAc, totalPc),
    autonomie:  safe(totalCp, totalPassif) * 100,

    structure: {
      financementImmob:     safe(capitauxStables, totalAnc),
      immobilisationActif:  safe(totalAnc, totalActif) * 100,
      liquiditeActif:       safe(totalAc, totalActif) * 100,
    },

    rentabilite: {
      margeBruteExpl:       safe(ebe, ventes) * 100,
      margeOperationnelle:  safe(resOp, ventes) * 100,
      margeNette:           safe(resNet, ventes) * 100,
      productiviteCapital:  safe(va, totalActif),
      remunerationTravail:  safe(chargesPerso, va) * 100,
      roe:                  safe(resNet, totalCp) * 100,
      roa:                  safe(resNet, totalActif) * 100,
      rentabiliteActivite:  safe(caf, ventes) * 100,
      tauxVA:               safe(va, production) * 100,
    },

    equilibre: { fr, bfr, tn },

    solvabilite: {
      autonomieFinanciere:    safe(totalCp, totalPassif) * 100,
      capaciteRemboursement:  safe(detteNette, ebe),
      endettementNet:         safe(detteNette, totalCp),
      endettementBrut:        safe(totalDettes, totalCp),
      independanceLT:         safe(totalCp, capitauxStables) * 100,
      independanceFinanciere: safe(totalCp, emprunts),
      liquiditeGenerale:      safe(totalAc, totalPc),
      liquiditeReduite:       safe(totalAc - stocks, totalPc),
    },

    rotation: {
      delaiClients:      safe(clients * 360, ventes),
      delaiFournisseurs: safe(fournisseurs * 360, achats),
      rotationBFR:       safe(bfr * 360, ventes),
    },
  };
}
