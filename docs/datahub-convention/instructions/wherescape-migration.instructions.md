---
applyTo: '**'
---
# Wherescape → dbt Migrationsanleitung (Confluence ITDATAH "Entwickler Dokumentation")

> Extrahiert aus dem Confluence Space "Datahub" (ITDATAH), Unterbereich "Entwickler Dokumentation" → "Wherescape Workflow".
> Quelle: https://confluence.kelag.at/spaces/ITDATAH/pages/353075689
> Autoren: Fischer Helmut, Härb Michael
> Stand: Juli 2025

## 1. ÜBERSICHT — Wherescape Tools & dbt Äquivalente

### Wherescape Toolchain
- **Wherescape 3D**: Datenmodellierung (Source, Datastore, Data Vault, Datahub Design)
- **Wherescape RED**: Code-Generierung, Deployment, Scheduling, Monitoring
- **ODBC Connections**: Datenbank-Verbindungen zu Quellsystemen
- **Custom Functions**: SQL-Funktionen für Business Logik (Business Vault, Dimensionen, Fakten)
- **User Functions**: Wiederverwendbare SQL-Hilfsfunktionen

### Mapping Wherescape → dbt

| WS Komponente | WS Tool | dbt Äquivalent | Dateien |
|---------------|---------|----------------|---------|
| **Connection** | ODBC DSN + 3D Connection | `profiles.yml` + `sources.yml` | Profil-Konfiguration |
| **Source Model** | 3D Source Discover + ExtProps | `models/staging/sources.yml` | External Table Definition |
| **Datastore** | 3D Datastore Design → RED | `models/staging/<concept>_<entity>.sql` | Staging View |
| **Data Vault Design** | 3D DV Design (Entities, Attribute Types) | automate_dv Metadata YAML | Hub/Sat/Link Definitions |
| **Load & Stage Gen** | 3D "Generate Load and Staging" | `automate_dv.stage()` | Automatisch via stg View |
| **Hub** | 3D Entity mit BK Attribute Type | `models/raw_vault/<concept>/hubs/hub_<entity>.sql` | `automate_dv.hub()` |
| **Satellite** | 3D Satellite low/high volatility | `models/raw_vault/<concept>/satellites/sat_<entity>__<sys>.sql` | `automate_dv.sat()` |
| **Link** | 3D Link Business Key + FK | `models/raw_vault/<concept>/links/link_<e1>_<e2>.sql` | `automate_dv.link()` |
| **DC Satellite** | 3D Dependent Child Sat Key/Attr | `models/raw_vault/<concept>/satellites/sat_<dc>_<parent>__dc.sql` | `automate_dv.sat()` |
| **MA Satellite** | 3D Multi-Active Key/Attr | `models/raw_vault/<concept>/satellites/sat_<entity>__<sys>__ma.sql` | `automate_dv.ma_sat()` |
| **Reference Table** | 3D Reference Key/Attr | `models/raw_vault/_common/` | Hub + Sat als Ref |
| **RED Export** | 3D "Prepare for RED" + "Export to RED" | `dbt run` | Ersetzt RED komplett |
| **RED Housekeeping** | `user_RED_housekeeping` Procedure | Nicht nötig | dbt übernimmt DDL |
| **Business Vault** | 3D BV Design + RED Custom Function | `models/business_vault/` | dbt Model mit SQL Logik |
| **Business Datastore** | 3D ds_* + RED Custom Function | `models/business_vault/` | dbt Model (View/Table) |
| **Datahub Dimension** | 3D Datahub Design (SCD1/SCD2) + Custom Func | `models/mart/<concept>/dim_<entity>.sql` | dbt Model |
| **Datahub Fakt** | 3D Datahub Design Fact + Custom Func | `models/mart/<concept>/fakt_<entity>.sql` | dbt Model |
| **Datahub View** | 3D Standard/Custom View | `models/mart/<concept>/<view_name>.sql` | dbt View |
| **Datahub Stage** | 3D "Generate Datahub Stage" | Nicht nötig | dbt Mart referenziert Vault direkt |
| **MDS View** | 3D MDS Design + RED `mds_procedure` | `masterdata/dbt/` | MDS-spezifisches Model |
| **Security** | 3D BV Design `sec_user_privilege` | `models/business_vault/security/` | dbt Model |
| **Index** | RED Nonclustered Index manuell | `macros/create_hash_index.sql` | post_hook oder manuell |
| **Scheduling** | RED Jobs + Scheduler | `dbt run --select` + CI/CD Pipeline | Azure DevOps / GitHub Actions |
| **Monitoring** | RED Job History + Logs | dbt Artifacts + Logging | `dbt test` + Observability |

