use rusqlite::{Connection, Result, params};
use sha2::{Sha256, Digest};

const SCHEMA_VERSION: i32 = 3;

pub fn init(conn: &Connection) -> Result<()> {
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=OFF;")?;

    let version: i32 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .unwrap_or(0);

    if version < SCHEMA_VERSION {
        let has_old: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='financial_entries'",
                [], |r| r.get::<_, i64>(0),
            )
            .unwrap_or(0) > 0;
        if has_old {
            if version < 2 { migrate_to_v2(conn)?; }
            migrate_to_v3(conn)?;
        } else {
            create_schema_v3(conn)?;
        }
        conn.execute_batch(&format!("PRAGMA user_version = {};", SCHEMA_VERSION))?;
    }

    conn.execute_batch("PRAGMA foreign_keys=ON;")?;

    let n: i64 = conn.query_row("SELECT COUNT(*) FROM financial_entries", [], |r| r.get(0))?;
    if n == 0 { seed(conn)?; }

    ensure_default_company(conn)?;
    Ok(())
}

fn create_schema_v3(conn: &Connection) -> Result<()> {
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            nif TEXT NOT NULL DEFAULT '',
            rc TEXT NOT NULL DEFAULT '',
            capital REAL NOT NULL DEFAULT 0,
            activite TEXT NOT NULL DEFAULT '',
            wilaya TEXT NOT NULL DEFAULT '',
            is_default INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS financial_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT NOT NULL, sheet_type TEXT NOT NULL,
            parent_id INTEGER REFERENCES financial_entries(id) ON DELETE CASCADE,
            level INTEGER NOT NULL DEFAULT 0, order_index INTEGER NOT NULL DEFAULT 0,
            is_total INTEGER NOT NULL DEFAULT 0, is_section_header INTEGER NOT NULL DEFAULT 0,
            entry_key TEXT UNIQUE, formula TEXT
        );
        CREATE TABLE IF NOT EXISTS financial_values (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_id INTEGER NOT NULL REFERENCES financial_entries(id) ON DELETE CASCADE,
            company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            year INTEGER NOT NULL, value REAL,
            UNIQUE(entry_id, company_id, year)
        );
        CREATE TABLE IF NOT EXISTS app_years (
            company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            year INTEGER NOT NULL,
            PRIMARY KEY(company_id, year)
        );
        CREATE TABLE IF NOT EXISTS retraitements (
            company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            year INTEGER NOT NULL,
            amort_anc REAL NOT NULL DEFAULT 0,
            prov_stocks REAL NOT NULL DEFAULT 0,
            prov_creances REAL NOT NULL DEFAULT 0,
            PRIMARY KEY(company_id, year)
        );
        CREATE TABLE IF NOT EXISTS dettes_par_age (
            company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            year INTEGER NOT NULL,
            category TEXT NOT NULL,
            moins_1_an REAL NOT NULL DEFAULT 0,
            PRIMARY KEY(company_id, year, category)
        );
    ")?;
    Ok(())
}

fn migrate_to_v3(conn: &Connection) -> Result<()> {
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS retraitements (
            company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            year INTEGER NOT NULL,
            amort_anc REAL NOT NULL DEFAULT 0,
            prov_stocks REAL NOT NULL DEFAULT 0,
            prov_creances REAL NOT NULL DEFAULT 0,
            PRIMARY KEY(company_id, year)
        );
        CREATE TABLE IF NOT EXISTS dettes_par_age (
            company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            year INTEGER NOT NULL,
            category TEXT NOT NULL,
            moins_1_an REAL NOT NULL DEFAULT 0,
            PRIMARY KEY(company_id, year, category)
        );
    ")?;
    Ok(())
}

