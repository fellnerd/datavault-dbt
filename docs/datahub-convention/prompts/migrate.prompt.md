---
mode: 'agent'
description: 'Migriert ein Wherescape-Objekt aus dem Produktions-Datahub (sqlbi01) in ein dbt Model. Analysiert Schema, Abhängigkeiten, Custom Functions und erstellt vollständigen dbt Code.'
tools: ['changes', 'editFiles', 'fetch', 'problems', 'runCommands', 'search', 'terminalLastCommand']
---
# /migrate — Wherescape → dbt Migration

Migriere ein bestehendes Wherescape-Objekt aus dem Produktions-Datahub in ein dbt Model.

## Eingabe

Der User gibt an:
- **Objektname** (z.B. `hub_mitarbeiter`, `dim_kostenstelle`, `sat_catsco__sap_co`)
- **Datenbank** (VAULT, DATAHUB, STAGE_HUB — Default: VAULT)
- Optional: **Schema** (wenn nicht eindeutig)

## Ablauf

### Phase 1: Analyse (sqlbi01)

1. Verbinde dich zu `sqlbi01` via `mssql_connect`
2. Finde das Objekt:
   ```sql
   SELECT s.name, t.name, t.type_desc FROM sys.tables t
   JOIN sys.schemas s ON t.schema_id = s.schema_id
   WHERE t.name LIKE '%<objekt>%'
   ```
3. Lies Schema (Spalten, Typen, PKs)
4. Lies Abhängigkeiten (wer referenziert, wer wird referenziert)
5. Suche Custom Functions: `custom_func_<objekt>`, `user_<objekt>`
6. Bei Custom Function: Code lesen via `OBJECT_DEFINITION()`

### Phase 2: Planung

Basierend auf Analyse bestimme:
- **Objekttyp**: Hub / Satellite / Link / Dimension / Fakt / BV / View
- **Concept/Schema**: In welchen dbt Ordner (`raw_vault/<concept>/`, `mart/<concept>/`)
- **Quellsystem**: Aus Spaltenname `dss_record_source` ableiten
- **Abhängigkeiten**: Welche dbt Models müssen vorher existieren?
- **Custom Function Logik**: Was muss in dbt SQL übersetzt werden?

Zeige dem User den Plan und frage um Bestätigung.

### Phase 3: Erstellung

Erstelle die dbt Dateien gemäß der passenden Skills:
- **Staging**: `.github/copilot/skills/create-dv-entity/` oder `/create-dv-link/`
- **Raw Vault**: `.github/copilot/skills/create-dv-entity/` Hub + Sat
- **Mart**: `.github/copilot/skills/create-mart-object/`
- **Business Vault**: Direkt als dbt Model (Custom Function Logic)

Beachte zwingend:
- `.github/instructions/wherescape-migration.instructions.md`
- `.github/instructions/datahub-confluence.instructions.md`
- `.github/copilot/skills/wherescape-to-dbt/references/migration-checklist.md`

### Phase 4: Validierung

```bash
dbt compile --select <model_name>
```

Prüfe compiled SQL auf:
- CONVERT (nicht CAST) für Hash-Berechnung
- NULL → '-1' Behandlung 
- LTRIM/RTRIM auf Hash-Spalten
- Alphabetische BK-Sortierung
- as_columnstore: false

### Phase 5: Dokumentation

1. Schema YAML aktualisieren
2. ER-Diagramm aktualisieren
3. Checkliste aus migration-checklist.md abarbeiten
4. Hinweis auf Confluence-Update (via @confluence-sync)

## Regeln

- **NIEMALS** schreibende Operationen auf sqlbi01
- **NIEMALS** `dbt run` ohne User-Zustimmung
- Bei Unklarheiten: Frage den User
- Custom Functions 1:1 in dbt SQL übersetzen (keine Logik-Änderungen)
- Bestehende Namenskonventionen einhalten
