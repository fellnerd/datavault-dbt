---
description: Fügt Tests zu einem Model hinzu
tools: [datavault-agent]
context:
  - docs/DEVELOPER.md#8-testing
  - models/schema.yml
---

# Tests hinzufügen: {{MODEL_NAME}}

Füge dbt Tests zu einem Model hinzu.

## Standard-Tests für Data Vault

### Hub-Tests
```yaml
models:
  - name: hub_{{ENTITY_NAME}}
    columns:
      - name: hk_{{ENTITY_NAME}}
        tests:
          - unique
          - not_null
      - name: {{BUSINESS_KEY}}
        tests:
          - unique
          - not_null
```

### Satellite-Tests
```yaml
models:
  - name: sat_{{ENTITY_NAME}}
    tests:
      - dbt_utils.unique_combination_of_columns:
          combination_of_columns:
            - hk_{{ENTITY_NAME}}
            - dss_load_date
    columns:
      - name: hk_{{ENTITY_NAME}}
        tests:
          - not_null
          - relationships:
              to: ref('hub_{{ENTITY_NAME}}')
              field: hk_{{ENTITY_NAME}}
```

### Link-Tests
```yaml
models:
  - name: link_{{ENTITY1}}_{{ENTITY2}}
    columns:
      - name: hk_link_{{ENTITY1}}_{{ENTITY2}}
        tests:
          - unique
          - not_null
      - name: hk_{{ENTITY1}}
        tests:
          - relationships:
              to: ref('hub_{{ENTITY1}}')
              field: hk_{{ENTITY1}}
```

## Tests hinzufügen

```
Tool: add_tests
Args: {
  "modelName": "{{MODEL_NAME}}",
  "testTypes": ["unique", "not_null", "relationships"]
}
```

## Erwartete Änderung in schema.yml

```yaml
# models/schema.yml
version: 2

models:
  - name: {{MODEL_NAME}}
    description: "Automatisch generierte Tests"
    columns:
      - name: hk_{{ENTITY_NAME}}
        description: "Hash Key"
        tests:
          - unique
          - not_null
      # ... weitere Spalten
```

## Tests ausführen

```
Tool: run_command
Args: { "command": "dbt test --select {{MODEL_NAME}}" }
```

## Erwartete Ausgabe

```
═══════════════════════════════════════
dbt test - Ergebnis
═══════════════════════════════════════

✓ unique_hub_company_hk_company .......... [PASS]
✓ not_null_hub_company_hk_company ........ [PASS]
✓ unique_hub_company_company_id .......... [PASS]
✓ not_null_hub_company_company_id ........ [PASS]

═══════════════════════════════════════
Completed: 4 tests | 0 failures
═══════════════════════════════════════
```

## Verwendung

```
/add-tests hub_company
/add-tests sat_company
/add-tests link_company_country
```