## 2. WHERESCAPE WORKFLOW-SCHRITTE → dbt

### 2.1 Connection (WS Seite 353076062)

**Wherescape:**
1. ODBC-Datenquelle (64-bit) definieren
2. Connection in 3D anlegen (Name, Type: ODBC, DSN, Windows Auth)
3. Dokumentieren auf Confluence (WS - Client, WS - Server)

**dbt Äquivalent:**
```yaml
# profiles.yml (NICHT im Repo, lokal)
datavault:
  target: dev
  outputs:
    dev:
      type: sqlserver
      server: sql-datavault-weu-001.database.windows.net
      database: Vault
      authentication: cli
      schema: dbt
    
    # Produktions-Datahub (sqlbi01)
    prod:
      type: sqlserver
      server: sqlbi01
      database: VAULT
      authentication: windows
      schema: dbt
```

```yaml
# sources.yml — Quelle definieren
sources:
  - name: staging
    database: "{{ target.database }}"
    schema: stg
    tables:
      - name: ext_<concept>_<entity>
        external:
          location: "abfss://..."  # oder LOAD DB Referenz
```

**Migration-Aktion:** Connection-Infos aus WS-Client-Doku → `profiles.yml` Target

### 2.2 Source (WS Seite 353076064)

**Wherescape 3D:**
1. Source Model erstellen (Name nach Namenskonvention)
2. Typ: RDBMS, Connection: db_LOAD / ssis_LOAD / web_LOAD / file_LOAD
3. Discover: Tabellen aus Quelle entdecken (Quick Discover)
4. Primary Keys definieren
5. Extended Properties setzen:
   - `ext_load_data_set_type`: FULL / DELTA / FULL DELTA
   - `ext_external_load_type`: DB / SSIS / FILE / WEB / EXTERNAL
   - `ext_where`: Filter-Klausel (bei FULL DELTA)
   - `ext_dss_business_key_ccode`: Collision Code
   - `ext_condense_attribute`: Delta-Kriterium
6. Gruppen zuordnen (10_Source_<Bereich>)
7. Conversion Rule für Gruppenzuordnung erweitern

**dbt Äquivalent:**
```yaml
# sources.yml — External Table Definition
sources:
  - name: staging
    tables:
      - name: ext_<concept>_<entity>
        description: "Quelle: <system>.<db>.<schema>.<table>"
        meta:
          ext_load_data_set_type: FULL  # FULL / DELTA / FULL_DELTA
          ext_external_load_type: EXTERNAL  # Immer EXTERNAL bei Azure
        external:
          location: "abfss://raw@<storage>.dfs.core.windows.net/<concept>/<entity>/"
          file_format: parquet
        columns:
          - name: <col1>
            data_type: nvarchar(255)
          # ...
```

**Extended Properties → dbt Mapping:**

