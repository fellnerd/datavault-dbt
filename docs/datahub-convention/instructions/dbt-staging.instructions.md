---
applyTo: 'models/staging/**'
---
# Staging Views – dbt Data Vault (Confluence ITDATAH §4, §6)

> Diese Regeln gelten automatisch für alle Dateien unter `models/staging/`.

## Zweck
Staging Views berechnen alle Hashes und leiten technische Metadaten ab. Sie sind **nicht materialisiert** (View) und bereiten Daten für den Raw Vault vor.

## Pflicht-Macro: automate_dv.stage()

Jede Staging View MUSS `automate_dv.stage()` verwenden mit folgenden Abschnitten:

```sql
{%- set yaml_metadata -%}
source_model:
  <source_alias>: <concept>_<entity>
derived_columns:
  dss_record_source: "!<system>.<db>.<schema>.<table>"
  dss_load_date: "GETDATE()"
  dss_create_datetime: "GETDATE()"
  dss_business_key: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(<BK1>)), '-1'), ...)"
hashed_columns:
  hk_<entity>:
    - <BK_COLUMN_1>   {# alphabetisch sortiert! #}
    - <BK_COLUMN_2>
  hd_<entity>:
    is_hashdiff: true
    columns:
      - <ATTR_1>       {# alphabetisch sortiert! #}
      - <ATTR_2>
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}
{{ automate_dv.stage(include_source_columns=true,
                     source_model=metadata_dict['source_model'],
                     derived_columns=metadata_dict['derived_columns'],
                     hashed_columns=metadata_dict['hashed_columns']) }}
```

## Hashing-Regeln (Confluence §4)

| Regel | Wert |
|-------|------|
| Algorithmus | SHA2_256 |
| Separator | `\|\|` (doppelte Pipe) |
| NULL-Behandlung | `'-1'` (über `null_placeholder_string` in dbt_project.yml) |
| Output | CHAR(64) |
| Funktion | CONVERT (NICHT CAST) – via `hash_override.sql` |
| Cleaning | LTRIM + RTRIM auf alle Spalten |
| BK-Sortierung | **Alphabetisch** in `hk_<entity>` UND in `dss_business_key` |

## Business Key Bildung (Confluence §3)

```
dss_business_key = 'default||default||BK1||BK2||...||BKn'
```

- `dss_tenant_key` = `'default'` (Single-Tenant)
- `dss_business_key_ccode` = `'default'` (Single-Source)
- BK-Spalten alphabetisch sortiert
- NULL → `'-1'` (Zero Key)
- Sonderzeichen: Tab, LF, FF, CR entfernen
- `||` in Quelldaten mit `\` escapen

### BK Casing (Abweichung von Confluence)

> **Confluence** definiert **LOWER()** für BK Cleaning. Dieses Projekt verwendet **UPPER()** (automate_dv Default: `hash_content_casing: upper`).
> Diese Abweichung ist **bewusst gewählt** – automate_dv wendet UPPER() intern auf alle Hash-Eingaben an. Für Konsistenz mit dem bestehenden Datahub ggf. anpassen:
> ```yaml
> vars:
>   hash_content_casing: 'disabled'  # oder custom macro für LOWER
> ```

### Case-Sensitive Business Keys (Confluence §3)

Wenn Business Keys case-sensitiv sein müssen (seltener Fall):
```sql
CONCAT(BK, '_', SUBSTRING(CONVERT(NCHAR(64), HASHBYTES('SHA2_256', BK), 2), 1, 10))
```
- Originaler BK kommt in den Satelliten
- Angepasster BK (mit Hash-Suffix) kommt in den Hub

## Change Hash (hd_<entity>) – Confluence §4

- Beinhaltet **alle** relevanten Business-Attribute
- **Keine** technischen Attribute des Vorsystems (z.B. UNAME, ERDAT)
- **Keine** Business Keys (die sind im Hub)
- Bei Delta Load: Delta-Kriterium **nicht** im Hash
- Spalten alphabetisch sortiert in `columns:`

## derived_columns – Pflicht-Attribute (Confluence §6)

| Attribut | Wert | Beschreibung |
|----------|------|--------------|
| `dss_record_source` | `!<system>.<db>.<schema>.<table>` | `!` = Literal-String in automate_dv |
| `dss_load_date` | `GETDATE()` | Beladungszeitpunkt |
| `dss_create_datetime` | `GETDATE()` | Erstellungszeitpunkt in Zieltabelle |
| `dss_business_key` | `CONCAT_WS(...)` | Konkatenierter BK mit Separator `\|\|` |

## Naming (Confluence §5)

- Staging-Datei: `<concept>_<entity>.sql` (z.B. `sap_co_catsco.sql`)
- Schema: `stg`
- Hash Key: `hk_<entity>` (z.B. `hk_catsco`)
- Hash Diff: `hd_<entity>` (z.B. `hd_catsco`)
- Für DC: `hk_link_<dc>_<parent>`, `hd_<dc>_<parent>_dc`

## Kommentar-Header (Pflicht)

Jede Staging View muss einen Kommentarblock mit folgenden Informationen haben:
- Confluence-Schicht, Source, Entity
- Business Key Spalten + Sortierung
- Hash-Regeln-Verweis
- dss_* Attribute Auflistung

## Hard Rules (Confluence §10) – erlaubt im Staging

- Leer-Strings → NULL
- Datentyp-Vereinheitlichung
- Datumsformat-Standardisierung
- LTRIM/RTRIM (via hash_override.sql)
- **Keine** Soft Rules (Business-Logik) im Staging!

## Source Systems (Confluence §11)

Gültige Werte für `dss_record_source` Prefix:

| Key | System |
|-----|--------|
| `sap_hcm` | SAP HCM Modul |
| `sap_crm` | SAP CRM Modul |
| `sap_common` | SAP Allgemein |
| `sap_co` | SAP Controlling |
| `sap_isu` | SAP ISU |
| `sap_eam` | SAP EAM |
| `sap_mm` | SAP Materialwirtschaft |
| `sap_ca` | SAP ZCA Erlöse |
| `jira` | Jira |
| `iss` | ISS Kundenportal |
| `metric` | Metrik/Event-Daten |
| `xeox` | AD-User/Gruppen |
| `manual` | Zip/manuelle Daten |
| `powerplant` | Kraftwerksdaten |

**Format:** `dss_record_source = '<system>.<DB>.<SCHEMA>.<TABLE>'`
Beispiel: `sap_co.LOAD.external_load_source.catsco`
