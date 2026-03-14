# Copilot Instructions — EWB Data Vault 2.1

## Projekt
Data Vault 2.1 auf Azure SQL für EWB (Energie Wasser Bern). Quellsystem: Abacus ERP als Parquet-Dateien via ADF → ADLS → External Tables → dbt.

**Datenfluss:**
```
ADLS Parquet → External Table (stg.ext_ewb_*) → Staging View (stg.ewb_*) → Hub/Sat/Link (vault.*)
```

## Agent-Delegation (WICHTIG)

Delegiere task-spezifische Arbeit immer an den passenden Sub-Agenten:

| Aufgabe | Agent |
|---------|-------|
| Staging-View für EWB Parquet erstellen | `@staging-engineer` |
| Hub / Satellite / Link modellieren | `@vault-architect` |
| dbt deploy + DB-Verifikation | `@dbt-deployer` |
| Scope- und Fortschrittsanalyse | `@scope-tracker` |
| DB-Zustand prüfen (Schemas, Objekte) | `@db-monitor` |
| Abgleich mit Synapse-Views | `@synapse-validator` |

## Skills & Hooks

- **`@ewb-staging`** — Vollständiger Workflow: Parquet-Schema → sources.yml → SQL → YAML-Doku → Deploy
- **`@datavault-patterns`** — Templates für Hub, Sat, Link, DC Sat, MA Sat, Reference Table
- **`@design-documentation`** — ER-Diagramme und Architektur-Docs aktuell halten
- **Hooks** (`.github/hooks/hooks.json`) — Automatische Validierung beim Speichern von `models/staging/ewb_*.sql` und `models/**/*.sql`

## Data Vault 2.1 Entscheidungslogik

```
Stabiler Business Key?           → HUB
Attribute ändern sich über Zeit? → SATELLITE (am Hub)
Beziehung zwischen Objekten?     → LINK
Beziehung ohne eigenen BK?       → DC SATELLITE (am Link)
Mehrere gleichzeitig gültige Werte? → MA SATELLITE (am Hub, src_cdk)
Stabile Lookup-Werte?            → REFERENCE TABLE
```

## Schema-Konvention

| Layer | Ordner | Schema |
|-------|--------|--------|
| Staging | `staging/` | `stg` |
| Raw Vault (EWB + gemeinsam) | `raw_vault/_common/` | `vault` |
| Business Vault | `business_vault/` | `vault` |
| Mart | `mart/_common/` | `mart` |

**EWB Vault-Objekte gehören in `raw_vault/_common/`** — kein separater Concept-Ordner, da EWB das einzige Quellsystem auf dieser Instanz ist.

## Naming (EWB)

| Objekt | Pattern | Beispiel |
|--------|---------|---------|
| External Table | `stg.ext_ewb_<modul>_<tabelle>_<suffix>` | `stg.ext_ewb_fibu_fhe_main` |
| Staging View | `stg.ewb_<modul>_<tabelle>_<suffix>` | `stg.ewb_fibu_fhe_main` |
| Hash Key | `hk_<entity>` | `hk_buchungskopf` |
| Hash Diff | `hd_<entity>` | `hd_buchungskopf` |
| Hub | `vault.hub_<entity>` | `vault.hub_fibu_fhe` |
| Satellite | `vault.sat_<entity>` | `vault.sat_fibu_fhe` |
| Link | `vault.link_<e1>_<e2>` | `vault.link_beleg_lieferant` |
| Metadata | `dss_*` | `dss_load_date`, `dss_record_source` |

`dss_record_source = 'ewb_abacus'`

## Azure SQL Constraints

- **Immer** `as_columnstore: false` bei Incremental-Modellen
- **Nie** Datenbanknamen hardcoden → `{{ target.database }}`
- Hash-Berechnung **nativ** (kein automate_dv-Hash-Macro — inkompatibel mit SQL Server):
  ```sql
  CONVERT(CHAR(64), HASHBYTES('SHA2_256', ISNULL(CAST(col AS NVARCHAR(MAX)), '')), 2)
  ```

## dbt Targets

| Target | Datenbank | Verwendung |
|--------|-----------|------------|
| `ewb-dev` | `datavault-dev` | Entwicklung |
| `ewb-test` | `datavault-test` | Test |
| `ewb` | `datavault` | Produktion |

```bash
source .venv/bin/activate
dbt run --target ewb-dev                         # Entwicklung
dbt run-operation stage_external_sources         # External Tables deployen
dbt run --select +raw_vault._common.hub_<entity> # Mit Upstream
```

> **Immer vollständige Pfade verwenden:** `raw_vault._common.hub_fibu_fhe` statt `hub_fibu_fhe`

## Referenz-Dateien

- [dbt_project.yml](dbt_project.yml) — Schema-Konfigurationen
- [models/staging/sources.yml](models/staging/sources.yml) — External Table Definitionen
- [models/staging/ewb_fibu_fhe_main.sql](models/staging/ewb_fibu_fhe_main.sql) — **Goldenes EWB Staging-Beispiel**
- [models/staging/adworks_kunde.sql](models/staging/adworks_kunde.sql) — Adworks als Dev-Template
- [models/raw_vault/adworks/](models/raw_vault/adworks/) — Adworks als Vault-Dev-Template
- [docs/projektdokumentation.md](docs/projektdokumentation.md) — Scope, Phasen, 19 Pilot-Tabellen
- [instructions/ewb-abacus.instructions.md](instructions/ewb-abacus.instructions.md) — EWB-spezifische Regeln (Type-Mapping, Reserved Keywords)
- [instructions/developer-principles.instructions.md](instructions/developer-principles.instructions.md) — DV2.1 Pflichtfelder pro Objekttyp

## Schema YAML (Pflicht)

Jedes Modell muss in einer `_<layer>__models.yml` dokumentiert sein:

| Layer | Datei |
|-------|-------|
| Staging | `models/staging/_staging__models.yml` |
| Raw Vault | `models/raw_vault/_common/_common__models.yml` |

Nach jeder Modell-Änderung: ER-Diagramm in `design/raw-vault/_common/er-diagram.mmd` aktualisieren (→ `@design-documentation`).
