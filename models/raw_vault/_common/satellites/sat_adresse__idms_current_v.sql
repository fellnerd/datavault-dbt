{#
    Current View: sat_adresse__idms_current_v
    Satellite: sat_adresse__idms
    Hub: hub_adresse

    Canonical access layer for sat_adresse__idms.
    SCD1: WHERE dss_is_current = 'Y'
    SCD2: No filter (full history)
#}

{{ config(materialized='view') }}

{{ satellite_current_view(
    satellite_model='sat_adresse__idms',
    hashkey_column='hk_adresse'
) }}
