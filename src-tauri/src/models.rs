use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Company {
    pub id: i64,
    pub name: String,
    pub nif: String,
    pub rc: String,
    pub capital: f64,
    pub activite: String,
    pub wilaya: String,
    pub is_default: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CompanyInput {
    pub name: String,
    pub nif: String,
    pub rc: String,
    pub capital: f64,
    pub activite: String,
    pub wilaya: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FinancialEntry {
    pub id: i64,
    pub label: String,
    pub sheet_type: String,
    pub parent_id: Option<i64>,
    pub level: i32,
    pub order_index: i32,
    pub is_total: bool,
    pub is_section_header: bool,
    pub entry_key: Option<String>,
    pub formula: Option<String>,
    /// Stored values (leaf entries only): year -> value
    pub values: HashMap<String, Option<f64>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SheetData {
    pub years: Vec<i32>,
    pub entries: Vec<FinancialEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportRow {
    pub label: String,
    pub year: i32,
    pub value: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DetteAge {
    pub category: String,
    pub label: String,
    pub total: f64,
    pub moins_1_an: f64,
    pub plus_1_an: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AmortEntry {
    pub amort_key: String,
    pub amort: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BilanFonctionnel {
    pub year: i32,
    // ACTIF
    pub actifs_fixes: f64,
    pub actifs_circulants: f64,
    pub disponibilites: f64,
    pub total_actif_bf: f64,
    pub pct_actifs_fixes: f64,
    pub pct_actifs_circulants: f64,
    pub pct_disponibilites: f64,
    // PASSIF
    pub capitaux_propres: f64,
    pub dlmt: f64,
    pub dct: f64,
    pub total_passif_bf: f64,
    pub pct_cp: f64,
    pub pct_dlmt: f64,
    pub pct_dct: f64,
    pub total_cp_raw: f64,   // CP before restatement — 0 signals missing PASSIF data
    // Retraitements used (for transparency)
    pub amort_incorp: f64,
    pub amort_corp: f64,
    pub amort_anc: f64,
    pub prov_stocks: f64,
    pub prov_creances: f64,
}
