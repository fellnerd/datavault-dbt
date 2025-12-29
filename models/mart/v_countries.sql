/*
 * Mart View: v_countries
 * Schema: mart_project
 * 
 * Current view of all countries with their attributes
 * Flache, denormalisierte View für BI/Reporting.
 */

{{ config(
    materialized='view'
) }}

SELECT
    -- IDs
    h.hk_country,
    h.object_id,
    
    -- Attribute
    s_country.name,
    
    -- Metadata
    h.dss_load_date AS hub_load_date

FROM {{ ref('hub_country') }} h

-- sat_country
LEFT JOIN {{ ref('sat_country') }} s_country
    ON h.hk_country = s_country.hk_country
    AND s_country.dss_is_current = 'Y'

-- Ghost Records ausschließen
WHERE h.object_id > 0
