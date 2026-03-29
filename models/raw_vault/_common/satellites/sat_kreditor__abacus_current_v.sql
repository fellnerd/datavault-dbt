{#
    Current View: sat_kreditor__abacus_current_v
    Satellite: sat_kreditor__abacus
    Hub: hub_kreditor (Ghost Hub)

    Canonical access layer for sat_kreditor__abacus.
    Provides dss_is_current and dss_end_date for downstream consumers.
    SCD1: WHERE dss_is_current = 'Y'
    SCD2: No filter (full history with start/end timestamps)
#}

{{ config(materialized='view') }}

{{ satellite_current_view(
    satellite_model='sat_kreditor__abacus',
    hashkey_column='hk_kreditor'
) }}
