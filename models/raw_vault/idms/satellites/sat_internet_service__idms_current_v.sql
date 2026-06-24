{# Current View: sat_internet_service__idms_current_v
   Satellite: sat_internet_service__idms
#}

{{ config(materialized='view') }}

{{ satellite_current_view(
    satellite_model='sat_internet_service__idms',
    hashkey_column=''
) }}
