{#
    Current View: sat_person_current_v
    Satellite: sat_person
    Hub: hub_person

    Canonical access layer for sat_person.
    Provides dss_is_current and dss_end_date for downstream consumers.
    SCD1: WHERE dss_is_current = 'Y'
    SCD2: No filter (full history with start/end timestamps)
#}

{{ config(materialized='view') }}

{{ satellite_current_view(
    satellite_model='sat_person',
    hashkey_column='hk_person'
) }}
