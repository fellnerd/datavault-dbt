---
applyTo: '**'
---
# Data Quality Framework (Confluence ITDATAH "Data Quality")

> Globale Regeln für Datenqualität im gesamten Projekt.

## Prinzip (Confluence)

Regelbasiertes Framework mit definierten **DQ Rules**, die auf **Rule Sets** gruppiert werden. Jede Regel definiert einen Vergleich und eine Aktion bei Verletzung.

## DQ Rule Definition

| Attribut | Beschreibung | Beispiel |
|----------|-------------|---------|
| `rule_id` | Eindeutige ID | `DQ_001` |
| `rule_name` | Sprechender Name | `BK_NOT_NULL` |
| `rule_description` | Beschreibung | Business Key darf nicht NULL sein |
| `comparison_type` | Vergleichsoperation | `IS_NOT_NULL`, `EQUALS`, `BETWEEN`, `REGEX` |
| `threshold` | Schwellwert | `0` (0 Fehler erlaubt) |
| `action` | Bei Verletzung | `I` (Info), `W` (Warning), `F` (Fail) |

## Result Actions

| Action | Verhalten | dbt-Äquivalent |
|--------|-----------|----------------|
| `I` (Info) | Nur loggen, Beladung läuft weiter | `warn_if: ">0"` |
| `W` (Warning) | Warnung, Beladung läuft weiter | `warn_if: ">0"` |
| `F` (Fail) | Beladung stoppt | `error_if: ">0"` (default) |

## Standard DQ-Regeln für Data Vault

### Hub-Regeln
```yaml
- rule: BK_NOT_NULL
  action: F
  test: "SELECT * FROM hub WHERE business_key IS NULL"

- rule: HK_UNIQUE
  action: F
  test: "SELECT hk, COUNT(*) FROM hub GROUP BY hk HAVING COUNT(*) > 1"

- rule: HK_FORMAT_SHA256
  action: F
  test: "SELECT * FROM hub WHERE LEN(hk) != 64"
```

### Satellite-Regeln
```yaml
- rule: SAT_REF_INTEGRITY
  action: F
  test: "SELECT s.hk FROM sat s LEFT JOIN hub h ON s.hk = h.hk WHERE h.hk IS NULL"

- rule: SAT_NO_DUPLICATE_PER_TIMESTAMP
  action: F
  test: "SELECT hk, dss_load_date, COUNT(*) FROM sat GROUP BY hk, dss_load_date HAVING COUNT(*) > 1"

- rule: HASHDIFF_NOT_NULL
  action: F
  test: "SELECT * FROM sat WHERE HASHDIFF IS NULL"
```

### Link-Regeln
```yaml
- rule: LINK_FK_REF_INTEGRITY
  action: F
  test: "SELECT l.hk_hub FROM link l LEFT JOIN hub h ON l.hk_hub = h.hk WHERE h.hk IS NULL"

- rule: LINK_MIN_2_HUBS
  action: F
  description: "Ein Link muss mindestens 2 Hub-FKs haben"
```

## DQ in dbt umsetzen

### Schema-Tests (in _<concept>__models.yml)
```yaml
models:
  - name: hub_<entity>
    columns:
      - name: hk_<entity>
        tests:
          - not_null          # DQ: BK_NOT_NULL (F)
          - unique            # DQ: HK_UNIQUE (F)
      - name: dss_record_source
        tests:
          - not_null
          - accepted_values:
              values: ['sap_co.LOAD.external_load_source.catsco']
```

### Singular Tests (in tests/)
```sql
-- tests/dq_hash_format.sql
SELECT *
FROM {{ ref('hub_<entity>') }}
WHERE LEN(hk_<entity>) != 64
   OR hk_<entity> IS NULL
```

## DSGVO / Data Governance (Confluence "Data Governance")

### Sensible Daten
- **Eigener Satellit** für personenbezogene Daten (GDPR)
- Naming: `sat_{entity}__<system>__gdpr`
- Separate Access Controls (Row-Level Security via `dss_sec_value_key`)

### Löschung vs. Anonymisierung
- **Anonymisierung bevorzugt** (Data Vault = Insert-Only)
- `dss_deleted = 'Y'` für logisches Löschen
- Physisches Löschen nur bei rechtlicher Pflicht

### dss_sec_value_key
- Format: `{Mandant}_{OrgId}`
- Default: `'-1'` (kein RLS)
- Ghost Record: `'ghost_record'`
