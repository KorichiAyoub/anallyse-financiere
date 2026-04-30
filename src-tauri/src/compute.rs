use rusqlite::{Connection, params};
use std::collections::HashMap;

/// Compute the value of a total entry for a given year.
/// `computed` is a memoization cache: (entry_key, year) -> value
pub fn compute_entry(
    entry_id: i64,
    entry_key: &str,
    formula: &str,
    year: i32,
    company_id: i64,
    conn: &Connection,
    computed: &mut HashMap<(String, i32), f64>,
) -> f64 {
    let cache_key = (entry_key.to_string(), year);
    if let Some(&v) = computed.get(&cache_key) {
        return v;
    }

    let result = if formula == "sum_children" {
        sum_leaf_descendants_of_parent(entry_id, year, company_id, conn, computed)
    } else if formula.starts_with("sum:") {
        let keys = formula[4..].split(',').map(|s| s.trim());
        keys.map(|k| get_value_by_key(k, year, company_id, conn, computed)).sum()
    } else if formula.starts_with("add_sub:") {
        let rest = &formula[8..];
        let parts: Vec<&str> = rest.splitn(2, '|').collect();
        let pos: f64 = parts[0].split(',').map(|k| get_value_by_key(k.trim(), year, company_id, conn, computed)).sum();
        let neg: f64 = if parts.len() > 1 {
            parts[1].split(',').map(|k| get_value_by_key(k.trim(), year, company_id, conn, computed)).sum()
        } else {
            0.0
        };
        pos - neg
    } else {
        0.0
    };

    computed.insert(cache_key, result);
    result
}

/// Retrieve a value by entry_key, computing it if it's a total row.
fn get_value_by_key(
    key: &str,
    year: i32,
    company_id: i64,
    conn: &Connection,
    computed: &mut HashMap<(String, i32), f64>,
) -> f64 {
    let cache_key = (key.to_string(), year);
    if let Some(&v) = computed.get(&cache_key) {
        return v;
    }

    // Look up the entry
    let row: Option<(i64, bool, Option<String>)> = conn.query_row(
        "SELECT id, is_total, formula FROM financial_entries WHERE entry_key = ?1",
        params![key],
        |r| Ok((r.get::<_, i64>(0)?, r.get::<_, bool>(1)?, r.get::<_, Option<String>>(2)?)),
    ).ok();

    match row {
        None => 0.0,
        Some((id, is_total, formula_opt)) => {
            if is_total {
                if let Some(formula) = formula_opt {
                    compute_entry(id, key, &formula, year, company_id, conn, computed)
                } else {
                    0.0
                }
            } else {
                // Leaf: fetch stored value
                let v: Option<f64> = conn.query_row(
                    "SELECT value FROM financial_values WHERE entry_id = ?1 AND year = ?2 AND company_id = ?3",
                    params![id, year, company_id],
                    |r| r.get(0),
                ).unwrap_or(None);
                let v = v.unwrap_or(0.0);
                computed.insert(cache_key, v);
                v
            }
        }
    }
}

/// Sum all leaf (non-total, non-section-header) descendants of the parent of the given total entry.
fn sum_leaf_descendants_of_parent(
    total_entry_id: i64,
    year: i32,
    company_id: i64,
    conn: &Connection,
    computed: &mut HashMap<(String, i32), f64>,
) -> f64 {
    // Get the parent_id of this total entry
    let parent_id: Option<i64> = conn.query_row(
        "SELECT parent_id FROM financial_entries WHERE id = ?1",
        params![total_entry_id],
        |r| r.get(0),
    ).unwrap_or(None);

    sum_leaf_children(parent_id, total_entry_id, year, company_id, conn, computed)
}

/// Recursively sum all non-total, non-header leaf descendants.
fn sum_leaf_children(
    parent_id: Option<i64>,
    exclude_id: i64,
    year: i32,
    company_id: i64,
    conn: &Connection,
    computed: &mut HashMap<(String, i32), f64>,
) -> f64 {
    let children: Vec<(i64, bool, bool)> = {
        let (sql, pid_val): (&str, Option<i64>) = if let Some(pid) = parent_id {
            ("SELECT id, is_total, is_section_header FROM financial_entries WHERE parent_id = ?1 AND id != ?2 ORDER BY order_index", Some(pid))
        } else {
            ("SELECT id, is_total, is_section_header FROM financial_entries WHERE parent_id IS NULL AND id != ?2 ORDER BY order_index", None)
        };
        let mut stmt = conn.prepare(sql).unwrap();
        if let Some(pid) = pid_val {
            stmt.query_map(params![pid, exclude_id], |r| {
                Ok((r.get::<_, i64>(0)?, r.get::<_, bool>(1)?, r.get::<_, bool>(2)?))
            }).unwrap().filter_map(|r| r.ok()).collect()
        } else {
            stmt.query_map(params![exclude_id], |r| {
                Ok((r.get::<_, i64>(0)?, r.get::<_, bool>(1)?, r.get::<_, bool>(2)?))
            }).unwrap().filter_map(|r| r.ok()).collect()
        }
    };

    let mut total = 0.0;
    for (child_id, is_total, is_header) in children {
        if is_total {
            continue; // Don't include other total rows in the sum
        }
        // Check if has children
        let has_children: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM financial_entries WHERE parent_id = ?1",
            params![child_id],
            |r| r.get(0),
        ).unwrap_or(false);

        if is_header || has_children {
            // Recurse into sub-header's children
            total += sum_leaf_children(Some(child_id), i64::MAX, year, company_id, conn, computed);
        } else {
            // Leaf: add stored value
            let v: Option<f64> = conn.query_row(
                "SELECT value FROM financial_values WHERE entry_id = ?1 AND year = ?2 AND company_id = ?3",
                params![child_id, year, company_id],
                |r| r.get(0),
            ).unwrap_or(None);
            total += v.unwrap_or(0.0);
        }
    }
    total
}

/// Public helper: get the value of any entry (leaf or total) by its entry_key for a given year.
pub fn get_entry_value(key: &str, year: i32, company_id: i64, conn: &Connection) -> f64 {
    let mut memo: HashMap<(String, i32), f64> = HashMap::new();
    get_value_by_key(key, year, company_id, conn, &mut memo)
}

/// Build a computed map over all years so the UI can display everything at once.
pub fn compute_all(
    total_entries: &[(i64, String, String)], // (id, key, formula)
    years: &[i32],
    company_id: i64,
    conn: &Connection,
) -> HashMap<(i64, i32), f64> {
    let mut memo: HashMap<(String, i32), f64> = HashMap::new();
    let mut result: HashMap<(i64, i32), f64> = HashMap::new();

    for year in years {
        for (id, key, formula) in total_entries {
            let v = compute_entry(*id, key, formula, *year, company_id, conn, &mut memo);
            result.insert((*id, *year), v);
        }
    }
    result
}
