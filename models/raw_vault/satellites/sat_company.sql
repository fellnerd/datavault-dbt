/*
 * Satellite: sat_company
 * Schema: vault
 * 
 * Gemeinsame Attribute aller Unternehmen.
 * Historisiert: Neue Version bei jeder Änderung (basierend auf Hash Diff).
 * is_current: 'Y' für aktuellen Eintrag, 'N' für historische
 */

{{ config(
    materialized='incremental',
    unique_key='hk_company',
    as_columnstore=false,
    post_hook=[
        "UPDATE {{ this }} SET dss_is_current = 'N' WHERE dss_is_current = 'Y' AND hk_company IN (SELECT hk_company FROM {{ this }} GROUP BY hk_company HAVING COUNT(*) > 1) AND dss_load_date < (SELECT MAX(dss_load_date) FROM {{ this }} t2 WHERE t2.hk_company = {{ this }}.hk_company)"
    ]
) }}

WITH source_data AS (
    SELECT 
        hk_company,
        hd_company,
        dss_load_date,
        dss_record_source,
        -- Payload (gemeinsame Attribute)
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
        date_updated
    FROM {{ ref('stg_company') }}
    WHERE hk_company IS NOT NULL
),

{% if is_incremental() %}
existing_sats AS (
    SELECT 
        hk_company,
        hd_company
    FROM {{ this }}
),
{% endif %}

new_records AS (
    SELECT
        src.hk_company,
        src.hd_company,
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
        src.date_created,
        src.date_updated
    FROM source_data src
    {% if is_incremental() %}
    WHERE NOT EXISTS (
        SELECT 1 FROM existing_sats es
        WHERE es.hk_company = src.hk_company
          AND es.hd_company = src.hd_company
    )
    {% endif %}
)

SELECT 
    *,
    'Y' AS dss_is_current
FROM new_records
