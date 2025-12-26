/*
 * Staging Model: stg_company_client
 * 
 * Bereitet Daten aus der External Table für das Data Vault vor:
 * - Berechnet Hash Keys (hk_company_client)
 * - Berechnet Hash Diff für Change Detection
 * - Standardisiert Record Source und Load Date
 */

{%- set source_model = source('staging', 'ext_company_client') -%}

{%- set hk_column = ['object_id'] -%}
{%- set hk_country_column = ['country'] -%}

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
    'description',
    'freistellungsbescheinigung'
] -%}

WITH source AS (
    SELECT * FROM {{ source_model }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEYS (Business Keys → Surrogate Keys)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(object_id AS NVARCHAR(MAX)), '')
        ), 2) AS hk_company_client,
        
        -- Hash Key für Link zu Country (Foreign Key)
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(country AS NVARCHAR(MAX)), '')
        ), 2) AS hk_country,
        
        -- ===========================================
        -- HASH DIFF (Change Detection für Satellites)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT_WS('||',
                ISNULL(CAST(name AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(street AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(citycode AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(city AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(province AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(state AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(country AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(website AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(email AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(phone AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(mobile AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(mobile2 AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(fax AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(bic AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(iban AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(credit_rating AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(commission_fee AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(employeecount AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(org_type AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(uid AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(subscription AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(description AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(freistellungsbescheinigung AS NVARCHAR(MAX)), '')
            )
        ), 2) AS hd_company_client,
        
        -- ===========================================
        -- BUSINESS KEYS
        -- ===========================================
        CAST(object_id AS NVARCHAR(255)) AS object_id,
        
        -- ===========================================
        -- PAYLOAD ATTRIBUTES (für Satellites)
        -- ===========================================
        -- Stammdaten
        name,
        subscription,
        org_type,
        uid,
        description,
        
        -- Adresse
        street,
        citycode,
        city,
        province,
        state,
        CAST(country AS NVARCHAR(255)) AS country,
        
        -- Kontakt
        website,
        email,
        phone,
        mobile,
        mobile2,
        fax,
        
        -- Finanzen
        bic,
        iban,
        credit_rating,
        commission_fee,
        employeecount,
        freistellungsbescheinigung,
        
        -- Timestamps aus Quellsystem
        date_created,
        date_updated,
        
        -- ===========================================
        -- METADATA (dss_ Prefix)
        -- ===========================================
        COALESCE(dss_record_source, 'werkportal.postgres') AS dss_record_source,
        CAST(
            COALESCE(
                TRY_CAST(dss_load_date AS DATETIME2),
                GETDATE()
            ) AS DATETIME2(7)
        ) AS dss_load_date,
        dss_run_id,
        dss_stage_timestamp,
        dss_source_file_name
        
    FROM source
)

SELECT * FROM staged
