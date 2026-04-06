{#
    Current View: sat_person_adresse_current_v
    Satellite: sat_person__abacus_adresse__abacus
    Hub: hub_adresse
#}

{{ config(materialized='view') }}

{{ satellite_current_view(
    satellite_model='sat_person_adresse__abacus',
    hashkey_column='hk_adresse'
) }}
