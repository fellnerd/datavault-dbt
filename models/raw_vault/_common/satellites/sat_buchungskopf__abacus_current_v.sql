{#
    Current View: sat_buchungskopf__abacus_current_v
    Satellite: sat_buchungskopf__abacus
    Hub: hub_buchungskopf

    Canonical access layer for sat_buchungskopf__abacus.
    Provides dss_is_current and dss_end_date for downstream consumers.
    SCD1: WHERE dss_is_current = 'Y'
    SCD2: No filter (full history with start/end timestamps)

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2026-03-29 V1.0 Initialversion
#}

{{ config(materialized='view') }}

{{ satellite_current_view(
    satellite_model='sat_buchungskopf__abacus',
    hashkey_column='hk_buchungskopf'
) }}