| WS ExtProp | dbt Äquivalent | Wo |
|-----------|----------------|-----|
| `ext_load_data_set_type` | `meta.ext_load_data_set_type` | sources.yml |
| `ext_external_load_type` | Immer `EXTERNAL` (Azure) | sources.yml |
| `ext_where` | WHERE-Klausel im Staging View | `<concept>_<entity>.sql` |
| `ext_dss_business_key_ccode` | `dss_business_key_ccode` Variable | Staging View |
| `ext_condense_attribute` | `dss_load_date` / is_incremental() Filter | Staging View |
| `ext_pk_unique` | `unique` Test in models.yml | Schema YAML |

### 2.3 Datastore (WS Seite 353076073)

**Wherescape 3D:**
1. Datastore_Design erstellen → "Create Datastore_Design"
2. Datastore erstellen → "Create Datastore"
3. Datastore_RedExport → "Prepare for RED"
4. RED Export → Tabellen in RED überprüfen
5. Merge in Master (per LoadTyp)
6. RED Housekeeping ausführen

**dbt Äquivalent:**
- Der gesamte Datastore-Workflow entfällt!
- Staging Views (`models/staging/<concept>_<entity>.sql`) übernehmen die Funktion
- Hash-Berechnung erfolgt direkt im Staging View
- Kein separater Datastore nötig — dbt's DAG löst Abhängigkeiten automatisch

### 2.4 Data Vault Modellierung (WS Seite 353076081)

**Wherescape 3D — Attribute Types → dbt:**

| WS Attribute Type | dbt Mapping | Ziel-Objekt |
|-------------------|-------------|-------------|
| `Business key` | BK-Spalte in Staging, `src_pk` Hash | Hub |
| `Satellite low volatility` | `src_payload` in sat() | Standard Satellite |
| `Satellite high volatility` | `src_payload` in sat() (separater Sat) | High-Freq Satellite |
| `Dependent child satellite key` | DCK in Link Hash + `src_payload` | DC Link + DC Sat |
| `Dependent child satellite attribute` | `src_payload` in DC Sat | DC Satellite |
| `Satellite multi-active key` | `src_cdk` in ma_sat() | MA Satellite |
| `Satellite multi-active attribute` | `src_payload` in ma_sat() | MA Satellite |
| `Link business key` | `src_fk` in link() + FK Hash | Link |
| `Link dependent child` | DCK im Link Hash | Link (DC) |
| `Reference key` | BK-Spalte für Ref Hub | Reference Hub |
| `Reference attribute` | `src_payload` für Ref Sat | Reference Satellite |
| `dss_tenant_key` | `dss_tenant_key` Variable | Alle Objekte |
| `ignore_change_hash` | Attribut NICHT in `src_hashdiff` | Satellite |
| `casesensitive` | BK + SHA256-Substring (Confluence §3) | Hub |
| `Hub hash key` | `src_pk` in hub/sat/link | Alle |
| `Link hash key` | `src_pk` in link, `src_fk` in sat | Link + Link-Sat |

**Wherescape 3D Workflow:**
1. DV Design Version anlegen
2. Tabellen aus Source per Drag&Drop hineinziehen
3. Attribute Types zuweisen (BK, Sat, Link, etc.)
4. Sourcemapping Sets für jeden Satelliten erstellen
5. FK-Beziehungen für Links modellieren
6. "Generate Data Vault" → "Generate Load and Staging" → "Prepare for RED" → "Export to RED"

**dbt Äquivalent:**
1. Staging View erstellen (Source → Hash-Berechnung)
2. Hub Model mit `automate_dv.hub()` + src_extra_columns
3. Satellite Model mit `automate_dv.sat()` + src_extra_columns
4. Link Model mit `automate_dv.link()`
5. Schema YAML dokumentieren
6. `dbt compile` → Prüfen → `dbt run` (mit User-Zustimmung)

### 2.5 Business Vault (WS Seite 353076091)

**Wherescape 3D + RED:**
1. 3D: Business Vault Design → Sat/Link direkt modellieren
2. 3D: hk_<hub>, Datenfelder, Attribut Types zuweisen
3. 3D: Generate → Prepare for RED → Export to RED
4. RED: Custom Function erstellen (`custom_func_<object>`)
5. RED: SQL-Logik für Soft Rules implementieren
6. RED: Connection db_VAULT, Target T_VAULT_BUSINESS

