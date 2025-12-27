/*
 * Link: link_company_country
 * Schema: vault
 * 
 * Verknüpfung zwischen hub_company und hub_country.
 * Zeigt in welchem Land ein Unternehmen sitzt.
 */

{{ config(
    materialized='incremental',
    unique_key='hk_link_company_country',
    as_columnstore=false
) }}

WITH source_data AS (
    SELECT 
        hk_link_company_country,
        hk_company,
        hk_country,
        dss_load_date,
        dss_record_source
    FROM {{ ref('stg_company') }}
    WHERE hk_company IS NOT NULL
      AND hk_country IS NOT NULL
      AND country IS NOT NULL  -- Nur wenn FK gesetzt
),

{% if is_incremental() %}
existing_links AS (
    SELECT hk_link_company_country FROM {{ this }}
),
{% endif %}

new_records AS (
    SELECT DISTINCT
        src.hk_link_company_country,
        src.hk_company,
        src.hk_country,
        src.dss_load_date,
        src.dss_record_source
    FROM source_data src
    {% if is_incremental() %}
    WHERE NOT EXISTS (
        SELECT 1 FROM existing_links el
        WHERE el.hk_link_company_country = src.hk_link_company_country
    )
    {% endif %}
)

SELECT * FROM new_records
