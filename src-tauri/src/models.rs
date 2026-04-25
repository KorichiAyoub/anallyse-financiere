use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
