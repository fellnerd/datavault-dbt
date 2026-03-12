# Plan: EWB Basis-Setup (Azure Infrastruktur)

**Zusammenfassung:** Bevor dbt-Modelle gebaut werden, muss die Azure-Infrastruktur stabil stehen. `sql-datavault-weu-001` liegt auf dem PPMC-Shared-Tenant und ist für EWB nicht verwendbar — es muss ein neuer Azure SQL Server im EWB-Tenant angelegt werden. Das bedeutet: ~~EWB-Tenant-Analyse~~ ✅, Erstellung des SQL Servers + `datavault`-Datenbank, DB-Initialisierung (Schemas, Managed Identity, External Data Source auf Container `landing-zone` in `analyticsstoraccount001`), Security Hardening, ADF→dbt-Orchestrierung, und Aktualisierung der `profiles.yml` auf den neuen Server.

**Bekannte Ressourcen (EWB-Tenant):**
| Ressource | Wert |
|---|---|
| Subscription ID | `68defcb4-5f61-4456-90f5-ff6bb0305183` |
| Tenant ID | `d33d3f40-0d4a-45aa-b50d-d6f722b0456e` |
| Tenant Domain | `ewbuchs.ch` |
| Resource Group | `arg-analytics-ewb-01` |
| Storage Account | `analyticsstoraccount001` |
| Storage DFS Endpoint | `https://analyticsstoraccount001.dfs.core.windows.net` |
| Container (ADF-Roh, bestehend) | `landing-zone` |
| Container (ADF structured, bestehend) | `structured-tables` |
| Container (dbt Landing, neu) | `load-fs` |
| Container (dbt Staging, neu) | `stage-fs` |
| ADF | `analytics-datafactory001` |
| Key Vault | `analytics-keyvault001` |

---

## Schritt 1 — EWB Azure Tenant-Analyse ✅ (abgeschlossen)

```bash
az account set --subscription 68defcb4-5f61-4456-90f5-ff6bb0305183
az account show  # sub-ewbuchs-prd-01 / ewbuchs.ch
```

### 1a. Linked Services

| Linked Service | Typ | Quellsystem |
|---|---|---|
| `AbacusDB` | ODBC | Abacus ERP (via SHIR `EWBSBI01`) |
| `IDMS` | MySQL | IDMS-Portal (Kabel/Internet/IPTV) |
| `ISE_Prod` | SQL Server | ISE Kernsystem (Kunden, Objekte, Faktura) |
| `Messerli` | MySQL | Messerli Fakturierung |
| `IDMS_SOAP_portal` | HTTP | IDMS SOAP-API |
| `ServiceNowPROD_V2` | ServiceNow API | CRM Kundenmutationen |
| `ewbsbi01folder001` | FileServer | File Shares (\\EWBSBI01) |
| `analyticsstoraccount001` | AzureBlobFS | ADLS Gen2 (Sink) |
| `synapse001` | AzureSqlDW | Synapse (intermediate) |

### 1b. Pipeline-Inventur (täglich aktive Trigger)

| Pipeline | Quelle | Abacus-Modul | Tabellen | Ziel-Pfad (Container: `landing-zone`) |
|---|---|---|---|---|
| `FIBU_GL_daily` | AbacusDB ODBC | FIBU | GL (E22–E26, partitioniert) | `landing-zone/FIBU/GL/` |
| `FIBU_daily` | AbacusDB ODBC | FIBU | FHE | `landing-zone/FIBU/FHE/` |
| `KRED` | AbacusDB ODBC | KRED | 22 Tabellen (KAB, KBL, KBS, KVL…) | `landing-zone/KRED/` |
| `DEBI` | AbacusDB ODBC | DEBI | ~28 Tabellen (DKV, DPS, DST, DZF…) | `landing-zone/DEBI/` |
| `ADRE` | AbacusDB ODBC | ADRE | 13 Tabellen (ACO, ADX, AFD…) | `landing-zone/ADRE/` |
| `LOHN` | AbacusDB ODBC | LOHN | 11 Tabellen (LEM, LSA, LPB…) | `landing-zone/LOHN/` |
| `PROJ` | AbacusDB ODBC | PROJ | 23 Tabellen (NTC, NTB, NPO, PRT…) | `landing-zone/PROJ/` |
| `PUBL` | AbacusDB ODBC | PUBL | 5 Tabellen | `landing-zone/PUBL/` |
| `SHOP` | AbacusDB ODBC | SHOP | 2 Tabellen (JDV, JDX) | `landing-zone/SHOP/` |
| `IDMS_bulk_daily` | IDMS MySQL | — | user, address, service, subscription | `landing-zone/IDMS/` |
| `ISE_Prod_bulk_daily` | ISE SQL Server | — | ~597 Tabellen (Basis.*, Objekt.*, Faktura.*) | `landing-zone/ISE/` |
| `Messerli` | Messerli MySQL | — | 4 Tabellen (r02, r03, r05, r06) | `landing-zone/Messerli/` |
| `ServiceNowProdV2` | ServiceNow API | — | 7 Objekte (x_wuedg_kundenanfr_*) | `landing-zone/ServiceNowProd/` |
| `Finance` | Synapse (Transform) | FIBU+KRED | Buchungen, Belege, Kunden | `structured-tables/Finance/` |

