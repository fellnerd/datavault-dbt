---
description: 'Erstellt eine komplette Data Vault Entität: External Table, Staging View, Hub, Satellite, Current View, Schema YAML und ER-Diagramm.'
mode: 'agent'
tools: ['changes', 'editFiles', 'fetch', 'findTestFiles', 'githubRepo', 'problems', 'runCommands', 'search', 'terminalLastCommand', 'terminalSelection', 'testFailure', 'usages', 'vscodeAPI']
---
# Neue Data Vault Entität erstellen

Du bist ein Data Vault 2.0 Entwickler. Erstelle eine komplette Entität nach den Confluence ITDATAH Richtlinien.

## Kontext

Lies zuerst diese Dateien um die Projekt-Regeln zu verstehen:
- `.github/instructions/datavault-dbt.instructions.md` (Architektur & Schema-Naming)
- `.github/instructions/dbt-staging.instructions.md` (Staging-Regeln)
- `.github/instructions/dbt-hub.instructions.md` (Hub-Regeln)
- `.github/instructions/dbt-satellite.instructions.md` (Satellite-Regeln)
- `.github/copilot/skills/create-dv-entity/SKILL.md` (Workflow-Details)

## Frage den User nach

1. **Quelltabelle** — Name und Schema der Quelltabelle
2. **Business Key Spalten** — Welche Spalten identifizieren einen Record eindeutig? (Natural Keys bevorzugen)
3. **Source System Key** — z.B. `sap_co`, `jira`, `sap_hcm` (siehe Confluence §11)
4. **Concept** — Ordner unter `models/raw_vault/` (z.B. `sap_co`, `jira`)
5. **Spaltenliste** — Alle Spalten mit Datentypen (oder: aus DB lesen?)

## Workflow

Erstelle in dieser Reihenfolge:

### 1. External Table in sources.yml
Füge die Tabelle in `models/staging/sources.yml` hinzu mit allen Spalten.

### 2. Staging View
Datei: `models/staging/{concept}_{entity}.sql`
- `automate_dv.stage()` mit `derived_columns` und `hashed_columns`
- BK alphabetisch sortieren
- `dss_business_key = CONCAT_WS('||', 'default', 'default', BK1, ..., BKn)`
- Kommentar-Header mit Schicht, Source, BK-Spalten

### 3. Hub
Datei: `models/raw_vault/{concept}/hubs/hub_{entity}.sql`
- `automate_dv.hub()` mit `src_extra_columns: ['dss_business_key', 'dss_create_datetime']`
- Kommentar-Header

### 4. Satellite
Datei: `models/raw_vault/{concept}/satellites/sat_{entity}__{system}.sql`
- `automate_dv.sat()` mit `src_extra_columns: ['dss_create_datetime']`
- Alle non-BK Attribute im `src_payload`

### 5. Current View
Datei: `models/raw_vault/{concept}/satellites/sat_{entity}__{system}_current_v.sql`
- `satellite_current_view()` Macro

### 6. Schema YAML
Datei: `models/raw_vault/{concept}/_{concept}__models.yml`
- Alle 3 Models (Hub, Sat, Current View)
- Tests: not_null + unique auf HK, relationships Sat→Hub

### 7. ER-Diagramm
Datei: `design/raw-vault/{concept}/er-diagram.mmd`
- Hub und Satellite mit Beziehung

### 8. dbt_project.yml (falls neues Concept)
Schema-Config unter `models: raw_vault:`

## Validierung

Nach Erstellung: `dbt compile --select +raw_vault.{concept}.hub_{entity} +raw_vault.{concept}.sat_{entity}__{system}`

## Regeln

- **KEINE** `dbt run` ohne User-Zustimmung
- SHA2_256, CONVERT (nicht CAST), NULL→'-1', LTRIM/RTRIM
- dss_record_source: NVARCHAR(255), Format `{system}.{db}.{schema}.{table}`
- BK-Sortierung: alphabetisch überall
- Satellite-Trennung beachten (6 Kriterien)