**dbt Äquivalent:**
```sql
-- models/business_vault/sat_<entity>__business.sql
{{ config(
    materialized='incremental',
    incremental_strategy='append',
    schema='vault',
    as_columnstore=false
) }}

-- Business Logik direkt im dbt Model (ersetzt Custom Function):
WITH source_sats AS (
    SELECT s1.hk_<hub>,
           s1.attribute1,
           s2.attribute2,
           -- Soft Rules / Berechnungen hier
           GREATEST(s1.dss_load_date, s2.dss_load_date) AS dss_load_date,
           s1.dss_record_source
    FROM {{ ref('sat_<entity>__<system>') }} s1
    JOIN {{ ref('sat_<other>__<system>') }} s2 ON ...
)
SELECT * FROM source_sats
```

**Custom Function → dbt Mapping:**

| WS Custom Func Rückgabe | dbt Äquivalent | Anmerkung |
|-------------------------|----------------|-----------|
| `hk_<hub>` / `hk_<link>` | Aus Source-Satelliten übernehmen | JOIN auf Hub/Sat |
| `dss_tenant_key` | `'default'` oder aus Sat | Single-Tenant PoC |
| `dss_load_datetime` | `GREATEST(sat1.dss_load_date, sat2.dss_load_date)` | MAX über alle Sats |
| `dss_record_source` | `'business_vault.<object>'` | Eigene Quelle |
| `dss_start_datetime` | Von WS automatisch → in dbt via Incremental | Insert-Only |
| `dss_job_sequence_key` | `dss_run_id` (optional) | {{ run_started_at }} |

### 2.6 Datahub / IMS — Dimensionen (WS Seite 353076082)

**Wherescape 3D:**
1. Source `dh_vault` discovern (NIE Master discovern!)
2. Datahub Design: Neue Tabelle erstellen (SCD1=Dimension, SCD2=Changing Dimension, Flat Table)
3. Spalten aus dh_vault Source per Drag&Drop
4. BK markieren, Changing Attributes für SCD2
5. Target Location: `T_DATAHUB_<Business_concept>`
6. Gruppe: `20_<content_bereich>`
7. ExtProp `ext_deleted_propagated`: Y/N
8. "Generate Datahub Stage" → "Prepare for RED" → "Export to RED"
9. RED: Custom Function erstellen mit Business-Logik

**Pflicht-Rückgabe Custom Function (Dimension):**
- `dss_tenant_key` (M)
- `dss_business_key_ccode` (M)
- `dss_business_key` (M)
- `dss_load_datetime` / `load_date_time` (M)
- `dss_record_source` (M)
- `dss_sec_value_key` (M)
- `dss_deleted` (M bei SCD2)
- `par_dh_batch_load_date` (M als Parameter)

**dbt Äquivalent:**
```sql
-- models/mart/<concept>/dim_<entity>.sql
{{ config(materialized='view', schema='mart_<concept>') }}

WITH pit AS (
    -- PIT-Logik: aktueller Stand aus Satelliten
    SELECT h.hk_<entity>,
           h.<business_key>,
           s.attribute1,
           s.attribute2,
           s.dss_load_date,
           s.dss_record_source
    FROM {{ ref('hub_<entity>') }} h
    LEFT JOIN {{ ref('sat_<entity>__<system>_current_v') }} s
        ON h.hk_<entity> = s.hk_<entity>
)
SELECT
    hk_<entity> AS dim_<entity>_key,
    <business_key> AS dim_<entity>_id,
    COALESCE(<code_col>, <business_key>) AS dim_<entity>_code,
    COALESCE(<name_col>, 'UNKNOWN') AS dim_<entity>_name,
    -- weitere Attribute
    dss_record_source
FROM pit
```

