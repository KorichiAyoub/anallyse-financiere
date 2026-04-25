import { useState, useEffect, useCallback } from "react";
import { SheetData, SheetType, TreeNode, FinancialEntry } from "../types";
import { invokeTauri, isTauriRuntime } from "../lib/tauri";

const WEB_YEARS = [2022, 2023, 2024];

function webActifEntries(): FinancialEntry[] {
  return [
    {
      id: 1,
      label: "Actifs non courants",
      sheet_type: "ACTIF",
      parent_id: null,
      level: 0,
      order_index: 1,
      is_total: false,
      is_section_header: true,
      entry_key: "actifs_non_courants",
      formula: null,
      values: { "2022": 0, "2023": 0, "2024": 0 },
    },
    {
      id: 2,
      label: "Immobilisations",
      sheet_type: "ACTIF",
      parent_id: 1,
      level: 1,
      order_index: 2,
      is_total: false,
      is_section_header: false,
      entry_key: "immobilisations",
      formula: null,
      values: { "2022": 1200000, "2023": 1300000, "2024": 1380000 },
    },
    {
      id: 3,
      label: "Total Actif Non Courant",
      sheet_type: "ACTIF",
      parent_id: 1,
      level: 1,
      order_index: 3,
      is_total: true,
      is_section_header: false,
      entry_key: "total_actif_non_courant",
      formula: null,
      values: { "2022": 1200000, "2023": 1300000, "2024": 1380000 },
    },
    {
      id: 4,
      label: "Actifs courants",
      sheet_type: "ACTIF",
      parent_id: null,
      level: 0,
      order_index: 4,
      is_total: false,
      is_section_header: true,
      entry_key: "actifs_courants",
      formula: null,
      values: { "2022": 0, "2023": 0, "2024": 0 },
    },
    {
      id: 5,
      label: "Créances",
      sheet_type: "ACTIF",
      parent_id: 4,
      level: 1,
      order_index: 5,
      is_total: false,
      is_section_header: false,
      entry_key: "creances",
      formula: null,
      values: { "2022": 420000, "2023": 470000, "2024": 510000 },
    },
    {
      id: 6,
      label: "Trésorerie",
      sheet_type: "ACTIF",
      parent_id: 4,
      level: 1,
      order_index: 6,
      is_total: false,
      is_section_header: false,
      entry_key: "tresorerie",
      formula: null,
      values: { "2022": 180000, "2023": 210000, "2024": 240000 },
    },
    {
      id: 7,
      label: "Total Actif Courant",
      sheet_type: "ACTIF",
      parent_id: 4,
      level: 1,
      order_index: 7,
      is_total: true,
      is_section_header: false,
      entry_key: "total_actif_courant",
      formula: null,
      values: { "2022": 600000, "2023": 680000, "2024": 750000 },
    },
    {
      id: 8,
      label: "Total Actif",
      sheet_type: "ACTIF",
      parent_id: null,
      level: 0,
      order_index: 8,
      is_total: true,
      is_section_header: false,
      entry_key: "total_actif",
      formula: null,
      values: { "2022": 1800000, "2023": 1980000, "2024": 2130000 },
    },
  ];
}

function webPassifEntries(): FinancialEntry[] {
  return [
    {
      id: 101,
      label: "Capitaux propres",
      sheet_type: "PASSIF",
      parent_id: null,
      level: 0,
      order_index: 1,
      is_total: false,
      is_section_header: true,
      entry_key: "capitaux_propres",
      formula: null,
      values: { "2022": 0, "2023": 0, "2024": 0 },
    },
    {
      id: 102,
      label: "Capital social",
      sheet_type: "PASSIF",
      parent_id: 101,
      level: 1,
      order_index: 2,
      is_total: false,
      is_section_header: false,
      entry_key: "capital_social",
      formula: null,
      values: { "2022": 900000, "2023": 950000, "2024": 1000000 },
    },
    {
      id: 103,
      label: "Résultats cumulés",
      sheet_type: "PASSIF",
      parent_id: 101,
      level: 1,
      order_index: 3,
      is_total: false,
      is_section_header: false,
      entry_key: "resultats_cumules",
      formula: null,
      values: { "2022": 200000, "2023": 240000, "2024": 310000 },
    },
    {
      id: 104,
      label: "Total Capitaux Propres",
      sheet_type: "PASSIF",
      parent_id: 101,
      level: 1,
      order_index: 4,
      is_total: true,
      is_section_header: false,
      entry_key: "total_capitaux_propres",
      formula: null,
      values: { "2022": 1100000, "2023": 1190000, "2024": 1310000 },
    },
    {
      id: 105,
      label: "Dettes",
      sheet_type: "PASSIF",
      parent_id: null,
      level: 0,
      order_index: 5,
      is_total: false,
      is_section_header: true,
      entry_key: "dettes",
      formula: null,
      values: { "2022": 0, "2023": 0, "2024": 0 },
    },
    {
      id: 106,
      label: "Dettes financières",
      sheet_type: "PASSIF",
      parent_id: 105,
      level: 1,
      order_index: 6,
      is_total: false,
      is_section_header: false,
      entry_key: "dettes_financieres",
      formula: null,
      values: { "2022": 480000, "2023": 530000, "2024": 560000 },
    },
    {
      id: 107,
      label: "Dettes fournisseurs",
      sheet_type: "PASSIF",
      parent_id: 105,
      level: 1,
      order_index: 7,
      is_total: false,
      is_section_header: false,
      entry_key: "dettes_fournisseurs",
      formula: null,
      values: { "2022": 220000, "2023": 260000, "2024": 260000 },
    },
    {
      id: 108,
      label: "Total Dettes",
      sheet_type: "PASSIF",
      parent_id: 105,
      level: 1,
      order_index: 8,
      is_total: true,
      is_section_header: false,
      entry_key: "total_dettes",
      formula: null,
      values: { "2022": 700000, "2023": 790000, "2024": 820000 },
    },
    {
      id: 109,
      label: "Total Passif",
      sheet_type: "PASSIF",
      parent_id: null,
      level: 0,
      order_index: 9,
      is_total: true,
      is_section_header: false,
      entry_key: "total_passif",
      formula: null,
      values: { "2022": 1800000, "2023": 1980000, "2024": 2130000 },
    },
  ];
}