### 1c. Storage-Container-Mapping

| Container | Inhalt | Rolle für dbt | Status |
|---|---|---|---|
| `landing-zone` | Roh-Parquets (ADF-Sink, bestehend) | **dbt External Table Source** — 1:1 Rohdaten aus Abacus/IDMS/ISE | ✅ Aktiv |
| `structured-tables` | Transformierte/gejointe Finance+Projekt-Daten | **Nicht als dbt Source verwenden** — enthält Business-Logik (Filter, JOINs, UNIONs), verletzt DV-Prinzip der Rohdatenerhaltung | ✅ Aktiv (Referenz für BI/Power BI) |
| `load-fs` | Neu erstellt | Zukünftiger ADF-Copy-Sink (neues Pfad-Schema) | 🔵 Vorbereitet |
| `stage-fs` | Neu erstellt | Zukünftiger dbt External Table Source (nach Pfad-Redesign) | 🔵 Vorbereitet |

> **Wichtig:** `structured-tables` dient ausschliesslich als **Referenz** um zu verstehen, welche Business-Entitäten relevant sind (z.B. welche PROJ-Tabellen für `Projekt.Stunden` kombiniert werden). Die dbt-Vault-Modelle lesen jedoch **immer aus `landing-zone`** — den unveränderten Rohdaten.
>
> Für den Basis-Setup zeigt die External Data Source auf **`landing-zone`**. `load-fs`/`stage-fs` werden aktiviert, wenn die ADF-Pfade auf die neue Konvention umgestellt werden.

### 1d. Source-Prioritäten für EWB-Analytics (Pilot Finance + Projects)

Alle dbt External Tables zeigen auf **`landing-zone`** (Rohdaten, 1:1 aus Quellsystem):

| Priorität | Modul | Container-Pfad | Pilot-Tabellen (dbt External Tables) | Vault-Entitäten |
|---|---|---|---|---|
| 🔴 | **FIBU** | `landing-zone/FIBU/GL/E22..E26` | `ext_fibu_gl_e22`..`e26` | hub_buchung, sat_buchung |
| 🔴 | **KRED** | `landing-zone/KRED/KBL`, `KVL`, `KBS` | `ext_kred_kbl`, `ext_kred_kvl`, `ext_kred_kbs` | hub_lieferant, hub_beleg, link_beleg_lieferant |
| 🟠 | **PROJ** | `landing-zone/PROJ/NPO`, `NTC`, `NTB`, `NSA`, `NTR`, `PST` | `ext_proj_npo`..`ext_proj_pst` | hub_projekt, sat_projekt, hub_stunden |
| 🟠 | **LOHN** | `landing-zone/LOHN/LEN`, `LTC` | `ext_lohn_len`, `ext_lohn_ltc` | hub_personal, sat_personal_abteilung |
| 🟠 | **PUBL** | `landing-zone/PUBL/ADR` | `ext_publ_adr` | (Join-Basis für Personal) |
| 🟡 | **DEBI** | `landing-zone/DEBI/` | `ext_debi_*` | hub_debitor, sat_debitor |
| 🟡 | **IDMS** | `landing-zone/IDMS/` | `ext_idms_*` | hub_vertrag, sat_vertrag |
| 🟡 | **ISE** | `landing-zone/ISE/` | `ext_ise_*` | hub_kunde, hub_objekt |
| 🟡 | **ServiceNow** | `landing-zone/ServiceNowProd/` | `ext_servicenow_*` | hub_anfrage |

