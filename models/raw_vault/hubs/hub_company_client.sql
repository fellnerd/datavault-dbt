/*
 * Hub: hub_company_client
 * Schema: vault
 * 
 * Enthält alle eindeutigen Business Keys für Company Clients.
 * Insert-Only: Einmal eingefügt, nie gelöscht oder aktualisiert.
 */

{{ config(
    materialized='incremental',
    unique_key='hk_company_client',
    as_columnstore=false
) }}

WITH source_data AS (
    SELECT 
        hk_company_client,
        object_id,
        dss_load_date,
        dss_record_source
    FROM {{ ref('stg_company_client') }}
    WHERE hk_company_client IS NOT NULL
),

{%- if is_incremental() %}
existing_hubs AS (
    SELECT hk_company_client FROM {{ this }}
),
{% endif %}

new_records AS (
    SELECT DISTINCT
        src.hk_company_client,
        src.object_id,
        src.dss_load_date,
        src.dss_record_source
    FROM source_data src
    {%- if is_incremental() %}
    LEFT JOIN existing_hubs eh
        ON src.hk_company_client = eh.hk_company_client
    WHERE eh.hk_company_client IS NULL
    {%- endif %}
)

SELECT * FROM new_records
