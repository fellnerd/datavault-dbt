/*
 * Satellite: sat_company_client
 * Schema: vault
 * 
 * Enthält alle beschreibenden Attribute für Company Clients.
 * Historisiert: Neue Version bei jeder Änderung (basierend auf Hash Diff).
 */

{{ config(
    materialized='incremental',
    unique_key='hk_company_client || dss_load_date',
    as_columnstore=false
) }}

WITH source_data AS (
    SELECT 
        hk_company_client,
        hd_company_client,
        dss_load_date,
        dss_record_source,
        -- Payload
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
        freistellungsbescheinigung,
        date_created,
        date_updated
    FROM {{ ref('stg_company_client') }}
    WHERE hk_company_client IS NOT NULL
),

{%- if is_incremental() %}
latest_satellites AS (
    SELECT 
        hk_company_client,
        hd_company_client
    FROM (
        SELECT 
            hk_company_client,
            hd_company_client,
            ROW_NUMBER() OVER (PARTITION BY hk_company_client ORDER BY dss_load_date DESC) AS rn
        FROM {{ this }}
    ) ranked
    WHERE rn = 1
),
{% endif %}

new_records AS (
    SELECT 
        src.hk_company_client,
        src.hd_company_client,
        src.dss_load_date,
        src.dss_record_source,
        src.name,
        src.subscription,
        src.org_type,
        src.uid,
        src.description,
        src.street,
        src.citycode,
        src.city,
        src.province,
        src.state,
        src.country,
        src.website,
        src.email,
        src.phone,
        src.mobile,
        src.mobile2,
        src.fax,
        src.bic,
        src.iban,
        src.credit_rating,
        src.commission_fee,
        src.employeecount,
        src.freistellungsbescheinigung,
        src.date_created,
        src.date_updated
    FROM source_data src
    {%- if is_incremental() %}
    LEFT JOIN latest_satellites ls
        ON src.hk_company_client = ls.hk_company_client
    WHERE ls.hk_company_client IS NULL  -- Neuer Hub-Eintrag
       OR src.hd_company_client != ls.hd_company_client  -- Änderung erkannt
    {%- endif %}
)

SELECT * FROM new_records
