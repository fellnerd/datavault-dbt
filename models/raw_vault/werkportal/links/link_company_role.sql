/*
 * Link: link_company_role
 * Schema: vault
 * 
 * Verknüpfung zwischen hub_company und ref_role.
 * Zeigt welche Rolle(n) ein Unternehmen hat.
 * 
 * Ein Unternehmen kann mehrere Rollen haben (Client UND Supplier).
 */

{{ config(
    materialized='incremental',
    unique_key='hk_link_company_role',
    as_columnstore=false
) }}

WITH source_data AS (
    SELECT 
        hk_link_company_role,
        hk_company,
        hk_role,
        role_code,
        dss_load_date,
        dss_record_source
    FROM {{ ref('stg_company') }}
    WHERE hk_company IS NOT NULL
      AND hk_role IS NOT NULL
),

{% if is_incremental() %}
existing_links AS (
    SELECT hk_link_company_role FROM {{ this }}
),
{% endif %}

new_records AS (
    SELECT DISTINCT
        src.hk_link_company_role,
        src.hk_company,
        src.hk_role,
        src.role_code,
        src.dss_load_date,
        src.dss_record_source
    FROM source_data src
    {% if is_incremental() %}
    WHERE NOT EXISTS (
        SELECT 1 FROM existing_links el
        WHERE el.hk_link_company_role = src.hk_link_company_role
    )
    {% endif %}
)

SELECT * FROM new_records
