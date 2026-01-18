/*
 * Hub: hub_company
 * Schema: vault
 * 
 * Unified Hub für alle Unternehmen aus allen 3 Quellen
 * (company_client, company_contractor, company_supplier).
 * 
 * Business Key: object_id + source_table (da object_id nicht global unique)
 */

{{ config(
    materialized='incremental',
    unique_key='hk_company',
    as_columnstore=false
) }}

WITH source_data AS (
    SELECT 
        hk_company,
        object_id,
        source_table,
        dss_load_date,
        dss_record_source
    FROM {{ ref('stg_company') }}
    WHERE hk_company IS NOT NULL
),

{% if is_incremental() %}
existing_hubs AS (
    SELECT hk_company FROM {{ this }}
),
{% endif %}

new_records AS (
    SELECT DISTINCT
        src.hk_company,
        src.object_id,
        src.source_table,
        src.dss_load_date,
        src.dss_record_source
    FROM source_data src
    {% if is_incremental() %}
    WHERE NOT EXISTS (
        SELECT 1 FROM existing_hubs eh
        WHERE eh.hk_company = src.hk_company
    )
    {% endif %}
)

SELECT * FROM new_records
