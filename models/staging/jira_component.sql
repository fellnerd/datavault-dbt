/*
 * Staging Model: jira_component
 * 
 * Bereitet jira_component-Daten für das Data Vault vor.
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 * Business Key: Fields_Components_id
 */

{%- set hashdiff_columns = [
    'Fields_Components_name',
    'Fields_Components_description'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_jira_component') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEYS
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(Fields_Components_id AS NVARCHAR(MAX)), '')
        ), 2) AS hk_jira_component,

        -- ===========================================
        -- HASH DIFF (Change Detection)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                ISNULL(CAST(Fields_Components_name AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(Fields_Components_description AS NVARCHAR(MAX)), '')
            )
        ), 2) AS hd_jira_component,
        
        -- ===========================================
        -- BUSINESS KEY
        -- ===========================================
        Fields_Components_id,
        
        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        Fields_Components_name,
        Fields_Components_description,
        
        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'werkportal') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id
        
    FROM source
)

SELECT * FROM staged
