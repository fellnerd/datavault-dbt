---
description: Erstellt eine persistierte Static Table im Mart-Layer
tools: [datavault-agent]
context:
  - docs/DEVELOPER.md#8-static-tables
  - docs/USER.md
---

# Static Table erstellen: {{TABLE_NAME}}

Du erstellst eine persistierte Static Table. Static Tables sind physische Tabellen mit Index für optimierte Abfragen.

## Schritt 1: View vs. Table entscheiden

> Benötigst du wirklich eine persistierte Tabelle?
>
> **Static Table verwenden wenn:**
> - ☑ Komplexe JOINs über mehrere Hubs/Satellites
> - ☑ Häufige Abfragen mit denselben Filtern
> - ☑ Performance kritisch (BI-Dashboards)
> - ☑ Daten müssen nicht real-time sein
>
> **View verwenden wenn:**
> - ☐ Daten müssen immer aktuell sein
> - ☐ Einfache JOINs (1 Hub + 1-2 Satellites)
> - ☐ Selten abgefragt

## Schritt 2: Quellen identifizieren

```
Tool: list_entities
Args: { "entityType": "all" }
```

> Welche Data Vault Objekte sollen einbezogen werden?
>
> **Basis-Hub:** (genau einer)
> ☐ hub_company
> ☐ hub_project
> ☐ hub_country
>
> **Satellites:** (mit aktuellen Daten)
> ☐ sat_company (nur dss_is_current = 'Y')
> ☐ sat_project
> ☐ eff_sat_company_country
>
> **Links:** (optional für Verknüpfungen)
> ☐ link_company_country
> ☐ link_company_project

## Schritt 3: Spalten auswählen

```
Tool: get_entity_info
Args: { "entityName": "sat_company" }
```

> Welche Spalten sollen übernommen werden?
>
> **Payload-Spalten:**
> ☐ name
> ☐ city
> ☐ street
> ☐ (alle: `["*"]`)
>
> **Hinweis:** Hash Keys und Metadata-Spalten werden automatisch ausgeschlossen.

## Schritt 4: Static Table erstellen

```
Tool: create_static_table
Args: {
  "tableName": "{{TABLE_NAME}}",
  "description": "{{DESCRIPTION}}",
  "baseHub": "{{BASE_HUB}}",
  "satellites": [
    {
      "name": "{{SATELLITE_NAME}}",
      "columns": ["*"],
      "currentOnly": true
    }
  ],
  "links": []
}
```

**Generierte Struktur:**
```sql
{{ config(
    materialized='incremental',
    unique_key='hk_company',
    incremental_strategy='merge',
    as_columnstore=false,
    tags=['static'],
    post_hook=["{{ create_hash_index('hk_company') }}"]
) }}

WITH source_data AS (
    SELECT
        h.hk_company,
        h.object_id,
        s.name,
        s.city,
        COALESCE(s.dss_load_date) AS last_updated
    FROM {{ ref('hub_company') }} h
    LEFT JOIN {{ ref('sat_company') }} s
        ON h.hk_company = s.hk_company
        AND s.dss_is_current = 'Y'
    WHERE h.object_id > 0
)

SELECT * FROM source_data
{% if is_incremental() %}
WHERE last_updated > (SELECT MAX(last_updated) FROM {{ this }})
{% endif %}
```

## Schritt 5: Deployment

```bash
# Initial Load (Full Refresh)
dbt run --select {{TABLE_NAME}} --full-refresh

# Inkrementelles Update
dbt run --select {{TABLE_NAME}}

# Alle Static Tables aktualisieren
dbt run --select tag:static
```

## Schritt 6: Index verifizieren

```
Tool: db_run_query
Args: {
  "query": "SELECT name, type_desc FROM sys.indexes WHERE object_id = OBJECT_ID('mart_static.{{TABLE_NAME}}')"
}
```

## Placeholders

- `{{TABLE_NAME}}`: Name der Tabelle (z.B. "company_current")
- `{{DESCRIPTION}}`: Beschreibung des Anwendungsfalls
- `{{BASE_HUB}}`: Basis-Hub (z.B. "hub_company")
- `{{SATELLITE_NAME}}`: Primärer Satellite

## Beispiel

```
/create-static-table company_current
```

Erstellt persistierte Tabelle mit aktuellen Company-Daten und Index auf hk_company.
