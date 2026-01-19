/*
 * Staging Model: stg_country
 * 
 * Bereitet Länderdaten aus ext_countries für das Data Vault vor.
 */

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_countries') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEYS
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(object_id AS NVARCHAR(MAX)), '')
        ), 2) AS hk_country,
        
        -- ===========================================
        -- HASH DIFF
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(name AS NVARCHAR(MAX)), '')
        ), 2) AS hd_country,
        
        -- ===========================================
        -- BUSINESS KEY
        -- ===========================================
        object_id,
        
        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        name,
        
        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'werkportal') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id
        
    FROM source
)

SELECT * FROM staged