> **Hinweis:** Die `structured-tables`-Pipelines (Finance, Projekt) zeigen welche Tabellen **kombiniert** werden — diese SQL-Logik wird im Vault sauber als separate Staging-Modelle + Hub/Sat/Link abgebildet, nicht als vorjoinierte Quelle übernommen.
>
> **Wichtig:** `sql-datavault-weu-001` ist auf dem PPMC-Shared-Tenant (`westeurope`) — für EWB **nicht** verwenden.

---

## Schritt 1e — ADF Artefakte: Copy_LandingZone_to_LoadFS_ewb + Copy_Stage_ewb

> **Status:** ✅ Alle Artefakte deployed (2 Datasets + 2 Pipelines)

### landing-zone Pfadstruktur (analysiert)

| Muster | Beispiel | Tabellen |
|---|---|---|
| `{MODULE}/{TABLE}/Main.parquet` | `KRED/KBL/Main.parquet` | Alle Abacus-Tabellen ausser GL |
| `{MODULE}/{TABLE}/{PARTITION}.parquet` | `FIBU/GL/E22.parquet` | FIBU/GL (E15–E26, nach Buchungsperiode) |

### Pipeline: `Copy_LandingZone_to_LoadFS_ewb` ✅ (deployed)

Basiert auf `Copy_AdventureWorksLT2025` Template. ForEach über `cw_items`-Array (Parquet zu Parquet, keine SQL-Transformation).

**Zielpfad in `load-fs`:** `{cw_business_concept}/{cw_source}/historized/yyyy/MM/dd/{RunId}/{fileName}`

| Parameter | Default | Beschreibung |
|---|---|---|
| `cw_business_concept` | `ewb` | Tenant-/Projektkürzel (Top-Level in load-fs) |
| `cw_source` | `abacus` | Quellsystem-Kontext (bestimmt Sub-Pfad) |
| `cw_items` | 19 Pilot-Tabellen | Array `{source:{folder,file}, destination:{fileName}}` |

**Default-Items (Pilot-Scope, 19 Tabellen):**  
FIBU.GL.E22–E26, FIBU.FHE, KRED.KBL/KVL/KBS, PROJ.NPO/NTC/NTB/NSA/NTR/PST/PRT, LOHN.LEN/LTC, PUBL.ADR

### Pipeline: `Copy_Stage_ewb` ✅ (deployed — basiert auf `Copy_Stage_v1_c6a` Template)

Zweite Pipeline. Löscht den Stage-Ordner, dann Bulk-Copy des kompletten Run-Ordners aus `load-fs` nach `stage-fs` mit DSS-Metadaten-Spalten. dbt External Tables lesen immer aus `stage-fs` (stabiler, nicht-historisierter Pfad).

**Fluss:** `load-fs/{cw_business_context}/{cw_source}/historized/{cw_load_date}/{cw_runId}/` → `stage-fs/{cw_business_context}/{cw_source}/`

| Parameter | Default | Beschreibung |
|---|---|---|
| `cw_runId` | `manual-run` | Ordnername des Runs in `load-fs/historized/yyyy/MM/dd/` (= ADF-RunId aus Pipeline 1) |
| `cw_business_context` | `ewb` | Tenant-/Projektkürzel |
| `cw_source` | `abacus` | Quellsystem-Kontext |
| `cw_load_date` | `2026/03/04` | Datumspfad im Format `yyyy/MM/dd` — **muss bei jedem Run manuell auf Ausführungsdatum gesetzt werden** (ADF Parameter-Defaults dürfen keine Expressions sein; `@formatDateTime` im Default ist ungültig) |

**Aktivitäten:**
1. `Delete_Stage_Files` — löscht `stage-fs/{cw_business_context}/{cw_source}/` komplett (idempotenter Neuaufbau)
2. `Copy_Stage_Bulk` — Bulk-Copy `load-fs/…/{cw_load_date}/{cw_runId}/` → `stage-fs/…/` (depends on Delete Succeeded **oder** Failed)

