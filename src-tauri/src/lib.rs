mod db;
mod models;
mod compute;

use models::{Company, CompanyInput, FinancialEntry, SheetData, ImportRow};
use once_cell::sync::OnceCell;
use rusqlite::Connection;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::Manager;

static DB: OnceCell<Mutex<Connection>> = OnceCell::new();

fn get_conn() -> std::sync::MutexGuard<'static, Connection> {
    DB.get().expect("DB not initialized").lock().unwrap()
}

// ─── Tauri Commands ───────────────────────────────────────────────────────────

#[tauri::command]
fn get_sheet_data(sheet_type: String) -> Result<SheetData, String> {
    let conn = get_conn();
    let company_id = db::get_active_company_id(&conn).map_err(|e| e.to_string())?;

    let years = db::get_years(&conn, company_id).map_err(|e| e.to_string())?;

    // Load all entries for this sheet
    let mut stmt = conn.prepare(
        "SELECT id, label, sheet_type, parent_id, level, order_index, is_total, is_section_header, entry_key, formula
         FROM financial_entries WHERE sheet_type = ?1 ORDER BY order_index"
    ).map_err(|e| e.to_string())?;

    let raw_entries: Vec<(i64, String, String, Option<i64>, i32, i32, bool, bool, Option<String>, Option<String>)> =
        stmt.query_map(rusqlite::params![sheet_type], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Option<i64>>(3)?,
                r.get::<_, i32>(4)?,
                r.get::<_, i32>(5)?,
                r.get::<_, bool>(6)?,
                r.get::<_, bool>(7)?,
                r.get::<_, Option<String>>(8)?,
                r.get::<_, Option<String>>(9)?,
            ))
        }).map_err(|e| e.to_string())?
        .filter_map(|r| r.ok()).collect();

    // Load stored values for this sheet
    let raw_values = db::get_all_values(&conn, &sheet_type, company_id).map_err(|e| e.to_string())?;
    // Build map: entry_id -> year -> value
    let mut val_map: HashMap<i64, HashMap<i32, Option<f64>>> = HashMap::new();
    for (eid, yr, v) in raw_values {
        val_map.entry(eid).or_default().insert(yr, v);
    }

    // Collect total entries for computation
    let total_entries: Vec<(i64, String, String)> = raw_entries.iter()
        .filter(|e| e.6 && e.8.is_some() && e.9.is_some())
        .map(|e| (e.0, e.8.clone().unwrap(), e.9.clone().unwrap()))
        .collect();

    let computed = compute::compute_all(&total_entries, &years, company_id, &conn);

    let entries: Vec<FinancialEntry> = raw_entries.into_iter().map(|e| {
        let (id, label, st, parent_id, level, order_index, is_total, is_section_header, entry_key, formula) = e;
        let mut values: HashMap<String, Option<f64>> = HashMap::new();
        if is_total {
            // Use computed values
            for y in &years {
                let v = computed.get(&(id, *y)).copied();
                values.insert(y.to_string(), v);
            }
        } else {
            // Use stored values
            for y in &years {
                let v = val_map.get(&id).and_then(|m| m.get(y)).copied().flatten();
                values.insert(y.to_string(), Some(v.unwrap_or(0.0)).filter(|_| val_map.contains_key(&id)));
            }
        }
        FinancialEntry { id, label, sheet_type: st, parent_id, level, order_index, is_total, is_section_header, entry_key, formula, values }
    }).collect();

    Ok(SheetData { years, entries })
}

