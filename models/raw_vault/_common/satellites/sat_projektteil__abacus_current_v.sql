{#
    Current View: sat_projektteil__abacus_current_v
    Satellite: sat_projektteil__abacus
    Hub: hub_projektteil

    Canonical access layer for sat_projektteil__abacus.
    Provides dss_is_current and dss_end_date for downstream consumers.
    SCD1: WHERE dss_is_current = 'Y'
    SCD2: No filter (full history with start/end timestamps)

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2026-03-30 V1.0 Initialversion
#}

{{ config(materialized='view') }}

{{ satellite_current_view(
    satellite_model='sat_projektteil__abacus',
    hashkey_column='hk_projektteil'
) }}
