/*
 * Hub: hub_project
 * Source: stg_project
 * Business Keys: object_id
 */

{{ config(
    materialized='incremental',
    unique_key='hk_project',
    as_columnstore=false
) }}

WITH source_data AS (
    SELECT 
        hk_project,
        object_id,
        dss_load_date,
        dss_record_source
    FROM {{ ref('stg_project') }}
    WHERE hk_project IS NOT NULL
),

{% if is_incremental() %}
existing_hubs AS (
    SELECT hk_project FROM {{ this }}
),
{% endif %}

new_records AS (
    SELECT DISTINCT
        src.hk_project,
        src.object_id,
        src.dss_load_date,
        src.dss_record_source
    FROM source_data src
    {% if is_incremental() %}
    WHERE NOT EXISTS (
        SELECT 1 FROM existing_hubs eh
        WHERE eh.hk_project = src.hk_project
    )
    {% endif %}
)

SELECT * FROM new_records
