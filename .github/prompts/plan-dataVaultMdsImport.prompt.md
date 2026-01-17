# Plan: Data Vault → MDS Import via dbt Pipeline (Final)

**TL;DR:** Settings-Seite ermöglicht Verbindung zu dbt Git-Repo (Clone bei Connect). Config Parser extrahiert verfügbare Objekte für Mapping-UI. Worker führt `dbt run` auf geklontem Repo aus, liest read-only aus Data Vault und schreibt per Full-Replace in MDS-Staging. Trigger: Manuell oder Schedule.

## Steps

### 1. Settings: dbt-Quelle konfigurieren + Connect
Neue Tabelle `mds_meta.import_source` mit Feldern:
- `git_url` - Repository URL
- `git_branch` - Branch (default: main)
- `dbt_project_path` - Pfad im Repo (default: /)
- `dbt_target` - dbt Target Profile
- `local_path` - Lokaler Temp-Pfad nach Clone
- `status` - `disconnected` | `connecting` | `connected` | `error`
- `last_connected_at` - Timestamp
- `error_message` - Fehlertext bei Status=error

Settings-UI unter "Datenquellen" mit:
- Formular für Git-Verbindungsdaten
- **"Connect" Button** → löst Clone + Validierung aus
- Status-Anzeige (Icon + Text)
- "Disconnect" Button → löscht temp-Verzeichnis

API-Endpoints:
- `GET /api/settings/import-source` - Aktuelle Konfiguration
- `POST /api/settings/import-source` - Speichern (ohne Connect)
- `POST /api/settings/import-source/connect` - Clone + Validierung
- `POST /api/settings/import-source/disconnect` - Cleanup

### 2. Connect-Flow (API: /connect)
```
1. Git clone --depth 1 --branch {branch} {url} → /tmp/mds-dbt-source/
2. Validiere dbt_project.yml existiert
3. Parse dbt_project.yml → prüfe erwartete Struktur:
   - models/ Verzeichnis vorhanden
   - model-paths konfiguriert
   - Mindestens ein Schema definiert (staging, raw_vault, etc.)
4. Wenn valid → Status = "connected", speichere local_path
5. Wenn invalid → Status = "error", error_message setzen, temp löschen
```

**Erwartete dbt-Projekt-Struktur (Template):**
```yaml
# dbt_project.yml
model-paths: ["models"]
models:
  <project_name>:
    staging:      +schema: stg
    raw_vault:
      hubs:       +schema: vault
      satellites: +schema: vault
      links:      +schema: vault
    business_vault: +schema: vault
    mart:         +schema: mart_*
```

### 3. dbt Config Parser
Neuer Service `masterdata/src/lib/dbt/config-parser.ts` der aus dem **bereits geklonten Repo** (via Connect) `dbt_project.yml` + Model-Dateien parst.

**Extrahiert:**
- Model-Namen (aus Dateinamen in models/)
- Schema (aus dbt_project.yml Konfiguration)
- Materialisierung (view/table/incremental)
- Spalten (aus SQL-Dateien via Regex oder aus schema.yml)

**API-Endpoint:**
- `GET /api/settings/import-source/objects` - Liste aller verfügbaren DV-Objekte

**Response-Struktur:**
```json
{
  "objects": [
    { "schema": "vault", "name": "hub_company", "type": "hub", "materialized": "incremental", "columns": ["hk_company", "company_id", "dss_load_date"] },
    { "schema": "vault", "name": "sat_company", "type": "satellite", "materialized": "incremental", "columns": [...] },
    { "schema": "mart_project", "name": "company_current_v", "type": "view", "materialized": "view", "columns": [...] }
  ]
}
```

### 4. Entity Import-Mapping erweitern
Schema `mds_meta.entity` um Felder: `import_source_object` (z.B. `vault.hub_company`), `import_column_mapping` (JSON), `import_filter` (WHERE), `import_schedule` (Cron). `bootstrap_mds.sql` anpassen.

### 5. Import-Macro erstellen
Neues Macro `masterdata/dbt/macros/import_from_datavault.sql` als `run-operation`: Liest Mapping aus `mds_meta.entity`, generiert dynamisch `TRUNCATE mds_stage.staged_record WHERE entity_id=X; INSERT INTO ... SELECT mapped_columns FROM source_object WHERE filter`.

### 6. Import-Dialog UI
Button "Import konfigurieren" pro Entity auf Entities-Seite → Dialog mit:
- Dropdown: Verfügbare DV-Objekte (aus Config Parser)
- Mapping-Grid: Entity-Attribut ↔ DV-Spalte (Drag & Drop oder Dropdowns)
- Filter-Eingabe (optional WHERE)
- Schedule-Eingabe (Cron, optional)

