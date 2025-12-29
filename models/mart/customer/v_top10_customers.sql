/*
 * Mart View: v_top10_customers
 * Schema: mart_project
 * 
 * Top 10 Kunden basierend auf dem Erstellungsdatum
 * Flache, denormalisierte View für BI/Reporting.
 */

{{ config(
    materialized='view'
) }}

SELECT
    -- IDs
    h.hk_company,
    h.object_id,
    
    -- Attribute
    s_company.name,
    s_company.subscription,
    s_company.org_type,
    s_company.uid,
    s_company.description,
    s_company.street,
    s_company.city,
    s_company.country,
    s_company.website,
    s_company.email,
    s_company.phone,
    s_company.credit_rating,
    s_company.employeecount,
    s_company.date_created,
    
    -- Metadata
    h.dss_load_date AS hub_load_date

FROM {{ ref('hub_company') }} h

-- sat_company
LEFT JOIN {{ ref('sat_company') }} s_company
    ON h.hk_company = s_company.hk_company
    AND s_company.dss_is_current = 'Y'

-- Ghost Records ausschließen
WHERE h.object_id > 0