**DSS-Zusatzspalten (additionalColumns):**
| Spalte | Wert |
|---|---|
| `dss_record_source` | `{cw_business_context}/{cw_source}` |
| `dss_load_date` | `cw_load_date` (yyyy-MM-dd) |
| `dss_run_id` | `cw_runId` |
| `dss_stage_timestamp` | `utcNow()` |
| `dss_source_file_name` | `$$FILENAME` |

> **Abweichung vom Template:** `Copy_Stage_v1_c6a` hat eine `Get_Path_Components`-Script-Activity auf einen Synapse Serverless SQL Pool, der via OPENROWSET y/m/d aus dem Dateipfad auflöst. EWB hat keinen Synapse Serverless SQL Pool — daher `cw_load_date`-Parameter statt SQL-Auflösung. Verhalten ist identisch wenn beide Pipelines am selben Tag laufen.

### Benötigte Ressourcen (erstellt, lokal gesichert)

| Datei | Zweck | Status |
|---|---|---|
| `adf-deploy/dataset_GenericParquetDataset_ewb.json` | Generisches Parquet-Dataset mit `cw_fileSystem`+`cw_folderPath`+`cw_fileName` (für Pipeline 1) | ✅ deployed |
| `adf-deploy/dataset_ParquetFolderDataset_ewb.json` | Folder-Dataset mit `cw_fileSystem`+`cw_folderPath` (für Pipeline 2, kein Dateiname) | ✅ deployed |
| `adf-deploy/pipeline_Copy_LandingZone_to_LoadFS_ewb.json` | Pipeline 1: `landing-zone` → `load-fs` (historized, ForEach 19 Items) | ✅ deployed |
| `adf-deploy/pipeline_Copy_Stage_ewb.json` | Pipeline 2: `load-fs/{runId}` → `stage-fs` (Bulk, Delete+Copy, DSS-Spalten) | ✅ deployed |
| `adf-deploy/deploy.sh` | Deploy-Skript (Referenz; aktives Deployment via `az rest PUT`) | archiviert |

> **Deploy-Methode:** `az datafactory pipeline create --pipeline @file` übergibt den Body leer (CLI-Bug). Korrekte Methode: `az rest --method PUT --url <adf-rest-url> --body @file.json`

### RBAC-Blocker: `ppmc_df@ewbuchs.ch` benötigt Schreibrechte

Aktuell hat `ppmc_df@ewbuchs.ch` nur `Reader` (Subscription) und `Storage Blob Data Contributor` (Storage). Für SQL Server + ADF benötigt:

```bash
# Data Factory Contributor — für ADF Dataset/Pipeline Deploy
az role assignment create \
  --assignee ppmc_df@ewbuchs.ch \
  --role "Data Factory Contributor" \
  --scope /subscriptions/68defcb4-5f61-4456-90f5-ff6bb0305183/resourceGroups/arg-analytics-ewb-01/providers/Microsoft.DataFactory/factories/analytics-datafactory001

# SQL Server / DB erstellen (Schritt 2)
az role assignment create \
  --assignee ppmc_df@ewbuchs.ch \
  --role "SQL Server Contributor" \
  --scope /subscriptions/68defcb4-5f61-4456-90f5-ff6bb0305183/resourceGroups/arg-analytics-ewb-01
```

> Beide Rollen durch EWB-Admin (Owner auf Subscription) einmalig vergeben. Nach Propagation (~2 min) `az login --tenant d33d3f40-0d4a-45aa-b50d-d6f722b0456e` + `adf-deploy/deploy.sh` ausführen.

---

## Schritt 2 — Azure SQL Server + `datavault` Datenbank erstellen

Neuer SQL Server im EWB-Tenant, gleiche Region wie ADLS (`switzerlandnorth`):

> **Naming Convention (Azure Best Practice):** Ressourcenname lowercase mit Bindestrichen (`sql-analytics-ewb-001`), Datenbankname lowercase (`datavault`) — konsistent mit dem dbt-Projektnamen.

### 2a. SQL Server erstellen

```bash
az sql server create \
  --name sql-analytics-ewb-001 \
  --resource-group arg-analytics-ewb-01 \
  --location switzerlandnorth \
  --admin-user sqladmin \
  --admin-password '4kLodHyqepOb3w'
```

> ⚠️ Passwort nach dem initialen Setup rotieren und ausschliesslich via Key Vault verwalten.

