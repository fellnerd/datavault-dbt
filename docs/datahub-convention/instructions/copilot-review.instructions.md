---
applyTo: '**'
---
# Copilot Code Review – Data Vault 2.0 Prüfregeln

> Diese Datei wird von GitHub Copilot Code Review als Kontext verwendet.
> Copilot prüft PRs automatisch gegen diese Regeln.

## Prüfpunkte für Pull Requests

### 1. Hub-Modelle
- [ ] Business Keys alphabetisch sortiert
- [ ] Hash Key: `hk_<entity>` als CHAR(64), SHA2_256
- [ ] `dss_business_key` als extra column vorhanden (Format: `default||default||BK1||...||BKn`)
- [ ] `dss_record_source` korrekt (Format: `{source}.{db}.{schema}.{table}`)
- [ ] `dss_create_datetime` vorhanden
- [ ] Naming: `hub_<business_concept>` (Singular, Kleinbuchstaben)
- [ ] Hub ist in Schema `vault_<concept>` oder `vault` (_common)

### 2. Satellite-Modelle
- [ ] Hashdiff: `hd_<entity>` (CHAR(64), SHA2_256)
- [ ] Referenziert genau einen Hub oder Link via `hk_*`
- [ ] `dss_create_datetime` als extra column
- [ ] Naming: `sat_<hub>__<system>` (doppelter Underscore vor System)
- [ ] DC Satellite: Naming `sat_<entity>__<system>__dc`, hängt an Link
- [ ] MA Satellite: Naming `sat_<entity>__<system>__ma`, verwendet `automate_dv.ma_sat()`
- [ ] Keine technischen Vorsystem-Attribute im Hashdiff (z.B. UNAME, Änderungstimestamp)
- [ ] Bei Delta Load: Delta-Kriterium NICHT im Hashdiff

### 3. Link-Modelle
- [ ] Verbindet mindestens 2 Hubs (keine peg-leg links)
- [ ] Hash Key: `hk_link_<hub1>_<hub2>`
- [ ] Alle Hub-FKs als `hk_<hub>` vorhanden
- [ ] Naming: `link_<hub1>_<hub2>` (Singular)
- [ ] Keine Link-on-Link Strukturen

### 4. Staging Views
- [ ] Alle Hashes im Staging berechnet (automate_dv Best Practice)
- [ ] NULL → `'-1'` (null_placeholder_string)
- [ ] LTRIM + RTRIM auf alle Hash-Spalten
- [ ] Hash-Separator: `||` (doppelte Pipe)
- [ ] `dss_load_date`, `dss_record_source`, `dss_business_key`, `dss_create_datetime` vorhanden
- [ ] Referenziert `source()` oder PSA-Modell

### 5. Schema YAML
- [ ] Jedes Model in `_<concept>__models.yml` dokumentiert
- [ ] `not_null` Test auf Hash Keys, `dss_load_date`, `dss_record_source`
- [ ] `unique` Test auf Hash Key (Hub/Link)
- [ ] `relationships` Test für Satellite → Hub/Link Referential Integrity
- [ ] `data_type` bei allen Spalten angegeben

### 6. ER-Diagramm
- [ ] Diagramm unter `design/raw-vault/<concept>/er-diagram.mmd` aktualisiert
- [ ] Theme: `base`, Dateiendung `.mmd`

### 7. Allgemeine Regeln
- [ ] Keine hardcodierten Datenbank-Namen (immer `{{ target.database }}`)
- [ ] `as_columnstore: false` bei incremental Models
- [ ] Incremental Strategy: `append`
- [ ] Keine `dbt run` oder schreibende Befehle ohne explizite Zustimmung
