{#
    Current View: sat_adresse_kontakt_current_v
    Satellite: sat_adresse_kontakt
    Hub: hub_adresse
#}

{{ config(materialized='view') }}

{{ satellite_current_view(
    satellite_model='sat_adresse_kontakt',
    hashkey_column='hk_adresse'
) }}