fn migrate_to_v2(conn: &Connection) -> Result<()> {
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '');
        CREATE TABLE IF NOT EXISTS companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
            nif TEXT NOT NULL DEFAULT '', rc TEXT NOT NULL DEFAULT '',
            capital REAL NOT NULL DEFAULT 0, activite TEXT NOT NULL DEFAULT '',
            wilaya TEXT NOT NULL DEFAULT '', is_default INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT OR IGNORE INTO companies (id, name, is_default) VALUES (1, 'Mon Entreprise', 1);
    ")?;

    let has_cid: bool = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('financial_values') WHERE name='company_id'",
        [], |r| r.get::<_, i64>(0),
    ).unwrap_or(0) > 0;
    if !has_cid {
        conn.execute_batch("
            CREATE TABLE fv2 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                entry_id INTEGER NOT NULL, company_id INTEGER NOT NULL DEFAULT 1,
                year INTEGER NOT NULL, value REAL, UNIQUE(entry_id, company_id, year));
            INSERT INTO fv2 (entry_id, company_id, year, value)
                SELECT entry_id, 1, year, value FROM financial_values;
            DROP TABLE financial_values;
            ALTER TABLE fv2 RENAME TO financial_values;
        ")?;
    }

    let has_cy: bool = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('app_years') WHERE name='company_id'",
        [], |r| r.get::<_, i64>(0),
    ).unwrap_or(0) > 0;
    if !has_cy {
        conn.execute_batch("
            CREATE TABLE ay2 (company_id INTEGER NOT NULL DEFAULT 1, year INTEGER NOT NULL,
                PRIMARY KEY(company_id, year));
            INSERT OR REPLACE INTO ay2 (company_id, year) SELECT 1, year FROM app_years;
            DROP TABLE app_years;
            ALTER TABLE ay2 RENAME TO app_years;
        ")?;
    }

    conn.execute(
        "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('active_company_id', '1')", [],
    )?;
    Ok(())
}

fn ensure_default_company(conn: &Connection) -> Result<()> {
    let nc: i64 = conn.query_row("SELECT COUNT(*) FROM companies", [], |r| r.get(0))?;
    if nc == 0 {
        conn.execute("INSERT INTO companies (name, is_default) VALUES ('Mon Entreprise', 1)", [])?;
        let cid = conn.last_insert_rowid();
        set_setting(conn, "active_company_id", &cid.to_string())?;
        for y in [2022i32, 2023, 2024] {
            conn.execute("INSERT OR IGNORE INTO app_years (company_id, year) VALUES (?1, ?2)",
                params![cid, y])?;
        }
    }
    if get_setting(conn, "active_company_id")?.map(|s| s.is_empty()).unwrap_or(true) {
        let cid: i64 = conn.query_row(
            "SELECT id FROM companies ORDER BY is_default DESC, id LIMIT 1", [], |r| r.get(0),
        )?;
        set_setting(conn, "active_company_id", &cid.to_string())?;
    }
    let cid = get_active_company_id(conn)?;
    let yrc: i64 = conn.query_row(
        "SELECT COUNT(*) FROM app_years WHERE company_id = ?1", params![cid], |r| r.get(0),
    )?;
    if yrc == 0 {
        for y in [2022i32, 2023, 2024] {
            conn.execute("INSERT OR IGNORE INTO app_years (company_id, year) VALUES (?1, ?2)",
                params![cid, y])?;
        }
    }
    Ok(())
}

// ─── App Settings ─────────────────────────────────────────────────────────────

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>> {
    conn.query_row("SELECT value FROM app_settings WHERE key = ?1", params![key], |r| r.get(0))
        .map(Some)
        .or_else(|e| if e == rusqlite::Error::QueryReturnedNoRows { Ok(None) } else { Err(e) })
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?1, ?2)", params![key, value],
    )?;
    Ok(())
}

pub fn delete_setting(conn: &Connection, key: &str) -> Result<()> {
    conn.execute("DELETE FROM app_settings WHERE key = ?1", params![key])?;
    Ok(())
}

pub fn get_active_company_id(conn: &Connection) -> Result<i64> {
    Ok(get_setting(conn, "active_company_id")?
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(1))
}

// ─── Company CRUD ─────────────────────────────────────────────────────────────

pub fn list_companies(
    conn: &Connection,
) -> Result<Vec<(i64, String, String, String, f64, String, String, bool)>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, nif, rc, capital, activite, wilaya, is_default FROM companies ORDER BY id",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?,
                r.get::<_, String>(3)?, r.get::<_, f64>(4)?, r.get::<_, String>(5)?,
                r.get::<_, String>(6)?, r.get::<_, bool>(7)?,
            ))
        })?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

