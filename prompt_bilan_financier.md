# Claude Code Prompt — Desktop App: Bilan Financier & Journal de Retraitement Generator

## Input File Structure — How to Read the 3 Source Sheets

Use `openpyxl` with `data_only=True` to read calculated values.

### Sheet: `ACTIF`
Columns: A = Libellé, B = Brut, C = Amorti./Provisions, D = Net

Read the following cells by their **fixed row numbers**:

```python
actif = ws_actif  # wb['ACTIF']

immo_incor_amort    = actif['C6'].value or 0   # Amortissements Immob. incorporelles
immo_cor_amort      = actif['C7'].value or 0   # Amortissements Immob. corporelles (total)
stocks_prov         = actif['C21'].value or 0  # Provisions sur stocks
creances_prov       = actif['C22'].value or 0  # Provisions sur créances (total)
autres_prov_c24     = actif['C24'].value or 0  # Provisions autres créances - Autres débiteurs
autres_prov_c25     = actif['C25'].value or 0  # Provisions autres créances - Impôts
autres_prov_c26     = actif['C26'].value or 0  # Provisions autres créances - Autres créances
autres_prov_total   = autres_prov_c24 + autres_prov_c25 + autres_prov_c26

net_actif_non_courant = actif['D19'].value or 0  # Net Total Actif Non Courant
net_tresorerie        = actif['D29'].value or 0  # Net Trésorerie
net_actif_courant     = actif['D30'].value or 0  # Net Total Actif Courant

brut_immo_incor   = actif['B6'].value or 0
brut_immo_cor     = actif['B7'].value or 0
brut_immo_cours   = actif['B12'].value or 0
```

### Sheet: `PASSIF`
Column B = Exercice N values

```python
passif = ws_passif  # wb['PASSIF']

capital_emis        = passif['B5'].value or 0
primes_reserves     = passif['B8'].value or 0
resultat_net        = passif['B11'].value or 0   # Links to TR!B34 — read as value
report_a_nouveau    = passif['B12'].value or 0
total_cp            = passif['B16'].value or 0   # TOTAL CAPITAUX PROPRES I
emprunts_dettes     = passif['B18'].value or 0
impots_diff         = passif['B19'].value or 0
autres_dettes_nc    = passif['B20'].value or 0
provisions_pca      = passif['B21'].value or 0
total_passif_nc     = passif['B22'].value or 0   # TOTAL PASSIFS NON COURANTS II
fournisseurs        = passif['B24'].value or 0
impots_courants     = passif['B25'].value or 0
autres_dettes_c     = passif['B26'].value or 0
tresorerie_passif   = passif['B27'].value or 0   # may be 0
total_passif_c      = passif['B28'].value or 0   # TOTAL PASSIFS COURANTS III
```

### Sheet: `TR` — Tableau des Résultats
Column B = réalisation N

```python
tr = ws_tr  # wb['TR']
resultat_net_exercice = tr['B34'].value or 0   # Résultat Net de l'exercice
```

> ⚠️ If `PASSIF!B11` is an Excel formula referencing TR (e.g. `=TR!B34`), reading with `data_only=True` gives the cached value. If it reads as `None`, fall back to `tr['B34'].value`.

---

## Calculation Logic

### Step 1 — Journal de Retraitement

The journal has two parts: **restatement entries** and **debt aging**.

#### Part A: Restatement Entries

Compute each restatement amount in Python, then write them as plain values into the output sheet.

```python
# Restatement amounts
j_immo_incor  = immo_incor_amort          # Débit/Crédit account 28/116
j_immo_cor    = immo_cor_amort            # Débit/Crédit account 28/116
j_creances    = creances_prov             # Débit/Crédit account 48/116
j_stocks      = stocks_prov              # Débit/Crédit account 39/116
j_autres      = autres_prov_total        # Autres retraitements d'actif

# Journal total (Débit = Crédit — must always be equal)
journal_total = j_immo_incor + j_immo_cor + j_creances + j_stocks + j_autres
```

#### Part B: Debt Aging

The "Moins 1 an" values come from the **user inputs** in the UI. The "Plus 1 an" = Total − Moins 1 an.

```python
# Totals pulled from PASSIF
dette_fournisseurs_total = fournisseurs       # PASSIF B24
dette_impots_total       = impots_courants    # PASSIF B25
dette_autres_total       = autres_dettes_c    # PASSIF B26

# "Moins 1 an" — entered by user in the UI
moins1an_fournisseurs = float(ui_input_fournisseurs.get() or 0)
moins1an_impots       = float(ui_input_impots.get() or 0)
moins1an_autres       = float(ui_input_autres.get() or 0)

# "Plus 1 an" — calculated
plus1an_fournisseurs = dette_fournisseurs_total - moins1an_fournisseurs
plus1an_impots       = dette_impots_total - moins1an_impots
plus1an_autres       = dette_autres_total - moins1an_autres

# Totals row
total_dettes         = dette_fournisseurs_total + dette_impots_total + dette_autres_total
total_moins1an       = moins1an_fournisseurs + moins1an_impots + moins1an_autres
total_plus1an        = plus1an_fournisseurs + plus1an_impots + plus1an_autres
```

