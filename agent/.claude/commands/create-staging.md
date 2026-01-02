---
description: Erstellt Staging-View und optional External Table
tools: [datavault-agent]
context:
  - docs/DEVELOPER.md#31-staging-view-erstellen
  - models/staging/sources.yml
---

# Staging erstellen: {{ENTITY_NAME}}

Du erstellst die Staging-Layer für eine neue Entity. Folge diesem Workflow:

## Schritt 1: Quelle prüfen

Prüfe ob die External Table existiert:

```
Tool: describe_table
Args: { 
  "tableName": "ext_{{ENTITY_NAME}}",
  "schema": "stg"
}
```

**Falls nicht vorhanden:**
> External Table `ext_{{ENTITY_NAME}}` nicht gefunden.
> 
> Optionen:
> 1. Zuerst in `sources.yml` definieren und `dbt run-operation stage_external_sources` ausführen
> 2. Andere Quelle verwenden (z.B. existierende Tabelle)
>
> Pfad zu Parquet-Dateien: {{PARQUET_PATH}}

## Schritt 2: Spalten analysieren

```
Tool: preview_data
Args: {
  "tableName": "ext_{{ENTITY_NAME}}",
  "schema": "stg",
  "limit": 5
}
```

**Zeige Datenvorschau:**
> Erkannte Spalten und Datentypen:
> | Spalte | Typ | Beispielwert |
> |--------|-----|--------------|
> | id | int | 42 |
> | name | varchar | "Beispiel GmbH" |
> ...

## Schritt 3: Business Key bestimmen

> Welche Spalte(n) bilden den Business Key?
> 
> ⚠️ Der Business Key muss eindeutig identifizieren und stabil sein.
> 
> **Kandidaten (typisch für `{{ENTITY_NAME}}`):**
> - `id` - Technischer Schlüssel
> - `{{ENTITY_NAME}}_code` - Fachlicher Schlüssel
> - Kombination aus mehreren Spalten?

## Schritt 4: Staging View erstellen

```
Tool: create_staging
Args: {
  "entityName": "{{ENTITY_NAME}}",
  "businessKeyColumns": {{BUSINESS_KEY_COLUMNS}},
  "recordSource": "{{RECORD_SOURCE}}"
}
```

**Generierte Spalten:**
- `hk_{{ENTITY_NAME}}` - Hash Key aus Business Key
- `hd_{{ENTITY_NAME}}` - Hash Diff aus allen Payload-Spalten
- `dss_load_date` - Ladezeitpunkt
- `dss_record_source` - Quellsystem

## Schritt 5: Validierung

```
Tool: run_command
Args: { 
  "command": "dbt run --select stg_{{ENTITY_NAME}}"
}
```

Prüfe:
- [ ] View erstellt ohne Fehler
- [ ] Hash Keys korrekt berechnet
- [ ] Keine NULL Business Keys

## Placeholders

- `{{ENTITY_NAME}}`: Name der Entity (z.B. "product")
- `{{BUSINESS_KEY_COLUMNS}}`: Array der Business Key Spalten
- `{{RECORD_SOURCE}}`: Quellsystem (default: "werkportal")
- `{{PARQUET_PATH}}`: Pfad in ADLS (z.B. "werkportal/product/")

## Beispiel

```
/create-staging product
```

Erstellt `stg_product.sql` mit Hash-Berechnungen für `hub_product` und `sat_product`.
