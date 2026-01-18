/*
 * Hub: hub_invoice
 * Source: stg_invoice
 * Business Keys: object_id
 */

{{ config(
    materialized='incremental',
    unique_key='hk_invoice',
    as_columnstore=false
) }}

WITH source_data AS (
    SELECT 
        hk_invoice,
        object_id,
        dss_load_date,
        dss_record_source
    FROM {{ ref('stg_invoice') }}
    WHERE hk_invoice IS NOT NULL
),

{% if is_incremental() %}
existing_hubs AS (
    SELECT hk_invoice FROM {{ this }}
),
{% endif %}

new_records AS (
    SELECT DISTINCT
        src.hk_invoice,
        src.object_id,
        src.dss_load_date,
        src.dss_record_source
    FROM source_data src
    {% if is_incremental() %}
    WHERE NOT EXISTS (
        SELECT 1 FROM existing_hubs eh
        WHERE eh.hk_invoice = src.hk_invoice
    )
    {% endif %}
)

SELECT * FROM new_records
