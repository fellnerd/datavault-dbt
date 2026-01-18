/*
 * Hub: hub_country
 * Schema: vault
 * 
 * Hub für Länder aus ext_countries.
 * Business Key: object_id
 */

{{ config(
    materialized='incremental',
    unique_key='hk_country',
    as_columnstore=false
) }}

WITH source_data AS (
    SELECT 
        hk_country,
        object_id,
        dss_load_date,
        dss_record_source
    FROM {{ ref('stg_country') }}
    WHERE hk_country IS NOT NULL
),

{% if is_incremental() %}
existing_hubs AS (
    SELECT hk_country FROM {{ this }}
),
{% endif %}

new_records AS (
    SELECT DISTINCT
        src.hk_country,
        src.object_id,
        src.dss_load_date,
        src.dss_record_source
    FROM source_data src
    {% if is_incremental() %}
    WHERE NOT EXISTS (
        SELECT 1 FROM existing_hubs eh
        WHERE eh.hk_country = src.hk_country
    )
    {% endif %}
)

SELECT * FROM new_records
