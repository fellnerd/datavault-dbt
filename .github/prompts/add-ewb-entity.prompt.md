---
mode: agent
description: "Erstellt eine neue EWB Entity end-to-end: Staging → Vault → Tests → Design-Doku"
---

# Neue EWB Entity hinzufügen

Erstelle die vollständige Data Vault Implementierung für eine neue Abacus Parquet-Datei.

## Input
Parquet-Datei: `{{parquet_file}}`

## Workflow

### Schritt 1: Staging erstellen
Verwende den @staging-engineer Workflow:
1. `get_parquet_schema` für die Parquet-Datei ausführen
2. Types korrigieren (DECIMAL(38,18), VARBINARY(8000) für APPSTR)
3. `sources.yml` Eintrag unter `# ===== EWB / ABACUS =====`
4. Staging SQL mit 5-Block-Struktur (`models/staging/ewb_<modul>_<tabelle>_<suffix>.sql`)
5. `_staging__models.yml` Eintrag mit config.meta + Tests
6. `.vscode/entity-designer/<entity>.json` erstellen
7. `design/staging/ewb/<entity>.md` erstellen

### Schritt 2: Deploy & Verify Staging
```bash
cd /Users/daniel/source/projects/ppmc/ewb/datavault-dbt
source .venv/bin/activate && set -a && source .env && set +a
dbt run-operation stage_external_sources --target ewb-dev
dbt run --select "ewb_<modul>_<tabelle>_<suffix>" --target ewb-dev
dbt test --select "ewb_<modul>_<tabelle>_<suffix>" --target ewb-dev
```

### Schritt 3: Vault-Objekte erstellen
Verwende den @vault-architect Workflow:
1. Business Keys, Foreign Keys, Payload aus dem Staging analysieren
2. Hub/Satellite/Link erstellen (`models/raw_vault/ewb/`)
3. Schema-YAML `_ewb__models.yml` aktualisieren
4. Design-Doku in `design/raw-vault/ewb/` aktualisieren

### Schritt 4: Gesamtverifikation
- `dbt run --select "+raw_vault.ewb" --target ewb-dev`
- `dbt test --select "raw_vault.ewb" --target ewb-dev`
- DB-Objekte via MSSQL MCP prüfen

## Referenzen
- Goldenes Staging-Beispiel: `models/staging/ewb_fibu_fhe_main.sql`
- Adworks Hub-Pattern: `models/raw_vault/adworks/hubs/hub_kunde.sql`
- Adworks Sat-Pattern: `models/raw_vault/adworks/satellites/sat_kunde.sql`
