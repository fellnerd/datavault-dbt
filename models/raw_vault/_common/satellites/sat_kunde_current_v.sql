{#
    Current View: sat_kunde_current_v
    Satellite: sat_kunde__compax
    Hub: hub_kunde

    Canonical access layer für sat_kunde__compax.
    Stellt dss_is_current und dss_end_date für Downstream-Konsumenten bereit.
    SCD1: WHERE dss_is_current = 'Y'
    SCD2: Kein Filter (vollständige Historie mit Start/End-Timestamps)
#}

{{ config(materialized='view') }}

{{ satellite_current_view(
    satellite_model='sat_kunde__compax',
    hashkey_column='hk_kunde'
) }}