pub fn add_company(
    conn: &Connection, name: &str, nif: &str, rc: &str,
    capital: f64, activite: &str, wilaya: &str,
) -> Result<i64> {
    conn.execute(
        "INSERT INTO companies (name,nif,rc,capital,activite,wilaya) VALUES (?1,?2,?3,?4,?5,?6)",
        params![name, nif, rc, capital, activite, wilaya],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn update_company(
    conn: &Connection, id: i64, name: &str, nif: &str, rc: &str,
    capital: f64, activite: &str, wilaya: &str,
) -> Result<()> {
    conn.execute(
        "UPDATE companies SET name=?1,nif=?2,rc=?3,capital=?4,activite=?5,wilaya=?6 WHERE id=?7",
        params![name, nif, rc, capital, activite, wilaya, id],
    )?;
    Ok(())
}

pub fn delete_company(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM companies WHERE id = ?1", params![id])?;
    Ok(())
}

struct Entry<'a> {
    label: &'a str,
    parent_key: Option<&'a str>,
    level: i32,
    order: i32,
    is_total: bool,
    is_header: bool,
    key: Option<&'a str>,
    formula: Option<&'a str>,
    sheet: &'a str,
}

fn ins(conn: &Connection, e: &Entry) -> Result<i64> {
    let parent_id: Option<i64> = if let Some(pk) = e.parent_key {
        conn.query_row(
            "SELECT id FROM financial_entries WHERE entry_key = ?1",
            params![pk],
            |r| r.get(0),
        ).ok()
    } else {
        None
    };
    conn.execute(
        "INSERT INTO financial_entries (label, sheet_type, parent_id, level, order_index, is_total, is_section_header, entry_key, formula)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        params![e.label, e.sheet, parent_id, e.level, e.order, e.is_total as i32, e.is_header as i32, e.key, e.formula],
    )?;
    Ok(conn.last_insert_rowid())
}

fn val(conn: &Connection, key: &str, company_id: i64, year: i32, v: Option<f64>) -> Result<()> {
    let id: i64 = conn.query_row(
        "SELECT id FROM financial_entries WHERE entry_key = ?1",
        params![key],
        |r| r.get(0),
    )?;
    conn.execute(
        "INSERT OR REPLACE INTO financial_values (entry_id, company_id, year, value) VALUES (?1,?2,?3,?4)",
        params![id, company_id, year, v],
    )?;
    Ok(())
}

pub fn seed(conn: &Connection) -> Result<()> {
    // Ensure default company + settings exist for seeding
    conn.execute(
        "INSERT OR IGNORE INTO companies (id, name, is_default) VALUES (1, 'Mon Entreprise', 1)", [],
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('active_company_id', '1')", [],
    )?;
    for y in [2022i32, 2023, 2024] {
        conn.execute("INSERT OR IGNORE INTO app_years (company_id, year) VALUES (1, ?1)", params![y])?;
    }

    // ─────────────────────────────── ACTIF ───────────────────────────────────
    let actif_entries = [
        // label, parent_key, level, order, is_total, is_header, key, formula
        ("ACTIFS NON COURANTS",            None,                    0,  0, false, true,  Some("actifs_nc"),      None),
        ("Ecart d'acquisition",            Some("actifs_nc"),       1,  1, false, false, Some("ecart_acq"),      None),
        ("Immobilisations incorporelles",  Some("actifs_nc"),       1,  2, false, false, Some("imm_incorp"),     None),
        ("Immobilisations corporelles",    Some("actifs_nc"),       1,  3, false, true,  Some("imm_corp"),       None),
        ("Terrains",                       Some("imm_corp"),        2,  4, false, false, Some("terrains"),       None),
        ("Bâtiments",                      Some("imm_corp"),        2,  5, false, false, Some("batiments"),      None),
        ("Autres immobilisations corp.",   Some("imm_corp"),        2,  6, false, false, Some("autres_imm_corp"),None),
        ("Immobilisations en concession",  Some("actifs_nc"),       1,  7, false, false, Some("imm_concession"), None),
        ("Immobilisations en cours",       Some("actifs_nc"),       1,  8, false, false, Some("imm_encours"),    None),
        ("Immobilisations financières",    Some("actifs_nc"),       1,  9, false, true,  Some("imm_fin"),        None),
        ("Titres mis en équivalence",      Some("imm_fin"),         2, 10, false, false, Some("titres_equiv"),   None),
        ("Autres participations",          Some("imm_fin"),         2, 11, false, false, Some("autres_part"),    None),
        ("Autres titres immobilisés",      Some("imm_fin"),         2, 12, false, false, Some("autres_titres"),  None),
        ("Prêts et actifs fin. non cour.", Some("actifs_nc"),       1, 13, false, false, Some("prets_nc"),       None),
        ("Impôts différés actif",          Some("actifs_nc"),       1, 14, false, false, Some("ida"),            None),
        ("TOTAL ACTIF NON COURANT",        Some("actifs_nc"),       1, 15, true,  false, Some("total_anc"),      Some("sum_children")),
        ("ACTIF COURANT",                  None,                    0, 16, false, true,  Some("actif_c"),        None),
        ("Stocks et encours",              Some("actif_c"),         1, 17, false, false, Some("stocks"),         None),
        ("Créances et emplois assimilés",  Some("actif_c"),         1, 18, false, true,  Some("creances"),       None),
        ("Clients",                        Some("creances"),        2, 19, false, false, Some("clients"),        None),
        ("Autres débiteurs",               Some("creances"),        2, 20, false, false, Some("autres_deb"),     None),
        ("Impôts et assimilés",            Some("creances"),        2, 21, false, false, Some("impots_ac"),      None),
        ("Autres créances",                Some("creances"),        2, 22, false, false, Some("autres_crean"),   None),
        ("Disponibilités et assimilés",    Some("actif_c"),         1, 23, false, true,  Some("dispos"),         None),
        ("Placements financiers courants", Some("dispos"),          2, 24, false, false, Some("placements"),     None),
        ("Trésorerie",                     Some("dispos"),          2, 25, false, false, Some("tres_actif"),     None),
        ("TOTAL ACTIF COURANT",            Some("actif_c"),         1, 26, true,  false, Some("total_ac"),       Some("sum_children")),
        ("TOTAL ACTIF",                    None,                    0, 27, true,  false, Some("total_actif"),    Some("sum:total_anc,total_ac")),
    ];
    for (label, pk, lvl, ord, is_t, is_h, key, formula) in &actif_entries {
        ins(conn, &Entry { label, parent_key: *pk, level: *lvl, order: *ord, is_total: *is_t, is_header: *is_h, key: *key, formula: *formula, sheet: "ACTIF" })?;
    }
    // ACTIF values
    let actif_vals: &[(&str, f64, f64, f64)] = &[
        ("imm_incorp",     67810.35,    235001.32,  188001.30),
        ("batiments",      3232649.99,  5745361.11, 28742150.21),
        ("autres_imm_corp",11833190.49, 14936764.26, 31292878.75),
        ("imm_encours",    10591504.88, 1353339494.0, 1360729551.70),
        ("prets_nc",       21350000.0,  21463022.0, 21463022.0),
        ("ida",            4745165.24,  2680396.91, 15319870.19),
        ("stocks",         535581359.49,113167212.38,69211832.41),
        ("clients",        9387054.03,  44638128.63, 100320153.34),
        ("autres_deb",     4172347.23,  149141781.52,187606107.28),
        ("impots_ac",      28906594.05, 43193128.72, 67329411.93),
        ("tres_actif",     4868294.28,  973815.15,   50443636.03),
    ];
    for (k, v22, v23, v24) in actif_vals {
        val(conn, k, 1, 2022, Some(*v22))?;
        val(conn, k, 1, 2023, Some(*v23))?;
        val(conn, k, 1, 2024, Some(*v24))?;
    }

    // ─────────────────────────────── PASSIF ──────────────────────────────────
    let passif_entries = [
        ("CAPITAUX PROPRES",                  None,                  0,  0, false, true,  Some("cap_propres"),    None),
        ("Capital émis",                      Some("cap_propres"),   1,  1, false, false, Some("capital"),        None),
        ("Capital non appelé",                Some("cap_propres"),   1,  2, false, false, Some("cap_non_appele"), None),
        ("Primes et réserves",                Some("cap_propres"),   1,  3, false, false, Some("primes_res"),     None),
        ("Ecart de réévaluation",             Some("cap_propres"),   1,  4, false, false, Some("ecart_reeval"),   None),
        ("Ecart d'équivalence",               Some("cap_propres"),   1,  5, false, false, Some("ecart_equiv"),    None),
        ("Résultat net",                      Some("cap_propres"),   1,  6, false, false, Some("resultat_net_p"), None),
        ("Autres capitaux propres",           Some("cap_propres"),   1,  7, false, false, Some("autres_cp"),      None),
        ("Part de la société consolidante",   Some("cap_propres"),   1,  8, false, false, Some("part_soc"),       None),
        ("Part des minoritaires",             Some("cap_propres"),   1,  9, false, false, Some("part_min"),       None),
        ("TOTAL CAPITAUX PROPRES",            Some("cap_propres"),   1, 10, true,  false, Some("total_cp"),       Some("sum_children")),
        ("PASSIFS NON-COURANTS",              None,                  0, 11, false, true,  Some("passifs_nc"),     None),
        ("Emprunts et dettes financières",    Some("passifs_nc"),    1, 12, false, false, Some("emprunts"),       None),
        ("Impôts différés provisionnés",      Some("passifs_nc"),    1, 13, false, false, Some("idp"),            None),
        ("Autres dettes non courantes",       Some("passifs_nc"),    1, 14, false, false, Some("autres_dettes_nc"),None),
        ("Provisions",                        Some("passifs_nc"),    1, 15, false, false, Some("provisions"),     None),
        ("TOTAL PASSIFS NON-COURANTS",        Some("passifs_nc"),    1, 16, true,  false, Some("total_pnc"),      Some("sum_children")),
        ("PASSIFS COURANTS",                  None,                  0, 17, false, true,  Some("passifs_c"),      None),
        ("Fournisseurs et comptes rattachés", Some("passifs_c"),     1, 18, false, false, Some("fournisseurs"),   None),
        ("Impôts",                            Some("passifs_c"),     1, 19, false, false, Some("impots_pc"),      None),
        ("Autres dettes",                     Some("passifs_c"),     1, 20, false, false, Some("autres_dettes_c"),None),
        ("Trésorerie passif",                 Some("passifs_c"),     1, 21, false, false, Some("tres_passif"),    None),
        ("TOTAL PASSIFS COURANTS",            Some("passifs_c"),     1, 22, true,  false, Some("total_pc"),       Some("sum_children")),
        ("TOTAL PASSIF",                      None,                  0, 23, true,  false, Some("total_passif"),   Some("sum:total_cp,total_pnc,total_pc")),
    ];
    for (label, pk, lvl, ord, is_t, is_h, key, formula) in &passif_entries {
        ins(conn, &Entry { label, parent_key: *pk, level: *lvl, order: *ord, is_total: *is_t, is_header: *is_h, key: *key, formula: *formula, sheet: "PASSIF" })?;
    }
    let passif_vals: &[(&str, f64, f64, f64)] = &[
        ("capital",         354480000.0,  354480000.0,  354480000.0),
        ("primes_res",      2575000.0,    2575000.0,    2575000.0),
        ("resultat_net_p",  -154344088.48,-182468393.0, -136942897.19),
        ("autres_cp",       -438766747.21,-516905803.0, -760493148.67),
        ("emprunts",        9684114.82,   1390781954.0, 1671801967.0),
        ("provisions",      40486561.25,  49501497.0,   34697631.0),
        ("fournisseurs",    159608284.61, 178648965.0,  199698588.0),
        ("impots_pc",       12042382.74,  15631940.0,   16846652.0),
        ("autres_dettes_c", 648970462.3,  445416701.0,  421858856.0),
        ("tres_passif",     0.0,          11852245.0,   128124235.0),
    ];
    for (k, v22, v23, v24) in passif_vals {
        val(conn, k, 1, 2022, Some(*v22))?;
        val(conn, k, 1, 2023, Some(*v23))?;
        val(conn, k, 1, 2024, Some(*v24))?;
    }

    // ──────────────────────────────── TR ─────────────────────────────────────
    // Feed TR as flat entries (all parent_id=NULL, order defines display)
    let tr_entries: &[(&str, i32, bool, bool, Option<&str>, Option<&str>)] = &[
        // label, order, is_total, is_header, key, formula
        ("Ventes et produits annexes",                        0,  false, false, Some("ventes"),          None),
        ("Variation stocks produits finis et en cours",       1,  false, false, Some("var_stocks"),      None),
        ("Production immobilisée",                            2,  false, false, Some("prod_immob"),      None),
        ("Subventions d'exploitation",                        3,  false, false, Some("subventions"),     None),
        ("PRODUCTION DE L'EXERCICE",                          4,  true,  false, Some("production"),      Some("sum:ventes,var_stocks,prod_immob,subventions")),
        ("Achats consommés",                                  5,  false, false, Some("achats"),          None),
        ("Services extérieurs et autres consommations",       6,  false, false, Some("services_ext"),    None),
        ("CONSOMMATION DE L'EXERCICE",                        7,  true,  false, Some("consommation"),    Some("sum:achats,services_ext")),
        ("VALEUR AJOUTÉE D'EXPLOITATION",                     8,  true,  false, Some("valeur_ajoutee"),  Some("add_sub:production|consommation")),
        ("Charges de personnel",                              9,  false, false, Some("charges_pers"),    None),
        ("Impôts, taxes et versements assimilés",             10, false, false, Some("impots_taxes"),    None),
        ("EXCÉDENT BRUT D'EXPLOITATION",                      11, true,  false, Some("ebe"),             Some("add_sub:valeur_ajoutee|charges_pers,impots_taxes")),
        ("Autres produits opérationnels",                     12, false, false, Some("autres_prod_op"),  None),
        ("Autres charges opérationnelles",                    13, false, false, Some("autres_chg_op"),   None),
        ("Dotations aux amortissements et provisions",        14, false, false, Some("dotations"),       None),
        ("Reprises sur pertes de valeur et provisions",       15, false, false, Some("reprises"),        None),
        ("RÉSULTAT OPÉRATIONNEL",                             16, true,  false, Some("res_op"),          Some("add_sub:ebe,autres_prod_op,reprises|autres_chg_op,dotations")),
        ("Produits financiers",                               17, false, false, Some("prod_fin"),        None),
        ("Charges financières",                               18, false, false, Some("chg_fin"),         None),
        ("RÉSULTAT FINANCIER",                                19, true,  false, Some("res_fin"),         Some("add_sub:prod_fin|chg_fin")),
        ("RÉSULTAT ORDINAIRE AVANT IMPÔTS",                   20, true,  false, Some("res_ord"),         Some("sum:res_op,res_fin")),
        ("Impôts exigibles sur résultats ordinaires",         21, false, false, Some("imp_exig"),        None),
        ("Impôts différés (variations) sur résultats ord.",   22, false, false, Some("imp_diff"),        None),
        ("TOTAL PRODUITS DES ACTIVITÉS ORDINAIRES",           23, true,  false, Some("total_prod"),      Some("sum:production,autres_prod_op,reprises,prod_fin")),
        ("TOTAL CHARGES DES ACTIVITÉS ORDINAIRES",            24, true,  false, Some("total_chg"),       Some("add_sub:consommation,charges_pers,impots_taxes,autres_chg_op,dotations,chg_fin,imp_exig|imp_diff")),
        ("RÉSULTAT NET DES ACTIVITÉS ORDINAIRES",             25, true,  false, Some("res_net_ord"),     Some("add_sub:total_prod|total_chg")),
        ("Éléments extraordinaires (produits)",               26, false, false, Some("extra_prod"),      None),
        ("Éléments extraordinaires (charges)",                27, false, false, Some("extra_chg"),       None),
        ("RÉSULTAT EXTRAORDINAIRE",                           28, true,  false, Some("res_extra"),       Some("add_sub:extra_prod|extra_chg")),
        ("RÉSULTAT NET DE L'EXERCICE",                        29, true,  false, Some("res_net"),         Some("sum:res_net_ord,res_extra")),
    ];
    for (label, ord, is_t, is_h, key, formula) in tr_entries {
        ins(conn, &Entry { label, parent_key: None, level: 0, order: *ord, is_total: *is_t, is_header: *is_h, key: *key, formula: *formula, sheet: "TR" })?;
    }
    let tr_vals: &[(&str, f64, f64, f64)] = &[
        ("ventes",       94614947.47,  204326780.78, 169560445.38),
        ("var_stocks",   -3907622.61,  -174647539.67,-58574707.19),
        ("prod_immob",   1027028.84,   0.0,          2441312.19),
        ("achats",       31600197.26,  41457561.74,  71104363.58),
        ("services_ext", 43141238.76,  19524919.67,  30104703.56),
        ("charges_pers", 108935765.62, 122859781.27, 125538608.15),
        ("impots_taxes", 3520955.11,   3271716.47,   8607151.82),
        ("autres_prod_op",368627.35,   530424.06,    10188860.29),
        ("autres_chg_op",11124020.37,  1127530.95,   6091709.83),
        ("dotations",    13569189.79,  25080112.18,  18066090.44),
        ("reprises",     0.0,          9154047.35,   25234037.45),
        ("prod_fin",     0.0,          0.0,          242872.86),
        ("chg_fin",      628415.51,    5404772.31,   39152564.07),
        ("imp_exig",     0.0,          9000.0,       -10000.0),
        ("imp_diff",     1222712.89,   3096711.82,   12639473.28),
    ];
    for (k, v22, v23, v24) in tr_vals {
        val(conn, k, 1, 2022, Some(*v22))?;
        val(conn, k, 1, 2023, Some(*v23))?;
        val(conn, k, 1, 2024, Some(*v24))?;
    }

    Ok(())
}

pub fn get_all_values(
    conn: &Connection, sheet_type: &str, company_id: i64,
) -> rusqlite::Result<Vec<(i64, i32, Option<f64>)>> {
    let mut stmt = conn.prepare(
        "SELECT fv.entry_id, fv.year, fv.value
         FROM financial_values fv
         JOIN financial_entries fe ON fe.id = fv.entry_id
         WHERE fe.sheet_type = ?1 AND fv.company_id = ?2
         ORDER BY fv.entry_id, fv.year"
    )?;
    let rows = stmt.query_map(params![sheet_type, company_id], |r| {
        Ok((r.get::<_, i64>(0)?, r.get::<_, i32>(1)?, r.get::<_, Option<f64>>(2)?))
    })?.filter_map(|r| r.ok()).collect();
    Ok(rows)
}

pub fn get_years(conn: &Connection, company_id: i64) -> rusqlite::Result<Vec<i32>> {
    let mut stmt = conn.prepare("SELECT year FROM app_years WHERE company_id = ?1 ORDER BY year")?;
    let years = stmt.query_map(params![company_id], |r| r.get(0))?.filter_map(|r| r.ok()).collect();
    Ok(years)
}

pub fn upsert_value(
    conn: &Connection, entry_id: i64, company_id: i64, year: i32, value: Option<f64>,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO financial_values (entry_id, company_id, year, value) VALUES (?1,?2,?3,?4)",
        params![entry_id, company_id, year, value],
    )?;
    Ok(())
}

