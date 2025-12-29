/*
 * Mart View: v_company_extended
 * Schema: mart_project
 * 
 * Erweiterte Company View mit vollständigen Attributen und Länder-Integration für BI/Reporting
 * Flache, denormalisierte View für BI/Reporting.
 */

{{ config(
    materialized='view'
) }}

SELECT
    -- IDs and Keys
    h.hk_company,
    h.object_id AS company_id,
    
    -- Company Attributes
    s_company.name AS company_name,
    s_company.subscription,
    s_company.org_type,
    s_company.uid AS company_uid,
    s_company.description AS company_description,
    
    -- Address Information
    s_company.street,
    s_company.citycode,
    s_company.city,
    s_company.province,
    s_company.state,
    s_company.country AS country_code,
    s_country.name AS country_name,
    
    -- Contact Information
    s_company.website,
    s_company.email,
    s_company.phone,
    s_company.mobile,
    s_company.mobile2,
    s_company.fax,
    
    -- Financial Information
    s_company.bic,
    s_company.iban,
    s_company.credit_rating,
    s_company.commission_fee,
    
    -- Additional Attributes
    s_company.employeecount,
    s_company.date_created,
    s_company.date_updated,
    
    -- Metadata
    h.dss_load_date AS hub_load_date,
    GREATEST(
        ISNULL(s_company.dss_load_date, h.dss_load_date),
        ISNULL(s_country.dss_load_date, h.dss_load_date)
    ) AS last_updated

FROM {{ ref('hub_company') }} h

-- Company Attributes (current only)
LEFT JOIN {{ ref('sat_company') }} s_company
    ON h.hk_company = s_company.hk_company
    AND s_company.dss_is_current = 'Y'

-- Country Information via Link
LEFT JOIN {{ ref('link_company_country') }} l_company_country
    ON h.hk_company = l_company_country.hk_company
LEFT JOIN {{ ref('sat_country') }} s_country
    ON l_company_country.hk_country = s_country.hk_country
    AND s_country.dss_is_current = 'Y'

-- Filter: Only real companies (exclude ghost records)
WHERE h.object_id > 0
