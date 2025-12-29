/*
 * Hub: hub_product
 * Schema: vault
 * 
 * Speichert eindeutige Business Keys für product.
 * Insert-Only: Neue Einträge werden hinzugefügt, nie gelöscht.
 */

{{ config(
    materialized='incremental',
    unique_key='hk_product',
    as_columnstore=false
) }}

WITH source_data AS (
    SELECT 
        hk_product,
        object_id,
        dss_load_date,
        dss_record_source
    FROM {{ ref('stg_product') }}
    WHERE hk_product IS NOT NULL
),

{% if is_incremental() %}
existing_hubs AS (
    SELECT hk_product FROM {{ this }}
),
{% endif %}

new_records AS (
    SELECT DISTINCT
        src.hk_product,
        src.object_id,
        src.dss_load_date,
        src.dss_record_source
    FROM source_data src
    {% if is_incremental() %}
    WHERE NOT EXISTS (
        SELECT 1 FROM existing_hubs eh
        WHERE eh.hk_product = src.hk_product
    )
    {% endif %}
)

SELECT * FROM new_records
