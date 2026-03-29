# Data Vault Compliance Audit Checklist

## A. Hashing (Confluence §4) – CRITICAL

| # | Check | Status |
|---|-------|--------|
| A1 | SHA2_256 Algorithmus verwendet | ☐ |
| A2 | Output: CHAR(64) | ☐ |
| A3 | CONVERT (nicht CAST) in hash_override.sql | ☐ |
| A4 | Separator: `\|\|` (doppelte Pipe) | ☐ |
| A5 | NULL-Behandlung: '-1' (null_placeholder_string) | ☐ |
| A6 | LTRIM + RTRIM auf alle Hash-Spalten | ☐ |
| A7 | BK-Spalten alphabetisch sortiert in hk_* | ☐ |
| A8 | BK-Spalten alphabetisch sortiert in dss_business_key | ☐ |
| A9 | Keine technischen VS-Attribute im hd (Change Hash) | ☐ |
| A10 | hd kein Delta-Kriterium bei Delta Load | ☐ |

## B. Naming (Confluence §5) – HIGH

| # | Check | Status |
|---|-------|--------|
| B1 | Unterstriche als Separator | ☐ |
| B2 | Kleinbuchstaben | ☐ |
| B3 | Singular (nicht Plural) | ☐ |
| B4 | Hub: `hub_{concept}` | ☐ |
| B5 | Satellite: `sat_{hub}__{system}` (doppelter Unterstrich) | ☐ |
| B6 | Link: `link_{hub1}_{hub2}` | ☐ |
| B7 | Hash Key: `hk_{entity}` | ☐ |
| B8 | Hash Diff: `hd_{entity}` | ☐ |
| B9 | Metadata: `dss_*` Prefix | ☐ |
| B10 | Current View: `*_current_v` Suffix | ☐ |

## C. Technische Attribute (Confluence §6) – HIGH

### Hub
| # | Attribut | Typ | Status |
|---|----------|-----|--------|
| C1 | `hk_{entity}` | CHAR(64) | ☐ |
| C2 | Business Key Spalten | NVARCHAR | ☐ |
| C3 | `dss_business_key` | NVARCHAR(255) | ☐ |
| C4 | `dss_create_datetime` | DATETIME2(7) | ☐ |
| C5 | `dss_load_date` | DATETIME2(7) | ☐ |
| C6 | `dss_record_source` | NVARCHAR(255) | ☐ |

### Satellite
| # | Attribut | Typ | Status |
|---|----------|-----|--------|
| C7 | `hk_{entity}` (FK) | CHAR(64) | ☐ |
| C8 | `HASHDIFF` | CHAR(64) | ☐ |
| C9 | Payload columns | diverse | ☐ |
| C10 | `dss_create_datetime` | DATETIME2(7) | ☐ |
| C11 | `dss_load_date` | DATETIME2(7) | ☐ |
| C12 | `dss_record_source` | NVARCHAR(255) | ☐ |

### Link
| # | Attribut | Typ | Status |
|---|----------|-----|--------|
| C13 | `hk_link_{hub1}_{hub2}` | CHAR(64) | ☐ |
| C14 | FK Hash Keys (alle Hubs) | CHAR(64) | ☐ |
| C15 | `dss_load_date` | DATETIME2(7) | ☐ |
| C16 | `dss_record_source` | NVARCHAR(255) | ☐ |

## D. Business Key (Confluence §3) – HIGH

| # | Check | Status |
|---|-------|--------|
| D1 | Format: `default\|\|default\|\|BK1\|\|...BKn` | ☐ |
| D2 | BK alphabetisch sortiert | ☐ |
| D3 | NULL → '-1' | ☐ |
| D4 | LTRIM + RTRIM | ☐ |
| D5 | Sonderzeichen entfernt (Tab, LF, FF, CR) | ☐ |
| D6 | `\|\|` in Quelldaten escaped | ☐ |

## E. Struktur (Confluence §2) – MEDIUM

| # | Check | Status |
|---|-------|--------|
| E1 | Jeder Hub hat min. 1 Satellite | ☐ |
| E2 | Jeder Satellite hängt an genau 1 Hub/Link | ☐ |
| E3 | Jeder Link verbindet min. 2 Hubs (außer DC) | ☐ |
| E4 | Kein Link-on-Link | ☐ |
| E5 | Current View für jeden Satellite vorhanden | ☐ |
| E6 | Satellite-Trennung nach Confluence-Kriterien | ☐ |

## F. Ghost Records (Confluence §7) – MEDIUM

| # | Check | Status |
|---|-------|--------|
| F1 | Jeder Hub hat 1 Zero Key (HK = '-1') | ☐ |
| F2 | Jeder Satellite hat 1 Ghost Record | ☐ |
| F3 | Ghost: dss_record_source = 'ghost_record' | ☐ |
| F4 | Ghost: String → '-1' (falls Länge ≥ 2, sonst NULL) | ☐ |
| F5 | Ghost: Date → 1753-01-01 | ☐ |
| F6 | Ghost: Integer → -1 | ☐ |
| F7 | Ghost: dss_tenant_key = 'default' | ☐ |
| F8 | Ghost: dss_business_key_ccode = 'default' | ☐ |
| F9 | Ghost: dss_business_key = 'default\|\|default\|\|unknown' | ☐ |
| F10 | Ghost: dss_start_datetime = '1753-01-01 00:00:00.000' | ☐ |
| F11 | Ghost: dss_deleted = 'N' | ☐ |
| F12 | Ghost: dss_load_comment = NULL | ☐ |
| F13 | Ghost: nvarchar(1) DC-Attribut = '#' | ☐ |
| F14 | Ghost: Bit → 0 | ☐ |

## G. Dokumentation – LOW

| # | Check | Status |
|---|-------|--------|
| G1 | Schema YAML für jedes Model | ☐ |
| G2 | Tests: not_null + unique auf HK | ☐ |
| G3 | Tests: relationships Sat→Hub | ☐ |
| G4 | ER-Diagramm aktuell | ☐ |
| G5 | Kommentar-Header vollständig | ☐ |
| G6 | dbt_project.yml Schema-Mapping korrekt | ☐ |