---

### Step 2 — Bilan Financier

All values are computed in Python from the parsed data and the journal calculations above.

#### ACTIF Side

```python
# Actifs Fixes = Net Non-Courant + amortissements IMMO INCOR + amortissements IMMO COR
# (re-adding amortization restores gross value for financial analysis)
actifs_fixes = net_actif_non_courant + j_immo_incor + j_immo_cor

# Actifs Circulants = Net Courant + provisions créances - trésorerie
# (trésorerie is separated into its own line; provisions re-added to gross receivables)
actifs_circulants = net_actif_courant + j_creances - net_tresorerie

# Disponibilités = Trésorerie net
disponibilites = net_tresorerie

# TOTAL ACTIF
total_actif = actifs_fixes + actifs_circulants + disponibilites
```

#### PASSIF Side

```python
# Capitaux Propres retraités = PASSIF total CP + all credit restatement entries
# (the journal credits to account 116 increase equity in the analytical view)
cp_retraite = total_cp + j_immo_incor + j_immo_cor + j_creances + j_stocks + j_autres

# D.L.M.T = Non-current liabilities + "Plus 1 an" portions of current debts
dlmt = total_passif_nc + plus1an_fournisseurs + plus1an_impots + plus1an_autres

# D.C.T = "Moins 1 an" portions of current debts
dct = moins1an_fournisseurs + moins1an_impots + moins1an_autres

# TOTAL PASSIF — must equal TOTAL ACTIF
total_passif = cp_retraite + dlmt + dct

# % ratios
pct_actifs_fixes      = actifs_fixes / total_actif if total_actif else 0
pct_actifs_circulants = actifs_circulants / total_actif if total_actif else 0
pct_disponibilites    = disponibilites / total_actif if total_actif else 0

pct_cp    = cp_retraite / total_passif if total_passif else 0
pct_dlmt  = dlmt / total_passif if total_passif else 0
pct_dct   = dct / total_passif if total_passif else 0

# Capitaux permanents = CP + DLMT
capitaux_permanents = cp_retraite + dlmt
pct_cap_perm = capitaux_permanents / total_passif if total_passif else 0
```

#### PASSIF Detail Sub-items (breakdown inside Bilan_financier)

```python
# Individual items shown under each PASSIF category
# Read directly from source — no restatement applied at item level
detail_capital_emis   = capital_emis
detail_primes         = primes_reserves
detail_resultat       = resultat_net_exercice
detail_report         = report_a_nouveau
detail_total_cp_sous  = capital_emis + primes_reserves + resultat_net_exercice + report_a_nouveau

detail_emprunts       = emprunts_dettes
detail_provisions_pca = provisions_pca
detail_total_dlmt_sous = emprunts_dettes + impots_diff + autres_dettes_nc + provisions_pca

detail_fournisseurs   = fournisseurs
detail_impots_c       = impots_courants
detail_autres_c       = autres_dettes_c
detail_total_dct_sous = fournisseurs + impots_courants + autres_dettes_c + (tresorerie_passif or 0)
```

---

## Validation Logic (run before saving)

```python
# 1. Journal must balance — both sides always equal journal_total by construction
#    Display both values to confirm they match
debit_total  = journal_total
credit_total = journal_total

# 2. Balance sheet must balance
bilan_balanced = abs(total_actif - total_passif) < 0.01  # tolerance for float rounding
difference     = total_actif - total_passif

# Show results in UI before allowing save
```

---

## Output Excel File Structure

Write a new `.xlsx` file with 5 sheets in this order: `ACTIF`, `PASSIF`, `TR`, `Journal_retraitement`, `Bilan_financier`.

Copy the original 3 sheets row-by-row using openpyxl (values only, no formula strings). Then write the 2 new computed sheets.

### Writing `Journal_retraitement`

```
Row 3  : Title — B3="Journal de retraitements"
Row 6  : Headers — B6="Comptes", D6="Libellés", I6="Montants"
Row 7  : Sub-headers — B7="Débit", C7="Crédit", I7="Débit", J7="Crédit"

Row 8  : B=28,  D="Retraitement dotations amortissements IMMO INCOR", I=j_immo_incor
Row 9  : C=116, D="Retraitement dotations amortissements IMMO INCOR", J=j_immo_incor
Row 10 : B=28,  D="Retraitement dotations amortissements IMMO COR",   I=j_immo_cor
Row 11 : C=116, D="Retraitement dotations amortissements IMMO COR",   J=j_immo_cor
Row 12 : B=48,  D="Retraitement Provisions sur créances",             I=j_creances
Row 13 : C=116, D="Retraitement Provisions sur créances",             J=j_creances
Row 14 : B=39,  D="Retraitement stocks",                              I=j_stocks
Row 15 : C=116, D="Retraitement des stocks",                          J=j_stocks
Row 16 : D="Autres retraitements d'actif",                            I=j_autres
Row 17 : D="Autres retraitements d'actif",                            J=j_autres

Row 24 : B="Total journal", I=journal_total, J=journal_total

Row 27 : B="Dettes par age"
Row 29 : Headers — B="Désignations", F="Total", H="Moins 1 an", J="Plus 1 an"
Row 30 : B="Fournisseurs...", F=dette_fournisseurs_total, H=moins1an_fournisseurs, J=plus1an_fournisseurs
Row 31 : B="Impôts",         F=dette_impots_total,       H=moins1an_impots,       J=plus1an_impots
Row 32 : B="Autres dettes",  F=dette_autres_total,       H=moins1an_autres,       J=plus1an_autres
Row 33 : B="TOTAL",          F=total_dettes,             H=total_moins1an,        J=total_plus1an
```

