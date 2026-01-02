---
description: Validiert ein dbt Model
tools: [datavault-agent]
context:
  - docs/DEVELOPER.md#8-testing
---

# Model validieren: {{MODEL_NAME}}

Führe Validierungen für ein dbt Model durch.

## Vollständige Validierung

```
Tool: validate_model
Args: { "modelName": "{{MODEL_NAME}}" }
```

## Validierungsprüfungen

### 1. Syntax & Kompilierung
```
Tool: run_command
Args: { "command": "dbt compile --select {{MODEL_NAME}}" }
```

### 2. Schema-Tests
```
Tool: run_command
Args: { "command": "dbt test --select {{MODEL_NAME}}" }
```

### 3. Data Vault Konformität

Prüfungen je nach Model-Typ:

**Hub:**
- [ ] Hash Key vorhanden und eindeutig
- [ ] Business Key nicht NULL
- [ ] Metadata-Spalten (dss_load_date, dss_record_source)

**Satellite:**
- [ ] Referenziert gültigen Hub
- [ ] Hash Diff vorhanden
- [ ] Keine Duplikate (hk + load_date)

**Link:**
- [ ] Alle Hub-Referenzen gültig
- [ ] Link Hash Key korrekt berechnet

## Ausgabe-Format

```
═══════════════════════════════════════
Validierung: {{MODEL_NAME}}
═══════════════════════════════════════

✓ Kompilierung erfolgreich
✓ not_null: hk_company - PASSED
✓ unique: hk_company - PASSED
✓ relationships: hk_company → hub_company - PASSED
✗ accepted_values: status - FAILED
  → Unbekannter Wert: 'archived'

Ergebnis: 3/4 Tests bestanden

⚠️ Empfehlungen:
   - accepted_values für 'status' um 'archived' erweitern
```

## Schnellvalidierung (nur Kompilierung)

```
/validate {{MODEL_NAME}} --quick
```

## Verwendung

```
/validate hub_company
/validate sat_company
/validate stg_company
```
