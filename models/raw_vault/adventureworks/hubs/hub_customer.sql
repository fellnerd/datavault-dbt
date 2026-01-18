/*
 * Hub: hub_customer
 * Source: stg_aw_customer
 * Business Keys: CustomerID
 */

{{ config(
    materialized='incremental',
    unique_key='hk_customer',
    as_columnstore=false
) }}

WITH source_data AS (
    SELECT 
        hk_customer,
        CustomerID,
        dss_load_date,
        dss_record_source
    FROM {{ ref('stg_aw_customer') }}
    WHERE hk_customer IS NOT NULL
),

{% if is_incremental() %}
existing_hubs AS (
    SELECT hk_customer FROM {{ this }}
),
{% endif %}

new_records AS (
    SELECT DISTINCT
        src.hk_customer,
        src.CustomerID,
        src.dss_load_date,
        src.dss_record_source
    FROM source_data src
    {% if is_incremental() %}
    WHERE NOT EXISTS (
        SELECT 1 FROM existing_hubs eh
        WHERE eh.hk_customer = src.hk_customer
    )
    {% endif %}
)

SELECT * FROM new_records
