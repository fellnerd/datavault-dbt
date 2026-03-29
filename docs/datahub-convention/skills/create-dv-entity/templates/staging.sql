/*
 * Staging View: <concept>_<entity>
 *
 * Confluence-Schicht: STAGE.stage (Hash-Berechnung, Vorbereitung für Vault)
 * Source: LOAD.external_load_source.<concept>_<entity>
 * Entity: <ENTITY_DESCRIPTION>
 * Business Key: <BK1> + <BK2> (alphabetisch sortiert)
 *
 * Verwendet automate_dv.stage() Macro für:
 *   - hk_<entity>     → Hub Hash Key (SHA2_256 über <BK1> || <BK2>)
 *   - hd_<entity>     → Hash Diff für Satellite Change Detection
 *   - dss_*           → Technische Metadaten (Confluence §6)
 *
 * Confluence Hashing-Regeln (ITDATAH §4):
 *   - Algorithmus: SHA2_256 → CHAR(64) via hash_override.sql
 *   - Separator: '||' (doppelte Pipe)
 *   - NULL → '-1' (via hash_override.sql ISNULL)
 *   - LTRIM + RTRIM auf alle Spalten (via hash_override.sql)
 *   - BK alphabetisch sortiert: <BK1>, <BK2>
 *
 * Technische dss_* Attribute (Confluence §6):
 *   - dss_record_source: {source_name}.{db}.{schema}.{table}
 *   - dss_load_date:     GETDATE() (= dss_load_datetime / dss_start_datetime)
 *   - dss_create_datetime: GETDATE() (Timestamp Erstellung in Zieltabelle)
 *   - dss_business_key:  default||default||<BK1>||<BK2> (Confluence §3)
 */

{%- set yaml_metadata -%}
source_model:
  <source_alias>: <concept>_<entity>
derived_columns:
  dss_record_source: "!<system>.<db>.<schema>.<table>"
  dss_load_date: "GETDATE()"
  dss_create_datetime: "GETDATE()"
  dss_business_key: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(<BK1>)), '-1'), ISNULL(LTRIM(RTRIM(<BK2>)), '-1'))"
hashed_columns:
  hk_<entity>:
    - <BK1>
    - <BK2>
  hd_<entity>:
    is_hashdiff: true
    columns:
      - <ATTR_1>
      - <ATTR_2>
{%- endset -%}

{%- set metadata_dict = fromyaml(yaml_metadata) -%}

{{ automate_dv.stage(include_source_columns=true,
                     source_model=metadata_dict['source_model'],
                     derived_columns=metadata_dict['derived_columns'],
                     hashed_columns=metadata_dict['hashed_columns']) }}