### 2.7 Datahub / IMS — Faktentabellen (WS Seite 353076082)

**Wherescape 3D:**
1. Table Type: Fact
2. Dimensions-Spalten manuell: `dim_*_key` (integer), FK zu Dimensionen
3. Content-Spalten (Measures)
4. Target Location + ExtProp `ext_load_data_set_type` (FULL/DELTA)
5. RED: Custom Function für Lookup-Logik

**dbt Äquivalent:**
```sql
-- models/mart/<concept>/fakt_<entity>.sql
{{ config(materialized='view', schema='mart_<concept>') }}

SELECT
    COALESCE(d1.dim_<dim1>_key, '-1') AS dim_<dim1>_key,
    COALESCE(d2.dim_<dim2>_key, '-1') AS dim_<dim2>_key,
    dd.dim_date_key,
    -- Measures
    l.measure1,
    l.measure2,
    l.dss_record_source
FROM {{ ref('link_<entity>') }} l
JOIN {{ ref('sat_link_<entity>__<sys>_current_v') }} sl ON ...
LEFT JOIN {{ ref('dim_<dim1>') }} d1 ON ...
LEFT JOIN {{ ref('dim_<dim2>') }} d2 ON ...
LEFT JOIN {{ ref('dim_date') }} dd ON ...
```

### 2.8 Datahub Views (WS Seite 353076087)

**Wherescape 3D:**
- Standard View: `<object_name>_v` → automatisch `CREATE VIEW AS SELECT * FROM <object_name>`
- Custom View: SQL im DDL-Tab, Format: `SELECT * FROM ( <SQL_CODE> ) <viewname>`
- Target Location + Gruppe zuordnen

**dbt Äquivalent:**
- Standard Views sind in dbt nicht nötig (Materialierung = View → ist bereits eine View)
- Custom Views → eigenes dbt Model mit `materialized='view'`
- Kein separater RED Export nötig

### 2.9 Business Datastore (WS Seite 353076095)

**Wherescape 3D:**
1. Business Datastore Design → Neue Entity (Type: Datastore, Prefix `ds_`)
2. Spalten + Datentypen definieren
3. Source Mappings für Abhängigkeiten
4. "Business Datastore" → "Prepare for RED" → "Export"
5. RED: Custom Function erstellen

**dbt Äquivalent:**
```sql
-- models/business_vault/ds_<entity>.sql
{{ config(materialized='table', schema='vault') }}
-- Oder materialized='view' wenn keine Persistenz nötig

SELECT ... FROM {{ ref('...') }}
```

### 2.10 Security (WS Seite 353076094)

**Wherescape:** `sec_user_privilege` als Referenztabelle im BV Design, Custom Function pro Security Context.

**dbt:** `models/business_vault/security/sec_user_privilege.sql` Model.

### 2.11 MDS Views (WS Seite 403931734)

**Wherescape:** Datahub Design mds → master, ExtProp `ext_mds_staging_table`, RED Template `kelag_sqlserver_proc_mds`.

**dbt:** `masterdata/dbt/` Models (eigener MDS-Layer).

### 2.12 Index (WS Seite 556533538)

**Wherescape RED:** Manuell anlegen (Nonclustered, Page Compression, Sort in TempDB).

**dbt:**
```sql
{{ config(
    post_hook=["{{ create_hash_index(this, 'hk_<entity>') }}"]
) }}
```

## 3. EXTENDED PROPERTIES → dbt KONFIGURATION

