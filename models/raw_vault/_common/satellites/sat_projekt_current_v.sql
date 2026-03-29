{#
    Current View: sat_projekt_current_v
    Satellite: sat_projekt
    Hub: hub_projekt
#}

{{ config(materialized='view') }}

{{ satellite_current_view(
    satellite_model='sat_projekt',
    hashkey_column='hk_projekt'
) }}
