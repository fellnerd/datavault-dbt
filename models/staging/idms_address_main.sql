/*
 * Staging Model: idms_address_main
 *
 * Source: ext_idms_address_main (IDMS Address Main.parquet)
 * Business Key: id (aliased as inr für Cross-Source Integration mit hub_adresse)
 * Hash Key: hk_adresse  ← gemeinsamer Hub mit ewb_publ_adr_main (Abacus)
 * Payload: 21 Spalten — Adress- und Personendaten (firma, nachname, vorname, strasse, etc.)
 *
 * Hinweis: ts und timestamp_landing-zone werden nicht in den Hashdiff aufgenommen
 * (Systemzeitstempel, keine fachlichen Attribute).
 *
 * Cross-Source: id wird als 'inr' aliasiert damit hub_adresse beide Quellen
 * (Abacus INR + IDMS id) über denselben src_nk='inr' verarbeiten kann.
 *
 * Uses automate_dv.stage() macro for standardized staging.
 */

{%- set yaml_metadata -%}
source_model:
  staging: "ext_idms_address_main"

derived_columns:
  dss_record_source: "!ewb_idms"
  dss_load_date: "COALESCE(TRY_CAST([timestamp_landing-zone] AS DATETIME2), GETDATE())"
  dss_create_datetime: "GETDATE()"
  inr: "CAST(id AS NVARCHAR(MAX))"
  dss_business_key: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(id AS NVARCHAR(MAX)))), '-1'))"
  _escape:
    source_column:
      - "ts"
      - "timestamp_landing-zone"
    escape: true

hashed_columns:
  hk_adresse: "inr"
  hd_adresse__idms:
    is_hashdiff: true
    columns:
      - "anrede"
      - "cust_id"
      - "egid"
      - "emailaddr"
      - "fax"
      - "firma"
      - "flags"
      - "free_field"
      - "mandate_id"
      - "nachname"
      - "plzort"
      - "postfach"
      - "ref"
      - "status"
      - "strasse"
      - "strasse_nr"
      - "tel"
      - "telg"
      - "telm"
      - "vorname"
      - "zusatz"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.stage(include_source_columns=true,
                     source_model=metadata_dict['source_model'],
                     derived_columns=metadata_dict['derived_columns'],
                     hashed_columns=metadata_dict['hashed_columns']) }}
