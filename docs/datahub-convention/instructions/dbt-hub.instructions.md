---
applyTo: '**/hubs/**'
---
# Hub Models – dbt Data Vault (Confluence ITDATAH §2.1)

> Diese Regeln gelten automatisch für alle Dateien unter `**/hubs/`.

## Zweck
Ein Hub repräsentiert ein **Geschäftsobjekt** (reportingrelevant). Er enthält **nur Business Keys** (unveränderlich) + Hash Key.

## Pflicht-Macro: automate_dv.hub()

```sql
{%- set src_pk = 'hk_<entity>' -%}
{%- set src_nk = ['<BK1>', '<BK2>'] -%}            {# alphabetisch sortiert! #}
{%- set src_extra_columns = ['dss_business_key', 'dss_create_datetime'] -%}
{%- set src_ldts = 'dss_load_date' -%}
{%- set src_source = 'dss_record_source' -%}

{{ automate_dv.hub(src_pk=src_pk,
                   src_nk=src_nk,
                   src_extra_columns=src_extra_columns,
                   src_ldts=src_ldts,
                   src_source=src_source,
                   source_model='<concept>_<entity>') }}
```

## Hub-Regeln (Confluence §2.1)

1. **Nur Business Keys + Hash Key** – keine beschreibenden Attribute
2. **Semantisch gleiche Inhalte** aus verschiedenen Quellen → gleicher Hub
3. **Natural Key** als Business Key verwenden (muss Record eindeutig identifizieren)
4. **Hub ist Tenant-übergreifend**
5. **Keine Umformung** von Geschäftsentitäten im Raw Vault (kein Party-Splitting)
6. **Insert-Only** – keine Updates, keine Deletes

## Aufbau (Confluence §2.1 + §6)

```
hk_{entity}              CHAR(64)       - Hash Key (SHA2_256, PK)
<business_key_1>         NVARCHAR       - BK Spalte 1 (alphabetisch)
...
<business_key_n>         NVARCHAR       - BK Spalte n
dss_business_key         NVARCHAR(255)  - Konkatenierter BK (via src_extra_columns)
dss_create_datetime      DATETIME2(7)   - Erstellungs-Timestamp (via src_extra_columns)
dss_load_date            DATETIME2(7)   - Beladungs-Timestamp
dss_record_source        NVARCHAR(255)  - Quellenidentifikation
```

## src_extra_columns (Pflicht)

Immer `['dss_business_key', 'dss_create_datetime']` verwenden:

| Spalte | Herkunft | Beschreibung |
|--------|----------|--------------|
| `dss_business_key` | Staging derived_column | `default\|\|default\|\|BK1\|\|...BKn` |
| `dss_create_datetime` | Staging derived_column | GETDATE() zum Erstellungszeitpunkt |

## Naming (Confluence §5)

| Objekt | Pattern | Beispiel |
|--------|---------|---------|
| Hub | `hub_{business_concept}` | `hub_catsco` |
| Reference Hub | `hub_ref_{concept}` | `hub_ref_land` |
| Common Hub | `hub_{concept}` (in `_common/`) | `hub_mitarbeiter` |
| Hash Key | `hk_{entity}` | `hk_catsco` |

## Schema

| Ordner | Schema |
|--------|--------|
| `raw_vault/_common/hubs/` | `vault` |
| `raw_vault/<concept>/hubs/` | `vault_<concept>` |

## Materialisierung

```yaml
+materialized: incremental
+incremental_strategy: append
+as_columnstore: false    # Azure SQL Basic Tier
```

## Zero Keys (Confluence §7)

- Jeder Hub enthält einen **Zero Key** für fehlende Business Keys
- HK = `'-1'`, BK-Spalten = Default-Werte
- Werden über `ghost_records.sql` Macro erzeugt (post_hook)

## Hub-Ermittlung Checkliste (Confluence §14)

1. ☐ Geschäftsobjekt + Business Keys identifiziert (Natural Keys)
2. ☐ Abstimmung mit Architektenteam (neue Hubs vs. bestehende)
3. ☐ Semantische Gleichheit geprüft (kein super/sub typing)
4. ☐ BK-Reihenfolge bei existierenden Hubs beachtet
5. ☐ Business Key Collision Code Bedarf geprüft

## Kommentar-Header (Pflicht)

Jeder Hub muss einen Kommentarblock mit folgenden Informationen haben:
- Confluence-Schicht + Schema
- Geschäftsobjekt-Beschreibung
- Business Key Spalten
- Aufbau-Tabelle (alle Spalten mit Typen)
- Beladungsstrategie
