---
applyTo: 'tests/**'
---
# Testing – dbt Data Vault (Confluence ITDATAH "Testen")

> Diese Regeln gelten automatisch für alle Dateien unter `tests/`.

## Test-Systematik (Confluence: ISTQB-basiert)

| Stufe | Scope | automatisiert? |
|-------|-------|----------------|
| Unit Test | Einzelne dbt-Modelle (Hub, Sat, Link, Staging) | Ja – dbt test |
| Integrationstest | Zusammenspiel mehrerer Modelle + Staging | Ja – dbt test |
| Systemtest | End-to-End: External Table → Vault → Mart | Teilweise |
| Abnahmetest | Fachliche Validierung durch Business | Manuell |

## Pflicht-Tests pro Entität (Confluence DV-spezifisch)

### Hub Tests
```yaml
models:
  - name: hub_<entity>
    columns:
      - name: hk_<entity>
        tests:
          - not_null
          - unique
      - name: <business_key>
        tests:
          - not_null
      - name: dss_load_date
        tests:
          - not_null
      - name: dss_record_source
        tests:
          - not_null
```

### Satellite Tests
```yaml
models:
  - name: sat_<entity>__<system>
    columns:
      - name: hk_<entity>
        tests:
          - not_null
          - relationships:
              to: ref('hub_<entity>')
              field: hk_<entity>
      - name: HASHDIFF
        tests:
          - not_null
      - name: dss_load_date
        tests:
          - not_null
```

### Link Tests
```yaml
models:
  - name: link_<hub1>_<hub2>
    columns:
      - name: hk_link_<hub1>_<hub2>
        tests:
          - not_null
          - unique
      - name: hk_<hub1>
        tests:
          - not_null
          - relationships:
              to: ref('hub_<hub1>')
              field: hk_<hub1>
      - name: hk_<hub2>
        tests:
          - not_null
          - relationships:
              to: ref('hub_<hub2>')
              field: hk_<hub2>
```

## DV-spezifische Testregeln (Confluence)

### 1. Meta-Attribut Check
Prüft dass alle `dss_*` Attribute korrekt befüllt sind:
- `dss_load_date` NOT NULL
- `dss_record_source` NOT NULL und im gültigen Format (`system.db.schema.table`)
- `dss_create_datetime` NOT NULL

### 2. Hash Key Uniqueness
- Hub HK muss UNIQUE sein
- Link HK muss UNIQUE sein
- Satellite HK + dss_load_date UNIQUE (kein Duplikat pro Zeitpunkt)

### 3. Referential Integrity
- Jeder Satellite HK muss im zugehörigen Hub/Link existieren
- Jeder Link FK muss im zugehörigen Hub existieren

### 4. Ghost Record Check
- Jeder Hub hat genau 1 Ghost Record mit HK = `'-1'`
- Jeder Satellite hat genau 1 Ghost Record
- Ghost Record dss_record_source = `'ghost_record'`

### 5. Hash Consistency
- SHA2_256 immer CHAR(64)
- Keine HASHBYTES-Truncation (kein CAST, immer CONVERT)

## Custom Test Template

```sql
-- tests/generic/test_ghost_record_exists.sql
{% test ghost_record_exists(model, column_name) %}
SELECT COUNT(*) as cnt
FROM {{ model }}
WHERE {{ column_name }} = '-1'
HAVING COUNT(*) != 1
{% endtest %}
```

## Test-Ausführung

```bash
dbt test                                    # Alle Tests
dbt test --select raw_vault.sap_co          # Tests eines Concepts
dbt test --select hub_catsco                # Tests eines Models
```

## Häufige Testfehler

| Fehler | Ursache | Lösung |
|--------|---------|--------|
| HK not unique | Duplicate Business Keys in Source | BK-Cleaning prüfen |
| Relationship failure | Satellite vor Hub geladen | Dependency prüfen (+) |
| Ghost record missing | post_hook nicht aktiv | ghost_records Macro aktivieren |
| HASHDIFF mismatch | Spaltenreihenfolge geändert | Alphabetische Sortierung prüfen |
