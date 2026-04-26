# Copilot Instructions — EWB Data Vault 2.1

## Projekt
Data Vault 2.1 auf Azure SQL für EWB (Energie Wasser Bern). Quellsystem: Abacus ERP als Parquet-Dateien via ADF → ADLS → External Tables → dbt.

**Datenfluss:**
```
ADLS Parquet → External Table (stg.ext_ewb_*) → Staging View (stg.ewb_*) → Hub/Sat/Link (vault.*) → Current View (sat_*_current_v) → Dim/Fakt (mart.*)
```

## Agent-Delegation (WICHTIG)

Delegiere task-spezifische Arbeit immer an den passenden Sub-Agenten:

| Aufgabe | Agent |
|---------|-------|
| **Multi-Task Orchestrierung** | `@project-agent` |
| Staging-View für EWB Parquet erstellen | `@staging-engineer` |
| Hub / Satellite / Link modellieren | `@vault-architect` |
| Mart Dimensionen / Fakten erstellen | `@mart-architect` |
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
Stabiler Business Key?                → HUB
Attribute ändern sich über Zeit?      → SATELLITE (am Hub)
Mehrere gleichzeitig gültige Werte?   → MA SATELLITE (am Hub, src_cdk)
Beziehung zwischen Objekten?          → LINK
Unveränderliche Ereignis-Daten?       → TRANSACTION LINK (_tl Suffix)
Beziehung ohne eigenen BK?            → DC SATELLITE (am Link)
Stabile Lookup-Werte?                 → REFERENCE TABLE
```

## Schema-Konvention

| Layer | Ordner | Schema |
|-------|--------|--------|
| Staging | `staging/` | `stg` |
| Raw Vault (EWB + gemeinsam) | `raw_vault/_common/` | `vault` |
| Business Vault | `business_vault/` | `vault` |
| Mart | `mart/_common/` | `mart` |
| Mart (domain) | `mart/<concept>/` | `mart_<concept>` |

**EWB Vault-Objekte gehören in `raw_vault/_common/`** — kein separater Concept-Ordner, da EWB das einzige Quellsystem auf dieser Instanz ist.

## Naming (EWB)

| Objekt | Pattern | Beispiel |
|--------|---------|---------|
| External Table | `stg.ext_ewb_<modul>_<tabelle>_<suffix>` | `stg.ext_ewb_fibu_fhe_main` |
| Staging View | `stg.ewb_<modul>_<tabelle>_<suffix>` | `stg.ewb_fibu_fhe_main` |
| Vault Ref View | `vault.ref_<name>_v` | `vault.ref_konto_v` |
| Hash Key | `hk_<entity>` | `hk_buchungskopf` |
| Hash Diff | `hd_<entity>` | `hd_buchungskopf` |
| Hub | `vault.hub_<entity>` | `vault.hub_fibu_fhe` |
| Satellite | `vault.sat_<entity>__<source>` | `vault.sat_fibu_fhe__abacus` |
| MA Satellite | `vault.sat_<entity>_ma__<source>` | `vault.sat_vertrag_optionen_ma__compax` |
| Hash Diff (MA) | `hd_<entity>_ma` | `hd_vertrag_optionen_ma` |
| Current View | `vault.sat_<entity>_current_v` | `vault.sat_fibu_fhe_current_v` |
| Link | `vault.link_<e1>_<e2>` | `vault.link_beleg_lieferant` |
| Transaction Link | `vault.link_<entity>_tl` | `vault.link_cdr_event_tl` |
| Hash Key (TL) | `hk_link_<entity>_tl` | `hk_link_cdr_event_tl` |
| Dimension | `mart.dim_<entity>_v` | `mart_project.dim_person_v` |
| Faktentabelle | `mart.fakt_<content>_v` | `mart_project.fakt_stunden_v` |
| Metadata | `dss_*` | `dss_load_date`, `dss_record_source` |
| Business Key (norm.) | `dss_business_key` | `CONCAT_WS('||', ...)` |
| Erstellungszeitpunkt | `dss_create_datetime` | `GETDATE()` |

`dss_record_source = 'ewb_abacus'`

> **`__source` Suffix Regel:** Der `__source` Suffix gilt **NUR für Satellites** (einfach und MA), **NICHT** für Hubs oder Links.
> Beispiel: `sat_vertrag__compax`, `sat_vertrag_ma__compax` ✅ — `hub_vertrag__compax` ❌, `link_vertrag_position__compax` ❌

## `_v` Suffix Konvention

Das `_v` Suffix kennzeichnet **publizierte Output-Views** — also Views, die von nachgelagerten Schichten oder BI-Tools konsumiert werden:

| Layer | `_v` Suffix | Begründung |
|-------|------------|------------|
| `stg.ewb_*` | ❌ kein `_v` | Interne Pipeline-Schicht, nicht für Konsumenten |
| `stg.ext_ewb_*` | ❌ kein `_v` | External Table, kein View |
| `vault.hub_*`, `vault.sat_*`, `vault.link_*` | ❌ kein `_v` | Incremental Tables (kein View) |
| `vault.sat_*_current_v` | ✅ `_v` | Konsumenten-View auf Satellite |
| `vault.ref_*_v` | ✅ `_v` | Publizierte Reference View |
| `mart.dim_*_v`, `mart.fakt_*_v` | ✅ `_v` | Publizierte BI-Views |

**Regel:** Staging-Views (`stg.*`) sind interne Transformations-Objekte der dbt-Pipeline und erhalten **kein** `_v`. Alle Views, die als Endprodukt für BI oder nachgelagerte Modelle gedacht sind, erhalten `_v`.

## Azure SQL Constraints

- **Immer** `as_columnstore: false` bei Incremental-Modellen
- **Nie** Datenbanknamen hardcoden → `{{ target.database }}`
- Hash-Berechnung via **automate_dv.stage()** mit Custom Overrides in `macros/hash_override.sql`:
  - `sqlserver__cast_binary` → `CHAR(64)` (hex-encoded, statt automate_dv Default `BINARY(32)`)
  - `sqlserver__type_string` → `NVARCHAR` (Unicode-safe für CH-Daten)
  - Konfiguriert via `dispatch` in `dbt_project.yml` (Projekt-Macros haben Vorrang vor automate_dv)

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
- [models/staging/ewb_lohn_len_main.sql](models/staging/ewb_lohn_len_main.sql) — **Goldenes EWB Staging-Beispiel** (single BK, reserved keyword)
- [models/staging/ewb_proj_nsa_main.sql](models/staging/ewb_proj_nsa_main.sql) — **Composite BK Staging-Beispiel**
- [models/staging/ewb_fibu_fhe_main.sql](models/staging/ewb_fibu_fhe_main.sql) — **Multiple Reserved Keywords Staging-Beispiel**
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
| Mart | `models/mart/<concept>/_<concept>__models.yml` |

Nach jeder Modell-Änderung: ER-Diagramm aktualisieren (→ `@design-documentation`):
- Raw Vault: `design/raw-vault/_common/er-diagram.mmd`
- Mart: `design/mart/er-mart-<concept>.mmd`

## Mart-Konventionen

### Surrogate Key Macro
```sql
{{ surrogate_key('business_key_column') }} AS {dim}_key
-- → ABS(CONVERT(BIGINT, HASHBYTES('MD5', CAST(column AS NVARCHAR(MAX)))))
```
BIGINT, deterministisch, view-kompatibel. Fakt-FKs verwenden denselben Aufruf.

### Dimension Pflicht-Spalten
| Spalte | Typ | Beschreibung |
|--------|-----|-------------|
| `{dim}_key` | BIGINT | Surrogate Key via `surrogate_key()` |
| `{dim}_id` | NVARCHAR(255) | Technische ID |
| `{dim}_code` | NVARCHAR(255) | Sprechender Schluessel (Fallback = ID) |
| `{dim}_name` | NVARCHAR(255) | Bezeichnung (Fallback = CODE / 'UNKNOWN') |
| `dss_load_date` | DATETIME2 | Ladezeitpunkt |
| `dss_record_source` | NVARCHAR(255) | Quelle |

### Materialisierung
- `materialized='view'` — Standard; alle veröffentlichten `dim_*` / `fakt_*` Objekte sind Views
- `materialized='table'` — Nur bei Performance-Bedarf; **Pflicht**: `__base`-Pattern verwenden:
  - `dim_<entity>__base.sql` → `materialized='table'` (intern)
  - `dim_<entity>.sql` → `materialized='view'` als `SELECT * FROM {{ ref('dim_<entity>__base') }}`