### Writing `Bilan_financier`

```
=== ACTIF SIDE (left) ===
B5="ACTIF"
B7="LIBELLE", C7="N", D7="%"

B10="ACTIFS NON COURANTS"
B25="Actifs Fixes",        C25=actifs_fixes,       D25=pct_actifs_fixes  (as %)
B26="ACTIF COURANT"
B36="Actifs Circulants",   C36=actifs_circulants,  D36=pct_actifs_circulants
B37="Disponibilités",      C37=disponibilites,     D37=pct_disponibilites
B38="TOTAL ACTIF",         C38=total_actif,        D38=1.0  (100%)

=== PASSIF SUMMARY (right, same rows) ===
F8="Capitaux Propres",     G8=cp_retraite
F18="TOTAL CP",            G18=cp_retraite
F19="D.L.M.T",             G19=dlmt
F24="TOTAL D.L.M.T",       G24=dlmt
F25="D.C.T",               G25=dct
F30="TOTAL D.C.T",         G30=dct
F31="TOTAL PASSIF",        G31=total_passif

=== PASSIF DETAIL (below, rows 41–67) ===
B41="PASSIF"
B43="LIBELLE", C43="N"

B44="Capitaux Propres",   C44=cp_retraite,  D44=pct_cp,  E44="Capitaux permanents",  F44=capitaux_permanents,  G44=pct_cap_perm
B45="Capital émis",       C45=capital_emis
B47="Primes et réserves", C47=primes_reserves
B50="Résultat net",       C50=resultat_net_exercice
B51="Autres cap. propres",C51=report_a_nouveau
B54="TOTAL",              C54=detail_total_cp_sous

B55="D.L.M.T",            C55=dlmt,         D55=pct_dlmt
B56="Emprunts",           C56=emprunts_dettes
B59="Provisions PCA",     C59=provisions_pca
B60="TOTAL",              C60=detail_total_dlmt_sous

B61="D.C.T",              C61=dct,          D61=pct_dct
B62="Fournisseurs",       C62=fournisseurs
B63="Impôts",             C63=impots_courants
B64="Autres dettes",      C64=autres_dettes_c
B66="TOTAL",              C66=detail_total_dct_sous

B67="TOTAL PASSIF",       C67=total_passif,  D67=1.0  (100%)
```

---

## Formatting Rules for the Output File

- **Bold** all header rows and TOTAL rows
- **Number format** for all value cells: `#,##0` (thousands separator, no decimals)
- **Percentage format** for all % cells: `0.0%`
- **Column widths:** A/B = 40, C/D = 18, F/G = 40, H/I/J = 18
- **Font:** Arial 10pt throughout
- Use a **light grey fill** (`D9D9D9`) on all header and total rows
- Use a **blue font** (`0070C0`) for the TOTAL ACTIF and TOTAL PASSIF rows


---

## Key Accounting Rules (do not deviate from these)

| Computed Value | Formula |
|---------------|---------|
| Actifs Fixes | `Net Actif Non Courant + Amort IMMO INCOR + Amort IMMO COR` |
| Actifs Circulants | `Net Actif Courant + Provisions créances − Trésorerie` |
| Disponibilités | `Net Trésorerie` |
| Total Actif | `Actifs Fixes + Actifs Circulants + Disponibilités` |
| Capitaux Propres retraités | `Total CP (PASSIF) + Amort INCOR + Amort COR + Prov créances + Prov stocks + Autres prov` |
| D.L.M.T | `Total Passifs Non Courants + Plus 1 an (Fournisseurs + Impôts + Autres dettes)` |
| D.C.T | `Moins 1 an (Fournisseurs + Impôts + Autres dettes)` |
| Total Passif | `CP retraité + D.L.M.T + D.C.T` |
| Journal Total (Débit = Crédit) | `Amort INCOR + Amort COR + Prov créances + Prov stocks + Autres prov` |
| Plus 1 an (per debt line) | `Total debt line − Moins 1 an` |

---

## Error Handling

- If the uploaded file does not contain sheets named exactly `ACTIF`, `PASSIF`, `TR` → show a clear error message in the UI, do not crash.
- If a source cell is empty or `None` → treat as `0` (already shown in the reader code above).
- If `total_actif ≠ total_passif` after calculation → show the imbalance in the UI but still allow saving (the user may need to investigate the source data).
- Wrap the entire generation pipeline in a try/except and display any unexpected error in the UI feedback panel.
