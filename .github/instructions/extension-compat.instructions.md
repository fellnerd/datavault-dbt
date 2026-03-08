---
applyTo: '.vscode/entity-designer/**'
---
# VS Code Extension — Kompatibilitätsregeln

## Entity Designer JSON Format

Jede neue Entity **muss** eine JSON-Datei in `.vscode/entity-designer/` haben.

### Dateiname
```
<concept>_<entityName>.json
```
Beispiele: `adworks_kunde.json`, `ewb_fibu_fhe_main.json`

### Schema
```json
{
  "concept": "<concept>",
  "entityName": "<entityName>",
  "sourceTable": "ext_<concept>_<entity>",
  "sourceType": "external_table",
  "columns": [...],
  "savedAt": "<ISO-Timestamp>",
  "generatedObjects": ["hub", "satellite"]
}
```

### Column-Schema
```json
{
  "name": "SpaltenName",
  "sourceName": "SpaltenName",
  "dataType": "NVARCHAR(4000)",
  "columnType": "satellite",
  "includeInHashDiff": true,
  "nullable": true
}
```

### columnType Werte
| Wert | Bedeutung | DV-Objekt |
|------|-----------|-----------|
| `"hub"` | Business Key | → Hub (src_nk) |
| `"satellite"` | Attribut/Payload | → Satellite (src_payload) |
| `"link"` | Foreign Key | → Link (src_fk), braucht `foreignKeyTarget` |
| `"metadata"` | DSS-Spalten | dss_record_source, dss_load_date, dss_run_id |
| `"ignore"` | Nicht übernehmen | rowguid, interne Spalten |

### Link-Spalten (foreignKeyTarget)
Bei `columnType: "link"` muss `foreignKeyTarget` gesetzt sein:
```json
{
  "name": "CustomerID",
  "columnType": "link",
  "foreignKeyTarget": "adworks.hub_kunde",
  "includeInHashDiff": false
}
```
Format: `<concept>.hub_<entity>`

### includeInHashDiff
- `true` — Spalte fließt in Hash Diff (Änderungserkennung)
- `false` — Business Keys, FKs und Metadata-Spalten

## `_staging__models.yml` Pflichtfelder

Jedes Staging-Modell **muss** einen `config.meta` Block haben:

```yaml
- name: ewb_fibu_fhe_main
  description: "Staging: FIBU.FHE.Main (Buchungsköpfe)"
  config:
    meta:
      entity_type: standard          # standard | dependent_child | multi_active
      source_type: external_table
      external_table: ext_ewb_fibu_fhe_main
      business_keys:
        - RECNUM
```

### Für Link-Entities (foreign_keys)
```yaml
config:
  meta:
    entity_type: standard
    source_type: external_table
    external_table: ext_adworks_verkauf
    business_keys:
      - SALESORDERID
    foreign_keys:
      - column: CUSTOMERID
        target_entity: kunde
        target_hub: hub_kunde
```

## Pflicht-Tests pro Modell

Jedes Staging-Modell in `_staging__models.yml` muss mindestens diese Tests haben:

```yaml
columns:
  - name: hk_<entity>
    tests:
      - not_null
      - unique
  - name: hd_<entity>
    tests:
      - not_null
  - name: <business_key>
    tests:
      - not_null
  - name: dss_record_source
    tests:
      - not_null
  - name: dss_load_date
    tests:
      - not_null
```

## Konsistenz mit Adworks-Referenz
Die Adworks-Modelle in `.vscode/entity-designer/adworks_*.json` dienen als Referenz-Pattern für das JSON-Format. Neue EWB-Entities müssen **exakt** dem gleichen Schema folgen.