### 2b. `datavault` Datenbank erstellen (General Purpose Serverless)

```bash
az sql db create \
  --server sql-analytics-ewb-001 \
  --resource-group arg-analytics-ewb-01 \
  --name datavault \
  --edition GeneralPurpose \
  --family Gen5 \
  --capacity 2 \
  --compute-model Serverless \
  --auto-pause-delay 60 \
  --min-capacity 0.5
```

### 2c. SQL Admin-Passwort in Key Vault ablegen

```bash
az keyvault secret set \
  --vault-name analytics-keyvault001 \
  --name sql-analytics-ewb-001-admin-password \
  --value '4kLodHyqepOb3w'
```

---

## Schritt 3 — `datavault` Datenbank initialisieren

Nach der Erstellung des Servers folgt die DB-Konfiguration:

### 3a. Managed Identity für den Azure SQL Server aktivieren (System-Assigned)

```bash
az sql server update --name sql-analytics-ewb-001 --resource-group arg-analytics-ewb-01 \
  --assign-identity
```

### 3b. Schemas anlegen in `datavault` (via `sqlcmd` oder Azure Data Studio)

```sql
CREATE SCHEMA stg;   -- External Tables + Staging Views
CREATE SCHEMA vault; -- Hub, Satellite, Link (Raw Vault)
CREATE SCHEMA bv;    -- Business Vault (PIT, Bridge)
CREATE SCHEMA mart;  -- Gold / Reporting Layer
```

### 3c. External Data Sources auf `analyticsstoraccount001` konfigurieren (PolyBase)

Die Container `load-fs` (Rohdaten aus ADF-Copy) und `stage-fs` (transformierte Parquets) werden je als eigene External Data Source angelegt:

```sql
-- Database Scoped Credential (via Managed Identity)
CREATE DATABASE SCOPED CREDENTIAL [ewb-adls-mi]
WITH IDENTITY = 'Managed Identity';

-- External Data Source: landing-zone (bestehende Roh-Parquets, aktiver ADF-Sink)
CREATE EXTERNAL DATA SOURCE [ewb_landing_zone]
WITH (
  TYPE = HADOOP,
  LOCATION = 'abfss://landing-zone@analyticsstoraccount001.dfs.core.windows.net',
  CREDENTIAL = [ewb-adls-mi]
);

-- External Data Source: stage-fs (dbt-Staging, für künftige Parquets nach Pfad-Redesign)
CREATE EXTERNAL DATA SOURCE [ewb_stage_fs]
WITH (
  TYPE = HADOOP,
  LOCATION = 'abfss://stage-fs@analyticsstoraccount001.dfs.core.windows.net',
  CREDENTIAL = [ewb-adls-mi]
);

-- External File Format (für Parquet / Snappy-komprimiert wie ADF schreibt)
CREATE EXTERNAL FILE FORMAT [ParquetFormat]
WITH (FORMAT_TYPE = PARQUET, DATA_COMPRESSION = 'org.apache.hadoop.io.compress.SnappyCodec');
```

> `HADOOP`-Typ mit `abfss://` (Azure Data Lake Storage Gen2 / hierarchischer Namespace) statt `BLOB_STORAGE`, da `analyticsstoraccount001` mit DFS-Endpoint konfiguriert ist.

### 3d. RBAC-Rolle für Managed Identity auf dem Storage Container vergeben

```bash
# Object-ID der Managed Identity abrufen
MI_OBJECT_ID=$(az sql server show \
  --name sql-analytics-ewb-001 \
  --resource-group arg-analytics-ewb-01 \
  --query identity.principalId -o tsv)

# Storage Blob Data Reader auf landing-zone
az role assignment create \
  --assignee "$MI_OBJECT_ID" \
  --role "Storage Blob Data Reader" \
  --scope "/subscriptions/68defcb4-5f61-4456-90f5-ff6bb0305183/resourceGroups/arg-analytics-ewb-01/providers/Microsoft.Storage/storageAccounts/analyticsstoraccount001/blobServices/default/containers/landing-zone"

# Storage Blob Data Reader auf stage-fs (für künftige Nutzung)
az role assignment create \
  --assignee "$MI_OBJECT_ID" \
  --role "Storage Blob Data Reader" \
  --scope "/subscriptions/68defcb4-5f61-4456-90f5-ff6bb0305183/resourceGroups/arg-analytics-ewb-01/providers/Microsoft.Storage/storageAccounts/analyticsstoraccount001/blobServices/default/containers/stage-fs"

# Storage Blob Data Reader auf load-fs (für künftige Nutzung)
az role assignment create \
  --assignee "$MI_OBJECT_ID" \
  --role "Storage Blob Data Reader" \
  --scope "/subscriptions/68defcb4-5f61-4456-90f5-ff6bb0305183/resourceGroups/arg-analytics-ewb-01/providers/Microsoft.Storage/storageAccounts/analyticsstoraccount001/blobServices/default/containers/load-fs"
```