pub fn add_year(conn: &Connection, company_id: i64, year: i32) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO app_years (company_id, year) VALUES (?1, ?2)",
        params![company_id, year],
    )?;
    Ok(())
}

pub fn get_entry_id_by_label(conn: &Connection, sheet_type: &str, label: &str) -> rusqlite::Result<Option<i64>> {
    conn.query_row(
        "SELECT id FROM financial_entries WHERE sheet_type = ?1 AND label = ?2 LIMIT 1",
        params![sheet_type, label],
        |r| r.get(0),
    ).map(Some).or_else(|e| {
        if e == rusqlite::Error::QueryReturnedNoRows { Ok(None) } else { Err(e) }
    })
}

// ─── PIN Auth ─────────────────────────────────────────────────────────────────

fn hash_pin(salt: &str, pin: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(format!("{}{}", salt, pin).as_bytes());
    hex::encode(hasher.finalize())
}

pub fn has_pin(conn: &Connection) -> bool {
    get_setting(conn, "pin_hash").map(|v| v.is_some()).unwrap_or(false)
}

pub fn setup_pin(conn: &Connection, pin: &str) -> Result<()> {
    let salt = format!("{:x}", rand_salt());
    let hash = hash_pin(&salt, pin);
    set_setting(conn, "pin_hash", &format!("{}:{}", salt, hash))
}

