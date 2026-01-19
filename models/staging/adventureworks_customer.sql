/*
 * Staging Model: stg_aw_customer
 * 
 * Bereitet Product-Daten für das Data Vault vor.
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 */

{%- set hashdiff_columns = [
    'CustomerId',
    'NameStyle',
    'Title',
    'FirstName',
    'MiddleName',
    'LastName',
    'Suffix',
    'CompanyName'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_aw_customer') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEYS
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(CustomerID AS NVARCHAR(MAX)), '')
        ), 2) AS hk_customer,
        
        
        -- ===========================================
        -- HASH DIFF (Change Detection)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                {%- for col in hashdiff_columns %}
                ISNULL(CAST({{ col }} AS NVARCHAR(MAX)), ''){{ ',' if not loop.last else '' }}
                {%- endfor %}
            )
        ), 2) AS hd_customer,
        
        -- ===========================================
        -- BUSINESS KEY
        -- ===========================================
        CustomerID,
        
        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        NameStyle,
        Title,
        FirstName,
        MiddleName,
        LastName,
        Suffix,
        CompanyName,
        
        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'adventureWorksLT2025') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id
        
    FROM source
)

SELECT * FROM staged