---

## Schritt 4 — Security Hardening

In dieser Reihenfolge (least-risk first):

### 4a. Key Vault — ADF Credentials umstellen

- AbacusDB-Passwort aus ADF `SecureString` herausnehmen
- Secret in `analytics-keyvault001` anlegen: `abacus-db-password`
- ADF Linked Service auf Key Vault Referenz umstellen (kein Code-Change, nur ADF UI/ARM)

### 4b. Azure SQL Firewall einschränken

```bash
# Nur GitHub Actions Runner (Self-Hosted, IP bekannt) + lokale Dev-IPs erlauben
az sql server firewall-rule create \
  --server sql-analytics-ewb-001 --resource-group arg-analytics-ewb-01 \
  --name "ghrunner-vm" --start-ip-address <runner-ip> --end-ip-address <runner-ip>

# Public-Access deaktivieren (nach Private Endpoint Setup)
# az sql server update --name sql-analytics-ewb-001 --resource-group arg-analytics-ewb-01 \
#   --restrict-outbound-network-access true
```

### 4c. Storage Account Firewall einschränken

```bash
az storage account update \
  --name analyticsstoraccount001 --resource-group arg-analytics-ewb-01 \
  --default-action Deny \
  --bypass AzureServices
# VNet/Subnetz-Regel hinzufügen für ADF + SQL
az storage account network-rule add \
  --account-name analyticsstoraccount001 \
  --resource-group arg-analytics-ewb-01 \
  --subnet <subnet-id-adf-shir>
```

### 4d. Private Endpoint für Azure SQL (geplant, nicht zwingend für ersten Sprint)

- Private Endpoint in VNet der ADF/SHIR-VNet anlegen
- DNS-Konfiguration für `sql-analytics-ewb-001.privatelink.database.windows.net`
- Firewall-Regel "Allow Azure Services" danach deaktivieren

---

## Schritt 5 — ADF → dbt Orchestrierung vorbereiten

dbt läuft auf dem Self-Hosted GitHub Actions Runner (VM `10.0.0.25`). Optionen zum Auslösen aus ADF:

| Option | Aufwand | Empfehlung |
|---|---|---|
| **ADF Web Activity → GitHub REST API** (repository_dispatch) | Niedrig | ✅ Bevorzugt |
| Azure Function (HTTP-Trigger → dbt run) | Mittel | Alternative |
| ADF Custom Activity auf Batch | Hoch | Nicht empfohlen |

### Empfohlener Ansatz: GitHub `repository_dispatch`

- ADF-Pipeline bekommt eine abschliessende **Web Activity** nach dem letzten Copy-Job
- Diese ruft die GitHub API auf: `POST /repos/ppmc/.../dispatches` mit `event_type: run-dbt-ewb`
- Ein neuer GitHub Actions Workflow `deploy-ewb.yml` reagiert auf dieses Event und führt `dbt run --target ewb --select tag:ewb` aus
- Das GitHub PAT (Personal Access Token) wird in `analytics-keyvault001` gespeichert, ADF holt es via Key Vault Linked Service

**Benötigt:**
- GitHub PAT mit `repo`-Scope → in Key Vault als Secret `github-pat-dbt-dispatch`
- Neuer Workflow `.github/workflows/deploy-ewb.yml` (Struktur analog `deploy-prod.yml`)
- dbt-Tag `ewb` in allen künftigen EWB-Modellen (für selektiven Run)

---

## Schritt 6 — dbt Konfiguration anpassen

### 6a. profiles.yml auf neuen EWB-Server aktualisieren

Der `ewb`-Target in `~/.dbt/profiles.yml` muss auf den neuen Server zeigen:

```yaml
ewb:
  type: sqlserver
  driver: 'ODBC Driver 18 for SQL Server'
  server: sql-analytics-ewb-001.database.windows.net  # neu!
  port: 1433
  database: datavault
  schema: dv
  authentication: sql
  user: sqladmin
  password: "{{ env_var('DBT_EWB_SQL_PASSWORD') }}"   # separater Env-Var!
  encrypt: true
  trust_cert: false
```

> Eigener Env-Var `DBT_EWB_SQL_PASSWORD` (nicht `DBT_SQL_PASSWORD` des PPMC-Tenants) — im GitHub Actions Secret `DBT_EWB_SQL_PASSWORD` hinterlegen.

### 6b. dbt_project.yml EWB-Block ergänzen

Minimale Vorbereitung, damit spätere Modelle das korrekte Schema erhalten.

In `datavault-dbt/dbt_project.yml` unter `models.datavault.raw_vault` ergänzen:

```yaml
ewb:
  +schema: vault_ewb
  +materialized: incremental
  +incremental_strategy: append
  +on_schema_change: append_new_columns
```

Unter `mart` ergänzen:

```yaml
ewb:
  +schema: mart_ewb
  +materialized: table
  +as_columnstore: false
```

---

## Verifikation

- `az sql server show --name sql-analytics-ewb-001 --resource-group arg-analytics-ewb-01` — Server existiert
- `az sql db show --name datavault --server sql-analytics-ewb-001 --resource-group arg-analytics-ewb-01` — DB existiert
- `sqlcmd -S sql-analytics-ewb-001.database.windows.net -d datavault -U sqladmin -P '4kLodHyqepOb3w' -Q "SELECT schema_name FROM information_schema.schemata"` — stg, vault, bv, mart
- `az sql container list --account-name analyticsstoraccount001` — Container `landing-zone`, `load-fs`, `stage-fs` sichtbar
- External Data Source Zugriff: Test-Query auf Parquet in `landing-zone/FIBU/GL/` via `OPENROWSET` direkt in `datavault`
- ADF Pipeline-Liste: FIBU, KRED, DEBI, PROJ, IDMS ✔️
- ADF Web Activity Test-Run → GitHub Actions Workflow wird getriggert
- `dbt debug --target ewb` — Verbindung läuft durch

---

## Entscheidungen & Begründungen

| Entscheidung | Begründung |
|---|---|
| ADF→dbt via GitHub `repository_dispatch` | Weniger Infrastruktur, bestehende Runner-Infrastruktur nutzen |
| Managed Identity für Storage-Zugriff | Kein SAS-Token, kein Storage Account Key — Zero-Credential-Prinzip |
| Security Hardening vor Modell-Entwicklung | Nicht nachträglich absichern müssen |
| DB-Name `datavault` (lowercase) | Azure Best Practice: Ressourcennamen lowercase; konsistent mit dbt-Projektname |
| dbt Sources aus `landing-zone` (nicht `structured-tables`) | `structured-tables` enthält vorjointe Business-Logik (Filter, JOINs, UNIONs) — verletzt DV-Prinzip der Rohdatenerhaltung. Vault modelliert selbst: ext→stg→hub/sat/link |
| External Data Source zeigt auf `landing-zone` | Dort liegen die aktuellen ADF-Parquets; `load-fs`/`stage-fs` werden nach Pfad-Redesign aktiviert |
| `landing-zone` Container (ADLS Gen2) | `abfss://` + `HADOOP`-Typ korrekt für hierarchischen Namespace |
| Snappy-Komprimierung in External File Format | ADF schreibt Parquets mit Snappy (Codec explizit angeben) |
| Neuer SQL Server `sql-analytics-ewb-001` im EWB-Tenant | `sql-datavault-weu-001` liegt auf PPMC-Shared-Tenant — Trennung der Mandanten ist zwingend |
| Separater Env-Var `DBT_EWB_SQL_PASSWORD` | Kein geteiltes Passwort mit PPMC-Tenant |
| ADF-Pipeline-Analyse in Schritt 1 | Sources aus bestehenden Pipelines ableiten bevor neue Infrastruktur gebaut wird |
| dbt-Vault-Modellierung ausgenommen | Folgt im nächsten Planungsschritt |