pub fn verify_pin(conn: &Connection, pin: &str) -> Result<bool> {
    match get_setting(conn, "pin_hash")? {
        None => Ok(false),
        Some(stored) => {
            let parts: Vec<&str> = stored.splitn(2, ':').collect();
            if parts.len() != 2 { return Ok(false); }
            Ok(hash_pin(parts[0], pin) == parts[1])
        }
    }
}

pub fn remove_pin(conn: &Connection) -> Result<()> {
    delete_setting(conn, "pin_hash")
}

fn rand_salt() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(0)
}

// ─── Retraitements ───────────────────────────────────────────────────────────

/// Returns (amort_anc, prov_stocks, prov_creances) for the journal de retraitement.
pub fn get_retraitements(conn: &Connection, company_id: i64, year: i32) -> rusqlite::Result<(f64, f64, f64)> {
    conn.query_row(
        "SELECT COALESCE(amort_anc,0), COALESCE(prov_stocks,0), COALESCE(prov_creances,0)
         FROM retraitements WHERE company_id = ?1 AND year = ?2",
        params![company_id, year],
        |r| Ok((r.get::<_, f64>(0)?, r.get::<_, f64>(1)?, r.get::<_, f64>(2)?)),
    ).or_else(|e| {
        if e == rusqlite::Error::QueryReturnedNoRows { Ok((0.0, 0.0, 0.0)) } else { Err(e) }
    })
}

