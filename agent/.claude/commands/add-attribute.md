---
description: Fügt ein neues Attribut hinzu
tools: [datavault-agent]
context:
  - docs/DEVELOPER.md#9-schema-changes
  - LESSONS_LEARNED.md
---

# Attribut hinzufügen: {{ATTRIBUTE_NAME}}

Füge ein neues Attribut zu einem bestehenden Satellite hinzu.

## Schritt 1: Quelle prüfen

Prüfe ob das Attribut in der Staging-Quelle existiert:

```
Tool: describe_table
Args: { 
  "tableName": "ext_{{ENTITY_NAME}}",
  "schema": "stg"
}
```

**Falls nicht vorhanden:**
> Attribut `{{ATTRIBUTE_NAME}}` nicht in Quelle gefunden.
> 
> Optionen:
> 1. Warten bis Synapse Pipeline das Feld liefert
> 2. Als berechnetes Feld hinzufügen
> 3. Default-Wert verwenden

## Schritt 2: Staging View aktualisieren

Das neue Attribut muss in den Hash Diff einbezogen werden:

```
Tool: add_attribute_to_staging
Args: {
  "entityName": "{{ENTITY_NAME}}",
  "attributeName": "{{ATTRIBUTE_NAME}}",
  "includeInHashDiff": true
}
```

**Generierte Änderung:**
```sql
-- stg_{{ENTITY_NAME}}.sql
SELECT
  ...,
  {{ATTRIBUTE_NAME}},  -- NEU
  CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
    CONCAT_WS('|',
      ...,
      ISNULL(CAST({{ATTRIBUTE_NAME}} AS NVARCHAR(MAX)), '')  -- NEU
    )
  ), 2) AS hd_{{ENTITY_NAME}}
```

## Schritt 3: Satellite erweitern

```
Tool: add_attribute_to_satellite
Args: {
  "satelliteName": "sat_{{ENTITY_NAME}}",
  "attributeName": "{{ATTRIBUTE_NAME}}",
  "dataType": "{{DATA_TYPE}}"
}
```

## Schritt 4: Backfill (optional)

⚠️ **Wichtig bei inkrementellen Models:**

> Soll ein Backfill durchgeführt werden?
> 
> Das neue Attribut ist für historische Daten NULL.
> 
> Optionen:
> 1. **Kein Backfill** - Historische Daten behalten NULL
> 2. **Full Refresh** - `dbt run --full-refresh --select sat_{{ENTITY_NAME}}`
> 3. **Manueller Backfill** - UPDATE-Statement für historische Werte

## Schritt 5: Tests hinzufügen

```
/add-tests sat_{{ENTITY_NAME}}.{{ATTRIBUTE_NAME}}
```

## Schritt 6: Deployment

```
Tool: run_command
Args: { 
  "command": "dbt run --select stg_{{ENTITY_NAME}} sat_{{ENTITY_NAME}}" 
}
```

## Verwendung

```
/add-attribute company email_address
/add-attribute product weight_kg
```
