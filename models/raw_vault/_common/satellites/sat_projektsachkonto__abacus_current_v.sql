{#
    Current View: sat_projektsachkonto_current_v
    Satellite: sat_projekt__abacussachkonto__abacus
    Hub: hub_projektsachkonto
#}

{{ config(materialized='view') }}

{{ satellite_current_view(
    satellite_model='sat_projektsachkonto__abacus',
    hashkey_column='hk_projektsachkonto'
) }}