pub fn set_retraitement(
    conn: &Connection, company_id: i64, year: i32,
    amort_anc: f64, prov_stocks: f64, prov_creances: f64,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO retraitements (company_id, year, amort_anc, prov_stocks, prov_creances)
         VALUES (?1,?2,?3,?4,?5)",
        params![company_id, year, amort_anc, prov_stocks, prov_creances],
    )?;
    Ok(())
}

// ─── Dettes par âge ──────────────────────────────────────────────────────────

/// Returns rows: (category_key, label, total_from_passif, moins_1_an)
pub fn get_dettes_par_age_rows(
    conn: &Connection, company_id: i64, year: i32,
) -> rusqlite::Result<Vec<(String, String, f64, f64)>> {
    let categories: &[(&str, &str)] = &[
        ("fournisseurs",    "Fournisseurs et comptes rattachés"),
        ("impots_pc",       "Impôts"),
        ("autres_dettes_c", "Autres dettes"),
    ];

    let mut result = Vec::new();
    for (key, label) in categories {
        let total: f64 = conn.query_row(
            "SELECT COALESCE(fv.value, 0) FROM financial_values fv
             JOIN financial_entries fe ON fe.id = fv.entry_id
             WHERE fe.entry_key = ?1 AND fv.company_id = ?2 AND fv.year = ?3",
            params![key, company_id, year],
            |r| r.get::<_, f64>(0),
        ).unwrap_or(0.0);

        // Default: all is DCT (moins 1 an = total) if no entry exists yet
        let moins_1_an: f64 = conn.query_row(
            "SELECT moins_1_an FROM dettes_par_age WHERE company_id = ?1 AND year = ?2 AND category = ?3",
            params![company_id, year, key],
            |r| r.get::<_, f64>(0),
        ).unwrap_or(total);

        result.push((key.to_string(), label.to_string(), total, moins_1_an));
    }
    Ok(result)
}

pub fn set_dette_age(
    conn: &Connection, company_id: i64, year: i32, category: &str, moins_1_an: f64,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO dettes_par_age (company_id, year, category, moins_1_an) VALUES (?1,?2,?3,?4)",
        params![company_id, year, category, moins_1_an],
    )?;
    Ok(())
}
