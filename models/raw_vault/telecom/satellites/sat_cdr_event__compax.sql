{#
    Transaction Satellite: sat_cdr_event__compax
    Parent Link: link_cdr_event_tl (Transaction Link)
    Source: rsn_mobile_cdr_main

    Payload (CDR-Event Felder):
      Zeitstempel:   signaling_start, connection_start
      Dauer:         duration
      Teilnehmer:    a (A-Rufnummer), b (B-Rufnummer), pai, imsi, iccid
      Klassifizierung: record_type, service_type, call_type
      Datenvolumen:  bytes_in, bytes_out
      Kosten:        price, ws_price, tarif
      Roaming:       r_mcc_mnc (Roaming MCC/MNC)
      Qualität:      result_code, result_status
      Datenschutz:   privacy
      Protokoll:     tap3, data_packet
      Ursprung:      id (CDR-ID aus Quellsystem)

    Transaction Satellite Pattern:
    - KEIN hashdiff (jeder Record ist eine einzigartige Transaktion)
    - KEINE post_hooks (keine SCD2-Historisierung)
    - KEINE dss_is_current / dss_end_date Spalten
    - src_eff = dss_load_date (Effectivity = Load-Zeitpunkt)
    - Jeder CDR-Record wird genau einmal geladen, nie überschrieben

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2025-05-03 V1.0 Initialversion — EWB CDR-Projekt (RSN Mobile / Compax)
#}

{{ config(
    materialized='incremental',
    as_columnstore=false
) }}

{%- set yaml_metadata -%}
source_model: "rsn_mobile_cdr_main"
src_pk: "hk_link_cdr_event_tl"
src_hashdiff: "hk_link_cdr_event_tl"
src_payload:
    - "id"
    - "signaling_start"
    - "connection_start"
    - "duration"
    - "a"
    - "b"
    - "pai"
    - "imsi"
    - "iccid"
    - "record_type"
    - "service_type"
    - "call_type"
    - "bytes_in"
    - "bytes_out"
    - "price"
    - "ws_price"
    - "tarif"
    - "r_mcc_mnc"
    - "result_code"
    - "result_status"
    - "privacy"
    - "tap3"
    - "data_packet"
src_eff: "dss_load_date"
src_ldts: "dss_load_date"
src_source: "dss_record_source"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.sat(
    src_pk=metadata_dict["src_pk"],
    src_hashdiff=metadata_dict["src_hashdiff"],
    src_payload=metadata_dict["src_payload"],
    src_eff=metadata_dict["src_eff"],
    src_ldts=metadata_dict["src_ldts"],
    src_source=metadata_dict["src_source"],
    source_model=metadata_dict["source_model"]
) }}
