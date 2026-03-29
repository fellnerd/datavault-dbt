/*
 * Satellit: sat_<entity>__<system>
 *
 * Confluence-Schicht: VAULT.raw (Raw Vault - Insert-Only)
 * Schema: vault_<concept>
 * Parent Hub: hub_<entity>
 * Quellsystem: <system>
 *
 * Confluence Satellite-Regeln (ITDATAH §2.3):
 *   - Enthält beschreibende Attribute + deren Historie
 *   - Immer an genau einem Hub angehängt
 *   - Pro Hash Key immer nur ein zeitlich gültiger Satz
 *   - Insert-Only: Kein dss_end_datetime im Raw Vault
 *   - dss_end_datetime wird nur via View ermittelt (nicht persistiert)
 *
 * Naming-Regel (Confluence §5):
 *   sat_{hub}__{partner/system} → sat_<entity>__<system>
 *
 * Aufbau:
 *   hk_<entity>         CHAR(64)       - FK zum Hub (Hash Key)
 *   HASHDIFF             CHAR(64)       - Hash Diff (hd_<entity>)
 *   [payload columns]                   - Alle Nicht-BK Attribute
 *   dss_create_datetime  DATETIME2(7)   - Timestamp Erstellung (Extra-Spalte)
 *   dss_load_date        DATETIME2(7)   - dss_start_datetime (= dss_load_datetime)
 *   dss_record_source    VARCHAR(255)   - Quellenidentifikation
 *
 * Beladung: automate_dv.sat() → Insert-Only, Change Detection via Hash Diff
 */

{%- set src_pk = 'hk_<entity>' -%}
{%- set src_hashdiff = {
    'source_column': 'hd_<entity>',
    'alias': 'HASHDIFF'
} -%}
{%- set src_payload = [
    '<ATTR_1>',
    '<ATTR_2>'
] -%}
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