| WS Extended Property | Ebene | dbt Äquivalent | Wo konfiguriert |
|---------------------|-------|----------------|-----------------|
| `ext_load_data_set_type` | Tabelle | `meta.ext_load_data_set_type` | sources.yml |
| `ext_external_load_type` | Tabelle | Immer EXTERNAL (Azure) | sources.yml |
| `ext_where` | Tabelle | WHERE-Klausel in Staging View | `<concept>_<entity>.sql` |
| `ext_dss_business_key_ccode` | Tabelle/Spalte | `dss_business_key_ccode` Variable | Staging View |
| `ext_condense_attribute` | Tabelle | Delta-Kriterium in is_incremental() | Staging View |
| `ext_pk_unique` | Tabelle | `unique` Test | `_<concept>__models.yml` |
| `ext_deleted_propagated` | Tabelle | Logik in Mart Model | `dim_<entity>.sql` |
| `ext_mds_staging_table` | Tabelle | MDS Staging Reference | `masterdata/dbt/` |

## 4. WHERESCAPE GRUPPEN → dbt FOLDER-STRUKTUR

| WS Gruppe | dbt Ordner | Schema |
|-----------|-----------|--------|
| `10_Source_<Bereich>` | `models/staging/` | `stg` |
| `20_Content_<Bereich>` | `models/raw_vault/<concept>/` | `vault_<concept>` |
| `20_datahub` | `models/raw_vault/_common/` | `vault` |
| Business Vault Gruppen | `models/business_vault/` | `vault` |
| Datahub Gruppen | `models/mart/<concept>/` | `mart_<concept>` |

## 5. MIGRATION CHECKLISTE

### Pro Wherescape-Objekt:
1. ☐ WS-Objekt in RED identifizieren (Typ, Schema, Gruppe)
2. ☐ Source Tables + Extended Properties auslesen
3. ☐ Business Keys + Attribute Types aus 3D / RED dokumentieren
4. ☐ Custom Function Code extrahieren (falls vorhanden)
5. ☐ dbt Staging View erstellen (Hash-Berechnung)
6. ☐ dbt Hub/Sat/Link Models erstellen
7. ☐ Schema YAML dokumentieren
8. ☐ dbt Tests hinzufügen (not_null, unique, referential integrity)
9. ☐ `dbt compile` erfolgreich
10. ☐ ER-Diagramm aktualisieren
11. ☐ Confluence System-Dokumentation aktualisieren
12. ☐ Confluence Benutzer-Dokumentation aktualisieren

### Pro Information Mart:
1. ☐ Alle Vault-Objekte des Marts migriert
2. ☐ Business Vault Logik (Custom Functions) in dbt Models übersetzt
3. ☐ Dimensionen erstellt (PIT-basiert)
4. ☐ Faktentabellen erstellt (Bridge-basiert)
5. ☐ Views erstellt
6. ☐ Security (sec_user_privilege) migriert
7. ☐ Scheduling in CI/CD Pipeline konfiguriert
8. ☐ Datenkonsistenz zwischen WS und dbt verglichen

## 6. PRODUKTIONS-DATAHUB VERBINDUNG (sqlbi01)

### Verbindung
```
Server: sqlbi01
Authentication: Windows
Datenbanken: LOAD, STAGE, VAULT, STAGE_HUB, DATAHUB
```

### Exploration bestehender Objekte
```sql
-- Schemas und Tabellen im VAULT
SELECT s.name AS schema_name, t.name AS table_name, t.type_desc
FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id
ORDER BY s.name, t.name;

-- Hubs identifizieren
SELECT * FROM sys.tables WHERE name LIKE 'hub_%';

-- Satelliten identifizieren
SELECT * FROM sys.tables WHERE name LIKE 'sat_%';

-- Links identifizieren
SELECT * FROM sys.tables WHERE name LIKE 'link_%';

-- Spalten eines Objekts
SELECT c.name, t.name AS data_type, c.max_length, c.is_nullable
FROM sys.columns c JOIN sys.types t ON c.user_type_id = t.user_type_id
WHERE c.object_id = OBJECT_ID('<schema>.<table>')
ORDER BY c.column_id;
```

## 7. CONFLUENCE-DOKUMENTATION FÜR MIGRIERTE OBJEKTE

