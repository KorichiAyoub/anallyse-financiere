---
name: multi-agent
description: 'Multi-agent architecture for building an offline financial analysis desktop app from Excel templates. Use when designing, validating, or implementing the orchestrator/analyzer/schema/backend/UI/validation/refinement/packaging agents pipeline.'
---

# Financial App Builder AI (Multi-Agent Architecture)

## Goal

Autonomously design, validate, and implement an offline financial analysis desktop application based on structured Excel templates.

---

## 🧩 CORE AGENTS

### 1. ORCHESTRATOR AGENT (Brain)

ROLE:

* Controls the workflow
* Assigns tasks to agents
* Tracks progress
* Handles retries & failures

INPUT:

* User prompt (your README spec)
* Excel template (.xlsx)

OUTPUT:

* Task plan
* Execution pipeline

DECISION LOGIC:

* If task incomplete → reassign
* If validation fails → trigger refinement loop
* If ambiguity → request clarification or fallback to assumptions log

---

### 2. DATA ANALYZER AGENT

ROLE:

* Parses Excel file
* Extracts structure (hierarchy, sheets, years)

INPUT:

* template.xlsx

OUTPUT:

* JSON schema:
  {
  sheets: [],
  hierarchy: {},
  years: [],
  totals: []
  }

DECISION LOGIC:

* Detect parent-child relationships
* Identify computed rows (totals)
* If ambiguity → mark as "uncertain"

---

### 3. SCHEMA DESIGN AGENT

ROLE:

* Converts extracted structure → database schema

INPUT:

* JSON schema (from Data Analyzer)

OUTPUT:

* SQLite schema (tables + relations)

DECISION LOGIC:

* If hierarchical → use self-referencing table
* If multi-year → normalize into values table
* If mismatch → send back to Data Analyzer

---

### 4. BACKEND LOGIC AGENT

ROLE:

* Builds calculation engine

INPUT:

* schema
* financial rules

OUTPUT:

* Functions:

  * compute totals
  * compute ratios
  * validation rules

DECISION LOGIC:

* Totals = recursive sum
* Ratios = derived values
* If inconsistency → flag to Validator

---

### 5. UI GENERATOR AGENT

ROLE:

* Builds React UI

INPUT:

* schema
* hierarchy

OUTPUT:

* Components:

  * TreeTable
  * EditableCells
  * Dashboard

DECISION LOGIC:

* If hierarchical → tree UI
* If multi-year → dynamic columns

---

### 6. VALIDATION AGENT (CRITICAL)

ROLE:

* Verifies correctness of:

  * data structure
  * calculations
  * UI consistency

INPUT:

* outputs from all agents

OUTPUT:

* validation report (pass/fail + issues)

DECISION LOGIC:

* If totals mismatch → FAIL
* If missing hierarchy → FAIL
* If UI mismatch with schema → FAIL

---

### 7. REFINEMENT AGENT

ROLE:

* Fixes issues found by Validator

INPUT:

* validation report

OUTPUT:

* corrected code / schema / logic

DECISION LOGIC:

* Loop until:
  validation == PASS

---

### 8. PACKAGING AGENT

ROLE:

* Builds final app

INPUT:

* validated codebase

OUTPUT:

* .exe / .AppImage

DECISION LOGIC:

* Ensure no external dependencies
* Verify offline execution

---

## 🔄 WORKFLOW (FLOWCHART)

START
↓
Orchestrator
↓
Data Analyzer → Extract structure
↓
Schema Agent → Build DB
↓
Backend Agent → Build logic
↓
UI Agent → Build interface
↓
Validation Agent
↓
[IF FAIL]
→ Refinement Agent → Back to relevant agent
↓
[IF PASS]
↓
Packaging Agent
↓
END (Deployable App)

---

## 🔁 FEEDBACK LOOPS

Loop Condition:

* Validation fails
* Ambiguity detected
* Missing data

Loop Path:
Validator → Refinement → Specific Agent → Validator

Max Iterations:

* 5 retries per module
* Then escalate to Orchestrator

---

## ❌ FAILURE HANDLING

Case 1: Excel parsing fails
→ fallback:

* treat as flat structure
* log warning

Case 2: Schema mismatch
→ rollback schema
→ re-run Data Analyzer

Case 3: Calculation inconsistency
→ isolate faulty node
→ recompute subtree

Case 4: Infinite loop
→ break after max retries
→ flag manual intervention

---

## ⚡ OPTIMIZATION

* Cache parsed Excel structure
* Memoize computed totals
* Lazy load UI tree nodes
* Batch DB writes

---

## 📈 SCALABILITY

Supports:

* Multiple companies (future)
* Unlimited years (dynamic columns)
* Large datasets (thousands of rows)

Design choices:

* normalized DB
* modular agents
* stateless processing

---

## 🧠 SYSTEM GUARANTEES

* No hallucinated structure
* Financial consistency enforced
* Deterministic outputs
* Offline-ready application

---

END SYSTEM DESIGN
