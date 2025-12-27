/*
 * Staging Model: stg_company
 * 
 * Kombiniert alle 3 Company-Quellen (client, contractor, supplier)
 * in eine einheitliche Struktur mit role_code.
 * 
 * Berechnet:
 * - hk_company: Hash über object_id + source_table (da object_id nicht global unique)
 * - hk_country: Hash über country FK
 * - hk_role: Hash über role_code
 * - hd_company: Hash Diff für Change Detection
 */

{%- set hashdiff_columns = [
    'name',
    'street',
    'citycode',
    'city',
    'province',
    'state',
    'country',
    'website',
    'email',
    'phone',
    'mobile',
    'mobile2',
    'fax',
    'bic',
    'iban',
    'credit_rating',
    'commission_fee',
    'employeecount',
    'org_type',
    'uid',
    'subscription',
    'description'
] -%}

WITH 

-- ===========================================
-- SOURCE: Company Client
-- ===========================================
client_source AS (
    SELECT 
        object_id,
        'CLIENT' AS role_code,
        'wp_company_client' AS source_table,
        name,
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
        org_type,
        uid,
        subscription,
        description,
        freistellungsbescheinigung,
        date_created,
        date_updated,
        dss_record_source,
        dss_load_date,
        dss_run_id
    FROM {{ source('staging', 'ext_company_client') }}
),

-- ===========================================
-- SOURCE: Company Contractor
-- ===========================================
contractor_source AS (
    SELECT 
        object_id,
        'CONTRACTOR' AS role_code,
        'wp_company_contractor' AS source_table,
        name,
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
        org_type,
        uid,
        subscription,
        description,
        CAST(NULL AS DATETIME2) AS freistellungsbescheinigung,
        date_created,
        date_updated,
        dss_record_source,
        dss_load_date,
        dss_run_id
    FROM {{ source('staging', 'ext_company_contractor') }}
),

-- ===========================================
-- SOURCE: Company Supplier
-- ===========================================
supplier_source AS (
    SELECT 
        object_id,
        'SUPPLIER' AS role_code,
        'wp_company_supplier' AS source_table,
        name,
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
        org_type,
        uid,
        subscription,
        description,
        CAST(NULL AS DATETIME2) AS freistellungsbescheinigung,
        date_created,
        date_updated,
        dss_record_source,
        dss_load_date,
        dss_run_id
    FROM {{ source('staging', 'ext_company_supplier') }}
),

-- ===========================================
-- UNION ALL: Alle Quellen kombinieren
-- ===========================================
combined AS (
    SELECT * FROM client_source
    UNION ALL
    SELECT * FROM contractor_source
    UNION ALL
    SELECT * FROM supplier_source
),

-- ===========================================
-- STAGING: Hash Keys berechnen
-- ===========================================
staged AS (
    SELECT
        -- ===========================================
        -- HASH KEYS
        -- ===========================================
        -- hk_company: Composite Key aus object_id + source_table
        -- (da object_id nicht global eindeutig ist)
        -- Separator '^^' gemäß DV 2.1 Best Practice (selten in natürlichen Daten)
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                ISNULL(CAST(object_id AS NVARCHAR(MAX)), ''),
                '^^',
                ISNULL(source_table, '')
            )
        ), 2) AS hk_company,
        
        -- hk_country: FK zu hub_country
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(country AS NVARCHAR(MAX)), '')
        ), 2) AS hk_country,
        
        -- hk_role: FK zu ref_role
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(role_code, '')
        ), 2) AS hk_role,
        
        -- hk_link_company_role: Composite für Link
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                ISNULL(CAST(object_id AS NVARCHAR(MAX)), ''),
                '^^',
                ISNULL(source_table, ''),
                '^^',
                ISNULL(role_code, '')
            )
        ), 2) AS hk_link_company_role,
        
        -- hk_link_company_country: Composite für Link
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                ISNULL(CAST(object_id AS NVARCHAR(MAX)), ''),
                '^^',
                ISNULL(source_table, ''),
                '^^',
                ISNULL(CAST(country AS NVARCHAR(MAX)), '')
            )
        ), 2) AS hk_link_company_country,
        
        -- ===========================================
        -- HASH DIFF (Change Detection)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                {%- for col in hashdiff_columns %}
                ISNULL(CAST({{ col }} AS NVARCHAR(MAX)), ''){{ ',' if not loop.last else '' }}
                {%- endfor %}
            )
        ), 2) AS hd_company,
        
        -- ===========================================
        -- BUSINESS KEYS
        -- ===========================================
        object_id,
        source_table,
        role_code,
        
        -- ===========================================
        -- PAYLOAD (Attribute)
        -- ===========================================
        name,
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
        org_type,
        uid,
        subscription,
        description,
        freistellungsbescheinigung,
        date_created,
        date_updated,
        
        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'werkportal') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id
        
    FROM combined
)

SELECT * FROM staged
-- CI test comment 2025-12-27
