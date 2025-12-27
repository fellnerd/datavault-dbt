/*
 * Information Mart View: company_current_v
 * Schema: mart_project
 * Business Context: Project
 * 
 * Aktuelle Company-Daten (nur dss_is_current = 'Y').
 * Performant: Kein ROW_NUMBER(), nutzt physisches Flag aus sat_company.
 */

{{ config(
    materialized='view'
) }}

SELECT 
    hk_company,
    name,
    subscription,
    org_type,
    uid,
    description,
    street,
    citycode,
    city,
    province,
    state,
    country,
    website,
    email,
    phone,
    mobile,
    mobile2,
    fax,
    bic,
    iban,
    credit_rating,
    commission_fee,
    employeecount,
    date_created,
    date_updated,
    hd_company,
    dss_load_date,
    dss_record_source,
    dss_is_current
FROM {{ ref('sat_company') }}
WHERE dss_is_current = 'Y'
