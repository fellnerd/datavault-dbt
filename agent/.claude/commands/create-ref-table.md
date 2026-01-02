---
description: Erstellt eine Reference Table
tools: [datavault-agent]
context:
  - docs/DEVELOPER.md#55-reference-tables
  - seeds/
---

# Reference Table erstellen: {{REF_NAME}}

Du erstellst eine Reference (Lookup) Tabelle für Stammdaten wie Länder, Status-Codes, etc.

## Schritt 1: Art bestimmen

> Wie soll die Reference Table befüllt werden?
>
> 1. **Seed (CSV)** - Statische Daten aus CSV-Datei
> 2. **Externe Quelle** - Aus ADLS/Datenbank
> 3. **Hardcoded** - Direkt im Model definiert

## Option A: Als Seed (empfohlen für kleine Lookup-Tabellen)

```
Tool: create_reference_table
Args: {
  "refName": "{{REF_NAME}}",
  "type": "seed",
  "columns": {{COLUMNS}}
}
```

**Erstellt `seeds/ref_{{REF_NAME}}.csv`:**
```csv
code,name,sort_order
active,Aktiv,1
inactive,Inaktiv,2
pending,Ausstehend,3
```

**Und `seeds/schema.yml` Eintrag:**
```yaml
seeds:
  - name: ref_{{REF_NAME}}
    description: Lookup-Tabelle für {{REF_NAME}}
    columns:
      - name: code
        description: Eindeutiger Code
        tests:
          - unique
          - not_null
```

## Option B: Als externes Model

Für größere oder dynamische Reference-Daten:

```sql
-- models/reference/ref_{{REF_NAME}}.sql
SELECT 
  {{REF_NAME}}_code,
  {{REF_NAME}}_name,
  is_active
FROM {{ source('reference', 'ext_{{REF_NAME}}') }}
```

## Schritt 2: Verwendung in Satellites

Reference Tables können in Satellites referenziert werden:

```sql
-- In sat_company.sql
SELECT 
  s.*,
  ref.status_name
FROM {{ ref('stg_company') }} s
LEFT JOIN {{ ref('ref_status') }} ref
  ON s.status_code = ref.status_code
```

## Schritt 3: Laden

Für Seeds:
```
Tool: run_command
Args: { "command": "dbt seed --select ref_{{REF_NAME}}" }
```

## Placeholders

- `{{REF_NAME}}`: Name der Reference Table (z.B. "status", "country_code")
- `{{COLUMNS}}`: Array der Spalten mit Namen und Typen

## Beispiel

```
/create-ref-table status
```

Erstellt `seeds/ref_status.csv` mit Status-Codes.
