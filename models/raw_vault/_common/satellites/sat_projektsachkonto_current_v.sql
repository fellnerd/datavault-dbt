{#
    Current View: sat_projektsachkonto_current_v
    Satellite: sat_projektsachkonto
    Hub: hub_projektsachkonto
#}

{{ config(materialized='view') }}

{{ satellite_current_view(
    satellite_model='sat_projektsachkonto',
    hashkey_column='hk_projektsachkonto'
) }}