### System Dokumentation (353075657)
Für jeden migrierten Information Mart muss die System-Doku unter folgendem Pfad aktualisiert werden:
```
System Dokumentation → <InformationMart> → Operations / Security
```
Inhalt: Technische Details, Beladungsstrategie, Abhängigkeiten, Scheduling

### Benutzer Dokumentation (352845985)
Für jedes migrierte Objekt in einem Information Mart:
```
Benutzer Dokumentation → <InformationMart> → dim_<entity> / fakt_<entity>
```
Inhalt: Fachliche Beschreibung, Spalten-Dokumentation, Beispiel-Queries

### Konzepte (353075845)
Architektonische Änderungen dokumentieren:
```
Konzepte → Zielarchitektur Datahub / Namenskonventionen / Data Vault / ...
```

## 8. INFORMATION MARTS IM DATAHUB (Confluence System Doku)

| Mart | Content Bereich | Quellsystem(e) | Status |
|------|----------------|-----------------|--------|
| CO | coar | SAP CO | ⬜ |
| COAR | coar | SAP CO | ⬜ |
| Copernicus | weather | External API | ⬜ |
| Datahub | datahub | Cross-source | ⬜ |
| EAM | energy_industry | SAP EAM | ⬜ |
| Energy Industry | energy_industry | SAP ISU | ⬜ |
| Energy Management | em | Multiple | ⬜ |
| HCM | hcm | SAP HCM | ⬜ |
| ISS | isu | ISS Portal | ⬜ |
| ISU | isu | SAP ISU | ⬜ |
| Jira | jira | Jira REST API | ⬜ |
| Manual | manual | File Upload | ⬜ |
| Metric | meta | Event Data | ⬜ |
| ORGA | orga | SAP HCM | ⬜ |
| Plusclub | crm | SAP CRM | ⬜ |
| Powerplant | powerplant | Kraftwerk-Systeme | ⬜ |
| PV-Project | energy_industry | PV-Projekte | ⬜ |
| Quality | meta | DQ Framework | ⬜ |
| SAP ISU | isu | SAP ISU | ⬜ |
| Service | datahub | Service-Daten | ⬜ |
| Telekom | energy_industry | Telekom-Systeme | ⬜ |
| Weather | weather | Wetterdaten | ⬜ |
| XEOX | datahub | AD-User/Gruppen | ⬜ |

## 9. CONFLUENCE-QUELLEN

| Seite | Page ID | Inhalt |
|-------|---------|--------|
| Entwickler Dokumentation | 353075689 | Parent der Workflow-Seiten |
| Workflow Modellierung Connection | 353076062 | ODBC + 3D Connections |
| Workflow Modellierung Source | 353076064 | Source Discovery, ExtProps |
| Workflow Modellierung Datastore | 353076073 | Datastore Design → RED |
| Workflow Modellierung Data Vault | 353076081 | DV Design, Attribute Types |
| Workflow Modellierung Datahub | 353076082 | Dimensionen, Fakten, Flat Tables |
| Workflow Modellierung Datahub Views | 353076087 | Standard + Custom Views |
| Wherescape Modellierung Business Vault | 353076091 | BV Sat/Link + Custom Functions |
| Wherescape 3D nach RED export | 353076092 | Export-Hinweise (Recreated) |
| Workflow Modellierung Security | 353076094 | sec_user_privilege |
| Workflow Modellierung Business Datastore | 353076095 | ds_* + Custom Functions |
| Erstellen User und Custom Function | 353076097 | User/Custom Function Templates |
| Workflow Datahub MDS View und Procedure | 403931734 | MDS Views + Procedures |
| Workflow Modellierung Index | 556533538 | Index-Erstellung in RED |
| System Dokumentation | 353075657 | Per-Mart technische Doku |
| Benutzer Dokumentation | 352845985 | Per-Objekt fachliche Doku |
| Konzepte | 353075845 | Architektur-Dokumentation |
