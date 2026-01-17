/*
 * Mart View: v_customer_current
 * Schema: mart_customer
 * 
 * Current customer data with all attributes for reporting
 * Flache, denormalisierte View für BI/Reporting.
 */

{{ config(
    materialized='view'
) }}

SELECT
    -- IDs
    h.hk_customer,
    h.CustomerID,
    
    -- Attribute
    s_customer.NameStyle,
    s_customer.Title,
    s_customer.FirstName,
    s_customer.MiddleName,
    s_customer.LastName,
    s_customer.Suffix,
    s_customer.CompanyName,
    
    -- Metadata
    h.dss_load_date AS hub_load_date

FROM {{ ref('hub_customer') }} h

-- sat_customer
LEFT JOIN {{ ref('sat_customer') }} s_customer
    ON h.hk_customer = s_customer.hk_customer
    AND s_customer.dss_is_current = 'Y'

-- Ghost Records ausschließen
WHERE h.CustomerID IS NOT NULL
