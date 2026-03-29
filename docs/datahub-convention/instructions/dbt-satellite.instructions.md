---
applyTo: '**/satellites/**'
---
# Satellite Models – dbt Data Vault (Confluence ITDATAH §2.3)

> Diese Regeln gelten automatisch für alle Dateien unter `**/satellites/`.

## Zweck
Ein Satellit enthält **beschreibende Attribute** + deren Historie. Er ist immer an genau **einem Hub oder Link** angehängt.

## Standard Satellite – automate_dv.sat()

```sql
{%- set src_pk = 'hk_<entity>' -%}
{%- set src_hashdiff = {
    'source_column': 'hd_<entity>',
    'alias': 'HASHDIFF'
} -%}
{%- set src_payload = ['<ATTR_1>', '<ATTR_2>', ...] -%}
{%- set src_extra_columns = ['dss_create_datetime'] -%}
{%- set src_ldts = 'dss_load_date' -%}
{%- set src_source = 'dss_record_source' -%}

{{ automate_dv.sat(src_pk=src_pk,
                   src_hashdiff=src_hashdiff,
                   src_payload=src_payload,
                   src_extra_columns=src_extra_columns,
                   src_ldts=src_ldts,
                   src_source=src_source,
                   source_model='<concept>_<entity>') }}
```

## Satellite-Regeln (Confluence §2.3)

1. **Immer an genau einem Hub oder Link** angehängt
2. Pro Hash Key immer nur **ein zeitlich gültiger Satz** (im Raw Vault)
3. Ein Hub/Link kann **mehrere Satelliten** haben
4. **Insert-Only** – `dss_end_datetime` wird nur via View ermittelt
5. **Alle non-BK Attribute** in Satellite laden

## src_extra_columns (Pflicht)

Immer `['dss_create_datetime']` verwenden:

| Spalte | Beschreibung |
|--------|--------------|
| `dss_create_datetime` | GETDATE() – NICHT im HASHDIFF, nur als Extra-Spalte |

**WICHTIG:** `dss_create_datetime` darf NICHT im `src_payload` stehen (würde in HASHDIFF einfließen).

## Satellite-Typen (Confluence §2.3)

| Typ | Macro | Besonderheit |
|-----|-------|-------------|
| Standard Sat | `automate_dv.sat()` | Basis-Satellit, keine Logik |
| Business Sat | `automate_dv.sat()` | Gleiche Laderoutine + Soft Rules (Business Vault) |
| DC Sat | `automate_dv.sat()` | PK = Link HK, DC-Attribute NICHT NULL |
| MA Sat | `automate_dv.ma_sat()` | Mehrere gültige Records pro BK, `src_cdk` |
| Eff Sat | `automate_dv.eff_sat()` | Trackt Gültigkeit von Beziehungen |
| Status Tracking Sat | `automate_dv.sat()` | Trackt CDC (I/U/D), braucht Full Load aus Vorsystem |
| Record Tracking Sat | `automate_dv.sat()` | Trackt letzte Beladung pro BK, Ersatz für "last_seen_date" |
| Extended Record Tracking | `automate_dv.sat()` | Vollständiger Datenabzug je Beladung, für Zeitkorrektur (Late Arriving Data) |

### DC Satellite Pattern

```sql
{%- set src_pk = 'hk_link_<dc>_<parent>' -%}    {# References LINK, not Hub #}
{%- set src_hashdiff = {
    'source_column': 'hd_<dc>_<parent>_dc',
    'alias': 'HASHDIFF'
} -%}
{%- set src_payload = ['<dck_col>', '<attr>'] -%}  {# DCK Columns in payload #}
```

### MA Satellite Pattern

```sql
{%- set src_pk = 'hk_<entity>' -%}               {# References HUB #}
{%- set src_cdk = ['<distinguishing_key>'] -%}    {# Child Dependent Keys #}
{%- set src_hashdiff = {...} -%}

{{ automate_dv.ma_sat(src_pk=src_pk,
                      src_cdk=src_cdk,
                      src_hashdiff=src_hashdiff,
                      src_payload=src_payload,
                      src_ldts=src_ldts,
                      src_source=src_source,
                      source_model='...') }}
```

## Satellite-Trennung – 6 Kriterien (Confluence §5)

Wann separate Satelliten erstellen:

1. **Datenherkunft** – verschiedene Quellsysteme → verschiedene Satelliten
2. **Änderungshäufigkeit** – low (Stammdaten) vs. high (Transaktionsdaten)
3. **Fachliche Trennung** – inhaltlich zusammengehörige Attribute
4. **Sensible Daten** – GDPR/DSGVO → eigener Satellit (`sat_{entity}__{system}__gdpr`)
5. **>100 Spalten** → inhaltliche Trennung
6. **Technische Gründe** – Tabelle zu breit für effiziente Verarbeitung

## Naming (Confluence §5)