### 7. Worker Import-Handler komplett
`worker.ts` `handleImport()`:
```
1. Lade import_source aus DB → local_path (bereits geklontes Repo)
2. Prüfe local_path existiert (sonst Error: "Not connected")
3. dbt run-operation import_from_datavault --args '{entity_id: X}' --project-dir {local_path}
4. Log Ergebnis (rows imported, duration)
5. Optional: Deploy-Job triggern (staged → load → master)
```

**Kein Clone im Worker!** Das Repo wurde bereits beim Connect in Settings geklont und bleibt dort bis Disconnect.

### 8. Schedule-Integration
Cron-basierter Scheduler der `mds_meta.entity` nach `import_schedule IS NOT NULL` prüft und Jobs in Queue einstellt. Entweder via BullMQ Repeatable Jobs oder separater Cron-Service.

## Architektur-Übersicht

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  SETTINGS FLOW (einmalig bei Verbindungsaufbau)                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Settings UI    │────▶│  API /connect    │────▶│  Git Repo       │
│  [Connect Btn]  │     │                  │     │  (remote)       │
└─────────────────┘     └────────┬─────────┘     └────────┬────────┘
                                 │                        │
                                 ▼                        │ git clone
                        ┌──────────────────┐              │ --depth 1
                        │  Validate        │              ▼
                        │  dbt_project.yml │◀────┌─────────────────┐
                        └────────┬─────────┘     │  /tmp/mds-dbt/  │
                                 │               │  (persistent)   │
                                 ▼               └─────────────────┘
                        ┌──────────────────┐              │
                        │  mds_meta.       │              │
                        │  import_source   │──────────────┘
                        │  status=connected│     local_path
                        └──────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│  MAPPING FLOW (pro Entity konfigurieren)                                     │
└──────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Entity UI      │────▶│  API /objects    │────▶│  Config Parser  │
│  [Import Btn]   │     │                  │     │  (liest /tmp/)  │
└─────────────────┘     └────────┬─────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │  Import Dialog   │
                        │  - Source Object │
                        │  - Column Map    │
                        │  - Filter/Sched  │
                        └────────┬─────────┘
                                 │ save
                                 ▼
                        ┌──────────────────┐
                        │  mds_meta.entity │
                        │  import_*-Felder │
                        └──────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│  IMPORT FLOW (manuell oder scheduled)                                        │
└──────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Trigger        │────▶│  Worker Job      │────▶│  /tmp/mds-dbt/  │
│  (UI / Cron)    │     │  handleImport()  │     │  (dbt project)  │
└─────────────────┘     └────────┬─────────┘     └─────────────────┘
                                 │
                                 │ dbt run-operation
                                 │ import_from_datavault
                                 ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Data Vault     │────▶│  Import Macro    │────▶│ mds_stage.      │
│  (read-only)    │     │  (SELECT → INS)  │     │ staged_record   │
│  vault.hub_*    │     │  FULL REPLACE    │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## Dateien (Neu/Geändert)

| Datei | Aktion |
|-------|--------|
| `masterdata/src/lib/dbt/config-parser.ts` | Neu |
| `masterdata/src/lib/queue/worker.ts` | Erweitern |
| `masterdata/dbt/macros/import_from_datavault.sql` | Neu |
| `masterdata/dbt/macros/bootstrap_mds.sql` | Erweitern |
| `masterdata/src/app/api/settings/import-source/route.ts` | Neu |
| `masterdata/src/app/(app)/entities/[id]/page.tsx` | Import-Dialog |
| `masterdata/src/app/(app)/settings/page.tsx` | Datenquellen-Tab |

## API-Endpoints (Neu)

| Endpoint | Method | Beschreibung |
|----------|--------|-------------|
| `/api/settings/import-source` | GET | Aktuelle Konfiguration laden |
| `/api/settings/import-source` | POST | Konfiguration speichern |
| `/api/settings/import-source/connect` | POST | Git clone + Validierung |
| `/api/settings/import-source/disconnect` | POST | Temp-Verzeichnis löschen |
| `/api/settings/import-source/objects` | GET | Verfügbare DV-Objekte (aus Parser) |
| `/api/entities/[id]/import-mapping` | GET/PUT | Mapping für Entity laden/speichern |
| `/api/entities/[id]/import` | POST | Import-Job starten |

## Entscheidungen

- **Read-Only:** Data Vault wird nur gelesen, nie geschrieben
- **Trigger:** Manuell + Schedule (Cron)
- **Konflikt-Handling:** Full-Replace in Staging
- **Git Clone:** Bei Connect in Settings (persistent in /tmp/mds-dbt/), nicht pro Job
- **Validierung:** dbt_project.yml muss Data Vault Struktur haben (models/staging, raw_vault, etc.)
