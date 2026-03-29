{#
    Current View: sat_person_adresse_current_v
    Satellite: sat_person_adresse
    Hub: hub_adresse
#}

{{ config(materialized='view') }}

{{ satellite_current_view(
    satellite_model='sat_person_adresse',
    hashkey_column='hk_adresse'
) }}
