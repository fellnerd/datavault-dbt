# Wherescape → dbt Migration Checkliste

## Pro Objekt

### 1. Analyse (sqlbi01)
- [ ] Objekt in Produktions-Datahub gefunden
- [ ] Typ identifiziert (Hub/Sat/Link/Dim/Fakt/View/BV)
- [ ] Schema dokumentiert (alle Spalten + Typen)
- [ ] Abhängigkeiten ermittelt (UP: Sources, DOWN: Consumers)
- [ ] Custom Function Code extrahiert (falls vorhanden)
- [ ] Beladungstyp ermittelt (Full/Delta/Full-Delta)
- [ ] Extended Properties dokumentiert

### 2. Staging
- [ ] Source in `sources.yml` definiert (External Table oder Load-Referenz)
- [ ] Staging View erstellt (`models/staging/<concept>_<entity>.sql`)
- [ ] Hash Keys berechnet (SHA2_256, CONVERT, NULL→'-1', LTRIM/RTRIM)
- [ ] Business Key alphabetisch sortiert
- [ ] dss_business_key berechnet (`CONCAT_WS('||', 'default', 'default', BK1, ..., BKn)`)
- [ ] dss_record_source gesetzt (NVARCHAR(255))
- [ ] dss_load_date gesetzt
- [ ] dss_create_datetime gesetzt (GETDATE())

### 3. Raw Vault
- [ ] Hub erstellt (`automate_dv.hub()` + `src_extra_columns`)
- [ ] Satellite(n) erstellt (`automate_dv.sat()` + `src_extra_columns`)
- [ ] Link(s) erstellt (falls Beziehungen vorhanden)
- [ ] Current View(s) erstellt (`satellite_current_view()`)
- [ ] Materialisierung: incremental + append + as_columnstore=false

### 4. Business Vault (falls Custom Function)
- [ ] Custom Function SQL → dbt Model übersetzt
- [ ] dss_* Attribute korrekt befüllt
- [ ] WS-spezifische Syntax entfernt
- [ ] Abhängigkeiten via `{{ ref('...') }}`

### 5. Mart (falls Dimension/Fakt)
- [ ] Dimension: PIT-basiert, dim_*_key/id/code/name Pflichtfelder
- [ ] Fakt: Bridge-basiert, dim_*_key FK-Spalten
- [ ] Ghost Records berücksichtigt (UNKNOWN, -1)
- [ ] SCD-Typ korrekt (SCD1=View, SCD2=Incremental)

### 6. Dokumentation
- [ ] Schema YAML (`_<concept>__models.yml`)
- [ ] Tests (not_null, unique, referential integrity)
- [ ] ER-Diagramm (`design/raw-vault/<concept>/er-diagram.mmd`)

### 7. Confluence Sync
- [ ] System Dokumentation aktualisiert (Seite 353075657)
- [ ] Benutzer Dokumentation aktualisiert (Seite 352845985)
- [ ] Konzepte aktualisiert falls Architekturänderung (Seite 353075845)

### 8. Validierung
- [ ] `dbt compile --select <model>` erfolgreich
- [ ] Compiled SQL geprüft (CONVERT, nicht CAST)
- [ ] Datenvergleich WS vs. dbt (Record Count, Stichproben)

---

## Pro Information Mart

- [ ] Alle Vault-Objekte des Marts identifiziert (sqlbi01)
- [ ] Abhängigkeitsreihenfolge bestimmt (Hubs → Links → Sats → BV → Dims → Fakts)
- [ ] Alle Objekte einzeln migriert (Checkliste oben)
- [ ] Business Vault Custom Functions übersetzt
- [ ] Dimensionen + Faktentabellen erstellt
- [ ] Views erstellt
- [ ] Security migriert (sec_user_privilege)
- [ ] End-to-End Test: Daten stimmen überein
- [ ] Confluence System-Doku vollständig
- [ ] Confluence Benutzer-Doku vollständig
- [ ] Scheduling konfiguriert (CI/CD Pipeline)

## WS Attribute Type → dbt Quick Reference

| WS Attribute Type | dbt Ziel | Hash/Config |
|-------------------|----------|-------------|
| Business key | Hub BK-Spalte | In `src_pk` Hash + `dss_business_key` |
| Satellite low volatility | Sat Payload | In `src_hashdiff` |
| Satellite high volatility | Separater Sat | In eigenem `src_hashdiff` |
| Dependent child satellite key | DC Link Hash + Sat Payload | In `hk_link_*` + `src_payload` |
| Dependent child satellite attribute | DC Sat Payload | In `src_payload` |
| Satellite multi-active key | MA Sat CDK | In `src_cdk` |
| Satellite multi-active attribute | MA Sat Payload | In `src_payload` |
| Link business key | Link FK | In `src_fk` + eigener Hash |
| Link dependent child | Link DCK | In `hk_link_*` Hash |
| Reference key | Ref Hub BK | Eigener Hub |
| Reference attribute | Ref Sat Payload | Eigener Satellite |
| dss_tenant_key | 'default' | Single-Tenant PoC |
| ignore_change_hash | Nicht in `src_hashdiff` | Aus Hashdiff ausschließen |
| casesensitive | BK + SHA256 Substring | Confluence §3 |

## WS Custom Function dss_* → dbt Mapping

| WS Custom Func Spalte | dbt Äquivalent | Pflicht in |
|-----------------------|----------------|------------|
| `hk_<hub>` | Aus Source/Sat JOIN | BV Sat |
| `hk_<link>` | Aus Source/Sat JOIN | BV Link-Sat |
| `dss_tenant_key` | `'default'` | Dim, Fakt, BV, DS |
| `dss_business_key_ccode` | `'default'` | Dim, DS |
| `dss_business_key` | `CONCAT_WS(...)` | Dim, DS |
| `dss_load_datetime` | `GREATEST(sat1, sat2, ...)` | Dim, Fakt, BV, DS |
| `dss_record_source` | `'business_vault.<obj>'` | Alle |
| `dss_sec_value_key` | `'-1'` (kein RLS) | Dim, Fakt, DS |
| `dss_deleted` | SCD2: Custom Logik | Dim (SCD2) |
| `par_dh_batch_load_date` | Nicht nötig (dbt is_incremental) | — |
