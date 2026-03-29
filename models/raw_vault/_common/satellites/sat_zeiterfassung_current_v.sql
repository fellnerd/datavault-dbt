{#
    Current View: sat_zeiterfassung_current_v
    Satellite: sat_zeiterfassung
    Hub: hub_zeiterfassung
#}

{{ config(materialized='view') }}

{{ satellite_current_view(
    satellite_model='sat_zeiterfassung',
    hashkey_column='hk_zeiterfassung'
) }}
