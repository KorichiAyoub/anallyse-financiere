export interface FinancialEntry {
  id: number;
  label: string;
  sheet_type: string;
  parent_id: number | null;
  level: number;
  order_index: number;
  is_total: boolean;
  is_section_header: boolean;
  entry_key: string | null;
  formula: string | null;
  /** year (string) -> value (null if not set for leaf, computed for total) */
  values: Record<string, number | null>;
}

export interface SheetData {
  years: number[];
  entries: FinancialEntry[];
}

export interface TreeNode extends FinancialEntry {
  children: TreeNode[];
  depth: number;
}

export type SheetType = "ACTIF" | "PASSIF" | "TR" | "BILAN";

export interface ImportRow {
  label: string;
  year: number;
  value: number | null;
}