#[tauri::command]
fn get_years() -> Result<Vec<i32>, String> {
    let conn = get_conn();
    let company_id = db::get_active_company_id(&conn).map_err(|e| e.to_string())?;
    db::get_years(&conn, company_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_value(entry_id: i64, year: i32, value: Option<f64>) -> Result<(), String> {
    let conn = get_conn();
    let company_id = db::get_active_company_id(&conn).map_err(|e| e.to_string())?;
    db::upsert_value(&conn, entry_id, company_id, year, value).map_err(|e| e.to_string())
}

#[tauri::command]
fn add_year(year: i32) -> Result<(), String> {
    let conn = get_conn();
    let company_id = db::get_active_company_id(&conn).map_err(|e| e.to_string())?;
    db::add_year(&conn, company_id, year).map_err(|e| e.to_string())
}

#[tauri::command]
fn import_values(rows: Vec<ImportRow>, sheet_type: String) -> Result<usize, String> {
    let conn = get_conn();
    let company_id = db::get_active_company_id(&conn).map_err(|e| e.to_string())?;
    let mut count = 0;

    for row in &rows {
        let id_opt = db::get_entry_id_by_label(&conn, &sheet_type, &row.label)
            .map_err(|e| e.to_string())?;
        if let Some(id) = id_opt {
            db::add_year(&conn, company_id, row.year).map_err(|e| e.to_string())?;
            db::upsert_value(&conn, id, company_id, row.year, row.value).map_err(|e| e.to_string())?;
            count += 1;
        }
    }
    Ok(count)
}

#[tauri::command]
fn save_file(app: tauri::AppHandle, filename: String, data: Vec<u8>) -> Result<String, String> {
    let download_dir = app.path().download_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&download_dir).map_err(|e| e.to_string())?;
    let path = download_dir.join(&filename);
    std::fs::write(&path, &data).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

// ─── PIN Commands ─────────────────────────────────────────────────────────────

#[tauri::command]
fn has_pin() -> bool {
    let conn = get_conn();
    db::has_pin(&conn)
}

#[tauri::command]
fn setup_pin(pin: String) -> Result<(), String> {
    let conn = get_conn();
    db::setup_pin(&conn, &pin).map_err(|e| e.to_string())
}

#[tauri::command]
fn verify_pin(pin: String) -> Result<bool, String> {
    let conn = get_conn();
    db::verify_pin(&conn, &pin).map_err(|e| e.to_string())
}

#[tauri::command]
fn change_pin(old_pin: String, new_pin: String) -> Result<bool, String> {
    let conn = get_conn();
    let ok = db::verify_pin(&conn, &old_pin).map_err(|e| e.to_string())?;
    if ok {
        db::setup_pin(&conn, &new_pin).map_err(|e| e.to_string())?;
    }
    Ok(ok)
}

#[tauri::command]
fn remove_pin(pin: String) -> Result<bool, String> {
    let conn = get_conn();
    let ok = db::verify_pin(&conn, &pin).map_err(|e| e.to_string())?;
    if ok {
        db::remove_pin(&conn).map_err(|e| e.to_string())?;
    }
    Ok(ok)
}

// ─── Company Commands ──────────────────────────────────────────────────────────

#[tauri::command]
fn list_companies() -> Result<Vec<Company>, String> {
    let conn = get_conn();
    let rows = db::list_companies(&conn).map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(|(id, name, nif, rc, capital, activite, wilaya, is_default)| {
        Company { id, name, nif, rc, capital, activite, wilaya, is_default }
    }).collect())
}

#[tauri::command]
fn add_company(input: CompanyInput) -> Result<i64, String> {
    let conn = get_conn();
    db::add_company(&conn, &input.name, &input.nif, &input.rc, input.capital, &input.activite, &input.wilaya)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn update_company(id: i64, input: CompanyInput) -> Result<(), String> {
    let conn = get_conn();
    db::update_company(&conn, id, &input.name, &input.nif, &input.rc, input.capital, &input.activite, &input.wilaya)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_company(id: i64) -> Result<(), String> {
    let conn = get_conn();
    db::delete_company(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_active_company() -> Result<Option<Company>, String> {
    let conn = get_conn();
    let company_id = db::get_active_company_id(&conn).map_err(|e| e.to_string())?;
    let rows = db::list_companies(&conn).map_err(|e| e.to_string())?;
    Ok(rows.into_iter().find(|(id, ..)| *id == company_id).map(
        |(id, name, nif, rc, capital, activite, wilaya, is_default)| {
            Company { id, name, nif, rc, capital, activite, wilaya, is_default }
        }
    ))
}

#[tauri::command]
fn set_active_company(id: i64) -> Result<(), String> {
    let conn = get_conn();
    db::set_setting(&conn, "active_company_id", &id.to_string()).map_err(|e| e.to_string())
}

// ─── App Entry Point ──────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            std::fs::create_dir_all(&data_dir).ok();
            let db_path = data_dir.join("financial.db");

            let conn = Connection::open(&db_path)
                .expect("Failed to open SQLite database");
            db::init(&conn).expect("Failed to initialize database");

            DB.set(Mutex::new(conn)).expect("DB already initialized");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_sheet_data,
            get_years,
            update_value,
            add_year,
            import_values,
            save_file,
            has_pin,
            setup_pin,
            verify_pin,
            change_pin,
            remove_pin,
            list_companies,
            add_company,
            update_company,
            delete_company,
            get_active_company,
            set_active_company,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
