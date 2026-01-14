# Plan: Data Vault → MDS Import via dbt Pipeline (Final)

**TL;DR:** Worker klont dbt-Repo temporär in Cache, parst Konfiguration, führt `dbt run` mit Import-Macro aus das Daten read-only aus Data Vault liest und per Full-Replace in MDS-Staging schreibt. Trigger: Manuell oder Schedule.

## Steps

### 1. Settings: dbt-Quelle konfigurieren
Neue Tabelle `mds_meta.import_source` mit Feldern: `git_url`, `git_branch`, `dbt_project_path`, `dbt_target`. Settings-UI erweitern unter "Datenquellen" mit Formular für diese Felder. API-Endpoints `GET/POST /api/settings/import-source`.

### 2. Worker: Git Clone im Job
In `handleImport()` temporären Ordner erstellen (`os.tmpdir()/mds-import-{jobId}`), `git clone --depth 1 --branch {branch} {url}` ausführen, nach Job-Ende Ordner löschen. Kein persistenter Clone.

### 3. dbt Config Parser
Neuer Service `masterdata/src/lib/dbt/config-parser.ts` der aus geklontem Repo `dbt_project.yml` + `target/manifest.json` (falls vorhanden) parst. Extrahiert: Model-Namen, Schema, Materialisierung (view/table), Spalten.

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
1. Git clone → temp dir
2. Parse dbt config
3. dbt run-operation import_from_datavault --args '{entity_id: X}' --project-dir {temp}
4. Cleanup temp dir
5. Optional: Deploy-Job triggern (staged → load → master)
```

### 8. Schedule-Integration
Cron-basierter Scheduler der `mds_meta.entity` nach `import_schedule IS NOT NULL` prüft und Jobs in Queue einstellt. Entweder via BullMQ Repeatable Jobs oder separater Cron-Service.

## Architektur-Übersicht

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Settings UI    │────▶│ mds_meta.        │     │  Git Repo       │
│  (Git URL etc.) │     │ import_source    │     │  (dbt_project)  │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
┌─────────────────┐     ┌──────────────────┐              │ git clone
│  Entity UI      │────▶│ mds_meta.entity  │              │ (temp)
│  (Mapping)      │     │ import_*-Felder  │              ▼
└─────────────────┘     └──────────────────┘     ┌─────────────────┐
                                 │               │  Worker Cache   │
                                 │               │  /tmp/mds-xxx/  │
                                 ▼               └────────┬────────┘
                        ┌──────────────────┐              │
                        │  Worker Job      │◀─────────────┘
                        │  (handleImport)  │
                        └────────┬─────────┘
                                 │ dbt run-operation
                                 ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Data Vault     │────▶│  Import Macro    │────▶│ mds_stage.      │
│  (read-only)    │     │  (SELECT → INS)  │     │ staged_record   │
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

## Entscheidungen

- **Read-Only:** Data Vault wird nur gelesen, nie geschrieben
- **Trigger:** Manuell + Schedule (Cron)
- **Konflikt-Handling:** Full-Replace in Staging
- **Git Clone:** Temporär im Worker-Cache, nicht persistiert
