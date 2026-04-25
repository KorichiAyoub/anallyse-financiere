PROJECT: Offline Desktop Financial Analysis Software (Algerian Standard Format)

GOAL:
Build a cross-platform desktop application that reproduces and automates financial statements based on Algerian Excel templates:

* ACTIF
* PASSIF
* TR (Compte de résultat)
* Bilan Financier

The application must:

* Work fully offline
* Be installable without dependencies
* Follow the exact hierarchical structure of the provided Excel file

---

TECH STACK:

* Framework: Tauri
* Frontend: React (TypeScript)
* Local DB: SQLite
* Styling: TailwindCSS

---

CORE ARCHITECTURE:

The system must support **hierarchical financial data with multi-year values**.

---

DATABASE DESIGN:

TABLE: financial_entries

* id
* label (string)
* type (ACTIF | PASSIF | TR)
* parent_id (nullable, self-reference)
* level (integer: 0=category, 1=subcategory, 2=item)
* order_index (for display order)
* is_total (boolean) → indicates computed fields

TABLE: financial_values

* id
* entry_id (FK → financial_entries)
* year (integer: 2022, 2023, 2024, etc.)
* value (number)

---

SHEETS TO IMPLEMENT:

1. ACTIF

* Sections:

  * Actifs non courants
  * Actifs courants
* Includes:

  * Immobilisations
  * Créances
  * Trésorerie
* Must compute totals:

  * Total Actif Non Courant
  * Total Actif Courant

---

2. PASSIF

* Sections:

  * Capitaux propres
  * Dettes
* Must compute:

  * Total Passif

---

3. TR (Compte de Résultat)

* Includes:

  * Produits
  * Charges
* Must compute:

  * Résultat net

---

4. BILAN FINANCIER

* Combines ACTIF + PASSIF
* Includes:

  * Ratios (Tx columns)
* Must compute:

  * Ratios dynamically (not stored)

---

UI REQUIREMENTS:

* Excel-like interface
* Tree table (hierarchical display)

  * Expand / collapse nodes
* Columns = years (dynamic)
* Editable numeric cells
* Non-editable computed fields (totals)

---

CALCULATION ENGINE:

* Parent values = sum of children
* Totals must be computed recursively
* Ratios (Tx) must be calculated dynamically:
  Example:

  * Tx = (current year - previous year) / previous year

---

IMPORT FEATURE (VERY IMPORTANT):

* Allow user to import `.xlsx`
* Parse all 4 sheets:

  * ACTIF
  * PASSIF
  * TR
  * Bilan_financier
* Automatically map:

  * hierarchy
  * labels
  * values per year

---

EXPORT FEATURES:

* Export to Excel (.xlsx)
* Export Bilan to PDF

---

DATA BEHAVIOR:

* Data stored locally (SQLite)
* No internet usage
* Auto-save changes

---

INSTALLATION:

* Build:

  * Windows (.exe)
  * Linux (.AppImage)
* No required setup for user

---

IMPORTANT RULES:

* DO NOT flatten the structure
* DO NOT hardcode years (must support dynamic years)
* DO NOT store totals in DB (compute them)
* MUST preserve exact order of Excel rows

---

DEVELOPMENT STEPS:

1. Parse Excel structure
2. Build DB schema
3. Implement tree UI
4. Implement calculation engine
5. Implement import/export
6. Package app

---

FOCUS:

Accuracy of financial structure > UI beauty
Must match real accounting formats used in Algeria
