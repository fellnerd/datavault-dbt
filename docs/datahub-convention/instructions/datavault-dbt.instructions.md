---
applyTo: '**'
---
## PROJEKT: Data Vault 2.0 mit dbt

Dieses Projekt implementiert eine Data Vault 2.0 Architektur basierend auf den **Kelag Datahub Confluence-Prinzipien** (Space ITDATAH).

> **Maßgebliche DV-Prinzipien:** Siehe `datahub-confluence.instructions.md` für alle Data Vault Regeln (Hashing, Naming, Ghost Records, Historisierung, etc.)

## ARCHITEKTUR

### Umgebungen

| Umgebung | Server | Datenbank | Zweck |
|----------|--------|-----------|-------|
| **On-Premises PoC** | `etl-test1` | LOAD | SAP-Datenquellen, lokale Entwicklung |
| **Azure PoC** | `sql-datavault-weu-001.database.windows.net` | Vault | Multi-Tenant SaaS-Template |

### Datenfluss (On-Premises)
```
SAP → LOAD.external_load_source.* → dbt Staging View (stg) → dbt Hub/Sat/Link (vault_<concept>)
```

### Datenfluss (Azure)
```
PostgreSQL → Synapse Pipeline → ADLS Parquet → External Table (stg.ext_*) → dbt Staging View (stg) → Hub/Sat/Link
```

### Schema-Naming-Konvention

| Layer | Ordner | Schema | Verwendung |
|-------|--------|--------|------------|
| Staging | `staging/` | `stg` | Alle Quellen |
| Raw Vault (common) | `raw_vault/_common/` | `vault` | Quell-übergreifende Objekte |
| Raw Vault (source) | `raw_vault/<concept>/` | `vault_<concept>` | Quellsystem-spezifische Objekte |
| Business Vault | `business_vault/` | `vault` | Soft Rules, PITs, Bridges |
| Mart (common) | `mart/_common/` | `mart` | Geteilte Dimensionen |
| Mart (domain) | `mart/<concept>/` | `mart_<concept>` | Domain-spezifische Views |

**Pattern:** `_common` → Basis-Schema, `<concept>` → `<basis>_<concept>`

### Business Concepts (Confluence §12)

| Key | Bereich |
|-----|---------|
| `datahub` | Allgemeine/Common Objekte |
| `hcm` | HR Daten |
| `crm` | Kundendaten |
| `isu` | Online VertragsAbschluss |
| `jira` | Jira |
| `meta` | Metadaten |
| `weather` | Wetter/Klimadaten |
| `powerplant` | Kraftwerksdaten |
| `coar` | Controlling Auftragsabrechnung |
| `energy_industry` | Energy Industry |
| `em` | Energy Management |
| `orga` | Organisation |

## NAMENSKONVENTIONEN

> **Vollständige Naming-Matrix:** Siehe `datahub-confluence.instructions.md` Abschnitt 5.

### Tabellen/Views
- Hub: `vault_<concept>.hub_<entity>` (z.B. `vault_sap.hub_catsco`)
- Satellite: `vault_<concept>.sat_<entity>__<system>` (z.B. `vault_sap.sat_catsco__sap_co`)
- Link: `vault_<concept>.link_<hub1>_<hub2>` (z.B. `vault_sap.link_catsco_kostenstelle`)
- Common Hub: `vault.hub_<entity>` (quell-übergreifend integriert)
- Staging View: `stg.<concept>_<entity>` (z.B. `stg.sap_co_catsco`)

### Spalten
- Hash Key: `hk_<entity>` (SHA2_256, CHAR(64))
- Hash Diff: `hd_<entity>` (für Satellites, Confluence: `dss_change_hash_{sat}`)
- Business Key: Original-Name oder `<entity>_id`
- Metadata: `dss_` Prefix (dss_load_date, dss_record_source, dss_run_id)

### Satellite-Trennung (Confluence-Regel)
1. **Datenherkunft** (verschiedene Quellsysteme → verschiedene Satelliten)
2. **Änderungshäufigkeit** (Stammdaten vs. Transaktionsdaten)
3. **Fachliche Trennung** (inhaltlich zusammengehörige Attribute)
4. **Sensible Daten** (GDPR → eigener Satellit)
5. **>100 Spalten** → inhaltliche Trennung
6. **Technische Gründe** (Tabelle zu breit für effiziente Verarbeitung)

## HASHING (Confluence-konform)

- **Algorithmus:** SHA2_256
- **Separator:** `||` (doppelte Pipe)
- **NULL-Behandlung:** `'-1'` (unterscheidbar von leerem String)
- **Output:** CHAR(64)
- **Funktion:** CONVERT (nicht CAST)
- **Cleaning:** LTRIM + RTRIM auf alle Spalten
- **BK-Sortierung:** alphabetisch

### Hash-Berechnung (SQL Server)
```sql
-- Manuell:
CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
    CONCAT_WS('||', ISNULL(CAST(col1 AS NVARCHAR(MAX)), '-1'), ISNULL(CAST(col2 AS NVARCHAR(MAX)), '-1'))
), 2)

-- Über automate_dv (empfohlen): Verwendet hash_override.sql Macro
-- Konfiguration: separator '||', NULL → '-1' über null_placeholder_string var
```

## DBT BEFEHLE

```bash
# Umgebung aktivieren
source .venv/bin/activate

dbt debug          # Verbindung testen
dbt deps           # Packages installieren
dbt compile        # SQL generieren (ohne Ausführung)
dbt run            # Alle Models ausführen
dbt run --select raw_vault.sap.hub_catsco   # Einzelnes Model (immer vollen Pfad!)
dbt run --select raw_vault.sap               # Alle SAP Models
dbt test           # Tests ausführen
```

## WICHTIGE EINSTELLUNGEN

### SQL Server Limitationen
- `as_columnstore: false` - Bei Azure SQL Basic Tier
- Incremental Strategy: `append`
- On-Premises: `windows_login: true`, ODBC Driver 17

## OFFENE PUNKTE

- [ ] Ghost Records implementieren (Macro vorhanden: `ghost_records.sql`, Confluence-Defaults beachten)
- [ ] NULL-Behandlung in automate_dv auf `-1` umstellen (`null_placeholder_string` var)
- [x] BK Casing: Confluence = LOWER(), Projekt = **UPPER()** (automate_dv Default) – bewusste Abweichung, dokumentiert in dbt-staging.instructions.md
- [ ] Common Vault Objects (`raw_vault/_common/`) für integrierte Hubs
- [ ] Business Vault Views (PITs, Bridges) – siehe dbt-business-vault.instructions.md
- [ ] dss_tenant_key + dss_business_key_ccode bei Multi-Tenant nachziehen
- [ ] Status Tracking Sat (dss_deleted) implementieren

## DOKUMENTIERTE ABWEICHUNGEN VON CONFLUENCE

| Punkt | Confluence | Projekt | Begründung |
|-------|-----------|---------|------------|
| BK Casing | LOWER() | UPPER() | automate_dv Default (`hash_content_casing: upper`) |
| dss_create_datetime Typ | DATETIME | DATETIME2(7) | Höhere Präzision, SQL Server Best Practice |
| dss_load_date Name | dss_load_datetime | dss_load_date | automate_dv Konvention, gleiche Semantik |