function webTrEntries(): FinancialEntry[] {
  return [
    {
      id: 201,
      label: "Produits",
      sheet_type: "TR",
      parent_id: null,
      level: 0,
      order_index: 1,
      is_total: false,
      is_section_header: true,
      entry_key: "produits",
      formula: null,
      values: { "2022": 0, "2023": 0, "2024": 0 },
    },
    {
      id: 202,
      label: "Chiffre d'affaires",
      sheet_type: "TR",
      parent_id: 201,
      level: 1,
      order_index: 2,
      is_total: false,
      is_section_header: false,
      entry_key: "ca",
      formula: null,
      values: { "2022": 2100000, "2023": 2400000, "2024": 2680000 },
    },
    {
      id: 203,
      label: "Charges",
      sheet_type: "TR",
      parent_id: null,
      level: 0,
      order_index: 3,
      is_total: false,
      is_section_header: true,
      entry_key: "charges",
      formula: null,
      values: { "2022": 0, "2023": 0, "2024": 0 },
    },
    {
      id: 204,
      label: "Charges d'exploitation",
      sheet_type: "TR",
      parent_id: 203,
      level: 1,
      order_index: 4,
      is_total: false,
      is_section_header: false,
      entry_key: "charges_exploitation",
      formula: null,
      values: { "2022": 1650000, "2023": 1880000, "2024": 2090000 },
    },
    {
      id: 205,
      label: "Résultat net",
      sheet_type: "TR",
      parent_id: null,
      level: 0,
      order_index: 5,
      is_total: true,
      is_section_header: false,
      entry_key: "resultat_net",
      formula: null,
      values: { "2022": 450000, "2023": 520000, "2024": 590000 },
    },
  ];
}

function webSheetData(sheet: SheetType): SheetData {
  if (sheet === "ACTIF") return { years: WEB_YEARS, entries: webActifEntries() };
  if (sheet === "PASSIF") return { years: WEB_YEARS, entries: webPassifEntries() };
  if (sheet === "TR") return { years: WEB_YEARS, entries: webTrEntries() };

  const actif = webActifEntries();
  const passif = webPassifEntries();
  return { years: WEB_YEARS, entries: [...actif, ...passif] };
}

export function buildTree(entries: FinancialEntry[]): TreeNode[] {
  const byId = new Map<number, TreeNode>();
  entries.forEach(e => byId.set(e.id, { ...e, children: [], depth: 0 }));

  const roots: TreeNode[] = [];
  entries.forEach(e => {
    const node = byId.get(e.id)!;
    if (e.parent_id !== null) {
      const parent = byId.get(e.parent_id);
      if (parent) {
        node.depth = parent.depth + 1;
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  });
  return roots;
}

export function flattenTree(nodes: TreeNode[], collapsed: Set<number>): TreeNode[] {
  const result: TreeNode[] = [];
  const recurse = (node: TreeNode) => {
    result.push(node);
    if (!collapsed.has(node.id) && node.children.length > 0) {
      node.children.forEach(recurse);
    }
  };
  nodes.forEach(recurse);
  return result;
}

export function useSheetData(sheet: SheetType) {
  const [data, setData] = useState<SheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!isTauriRuntime()) {
        setData(webSheetData(sheet));
        return;
      }

      // BILAN is computed from ACTIF + PASSIF
      if (sheet === "BILAN") {
        const [actif, passif] = await Promise.all([
          invokeTauri<SheetData>("get_sheet_data", { sheetType: "ACTIF" }),
          invokeTauri<SheetData>("get_sheet_data", { sheetType: "PASSIF" }),
        ]);
        const years = actif.years;
        const entries = [...actif.entries, ...passif.entries];
        setData({ years, entries });
      } else {
        const result = await invokeTauri<SheetData>("get_sheet_data", { sheetType: sheet });
        setData(result);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [sheet]);

  useEffect(() => { refresh(); }, [refresh]);

  const updateValue = useCallback(async (entryId: number, year: number, value: number | null) => {
    if (!isTauriRuntime()) return;

    await invokeTauri("update_value", { entryId, year, value });
    await refresh();
  }, [refresh]);

  return { data, loading, error, refresh, updateValue };
}