| Typ | Pattern | Beispiel |
|-----|---------|---------|
| Standard | `sat_{hub}__{system}` | `sat_catsco__sap_co` |
| DC | `sat_{hub}__{system}__dc` | `sat_mitarbeiter__sap_hcm__dc` |
| MA | `sat_{hub}__{system}__ma` | `sat_mitarbeiter__sap_hcm__ma` |
| Link Sat | `sat_link_{link}__{system}` | `sat_link_mitarbeiter_org__sap_hcm` |
| Eff Sat | `sat_{link}__{system}_eff` | `sat_link_mitarbeiter__sap_hcm_eff` |
| GDPR | `sat_{hub}__{system}__gdpr` | `sat_mitarbeiter__sap_hcm__gdpr` |

> **Projekt-Abweichung:** Für DC Satellites wird im Projekt auch das Pattern `sat_{dc}_{parent}_dc` verwendet (z.B. `sat_contact_contractor_dc`), wenn die Entität keinen eigenen Hub hat. Confluence-Standard ist `sat_{hub}__{system}__dc` mit doppeltem Underscore.

## Current View (Confluence §8)

Für jeden Satellite MUSS eine Current View erstellt werden:

```sql
-- sat_<entity>__<system>_current_v.sql
{{ config(materialized='view') }}
{{ satellite_current_view(
    satellite_ref=ref('sat_<entity>__<system>'),
    hashkey_column='hk_<entity>',
    hashdiff_column='HASHDIFF',
    ledts_column='dss_load_date'
) }}
```

Diese View berechnet `dss_end_datetime` und `dss_is_current` (Confluence §8: Insert-Only im Raw Vault, End-DateTime nur via View).

## Historisierung – 3 Zeitdimensionen (Confluence §8)

Data Vault erfasst bis zu 3 Zeitdimensionen:

| Dimension | Beschreibung | Erfassung |
|-----------|-------------|-----------|
| **1d – Fachliche Zeit** | Wann ist etwas fachlich gültig (aus Quellsystem) | Fachliche Gültigkeitsfelder im Payload |
| **2d – Technische Zeit Vorsystem** | Wann wurde der Record im Vorsystem angelegt/geändert | ERDAT, AEDAT etc. im Payload |
| **3d – Technische Zeit DWH** | Wann wurde der Record in den Datahub geladen | `dss_load_date` (= `dss_start_datetime`) |

**Im Raw Vault:** Nur `dss_start_datetime` wird gespeichert (= `dss_load_date`). `dss_end_datetime` wird **nicht** persistiert, nur via Current View ermittelt. **Keine Update-Operationen** im Raw Vault.

**Im DataHub/IMS:**
- **SCD1:** Überschreiben bei Änderungen (kein History)
- **SCD2:** Vollständige Historisierung mit Start/End Timestamps
- **Bitemporal:** Fachliche + technische Historisierung gleichzeitig

## Effectivity Satellite – Details (Confluence §2.3, §8)

Trackt die Gültigkeit von **Beziehungen** (Links):

```sql
{{ automate_dv.eff_sat(src_pk=src_pk,
                       src_dfk=src_dfk,
                       src_sfk=src_sfk,
                       src_start_date='start_date',
                       src_end_date='end_date',
                       src_eff=src_eff,
                       src_ldts=src_ldts,
                       src_source=src_source,
                       source_model='...') }}
```

**Regeln:**
- `dss_start_datetime`: Startzeitpunkt der Beziehung **aus Vorsystem**
- `dss_end_datetime`: Endzeitpunkt der Beziehung **aus Vorsystem**
- Nur als **Child von Link** (nicht direkt an Hub)
- Naming: `sat_{link}__{system}_eff`

## Ghost Records (Confluence §7)

Jeder Satellit enthält Ghost Records mit Default-Werten:

### Datentyp-Defaults

| Datentyp | Default |
|----------|---------|
| HK | `'-1'` |
| String | `'-1'` (falls Länge < 2: NULL) |
| Char | `'-1'` (falls Länge < 2: NULL) |
| Date | `1753-01-01` |
| DateTime | `1753-01-01T00:00:00.000000` |
| Time | `00:00:00.000000` |
| Integer | `-1` |
| Bit | `0` |
| nvarchar(1) + DC Attribut | `'#'` |

### Ghost Record dss_* Attribute

| Attribut | Wert |
|----------|------|
| `dss_tenant_key` | `'default'` |
| `dss_business_key_ccode` | `'default'` |
| `dss_business_key` | `'default\|\|default\|\|unknown'` |
| `dss_record_source` | `'ghost_record'` |
| `dss_start_datetime` | `'1753-01-01 00:00:00.000'` |
| `dss_deleted` | `'N'` |
| `dss_load_comment` | `NULL` |

### Edge Cases
- String-Spalten mit max. Länge < 2 Zeichen: Default = **NULL** (statt `'-1'`)
- `nvarchar(1)` Dependent-Child-Attribute: Default = **`'#'`**
- Ghost Records werden **nicht** aus dem Vault übernommen, im DataHub/IMS **neu erzeugt**

## Aufbau

```
hk_{hub/link}        CHAR(64)       - FK zum Hub/Link
HASHDIFF             CHAR(64)       - Change Hash (hd_<entity>)
[payload columns]                    - Alle beschreibenden Attribute
dss_create_datetime  DATETIME2(7)   - Erstellungs-Timestamp (Extra-Spalte)
dss_load_date        DATETIME2(7)   - = dss_start_datetime
dss_record_source    NVARCHAR(255)  - Quellenidentifikation
```
