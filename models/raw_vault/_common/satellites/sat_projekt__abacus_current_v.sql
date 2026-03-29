{#
    Current View: sat_projekt_current_v
    Satellite: sat_projekt__abacus
    Hub: hub_projekt
#}

{{ config(materialized='view') }}

{{ satellite_current_view(
    satellite_model='sat_projekt__abacus',
    hashkey_column='hk_projekt'
) }}
