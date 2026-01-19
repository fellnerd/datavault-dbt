/*
 * Staging Model: jira_epic
 * 
 * Bereitet jira_epic-Daten für das Data Vault vor.
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 * Business Key: Values_id
 */

{%- set hashdiff_columns = [
    'Values_name',
    'Values_key',
    'Values_color_key',
    'Values_done',
    'Values_summary'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_jira_epic') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEYS
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(Values_id AS NVARCHAR(MAX)), '')
        ), 2) AS hk_jira_epic,

        -- ===========================================
        -- HASH DIFF (Change Detection)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                ISNULL(CAST(Values_name AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(Values_key AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(Values_color_key AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(Values_done AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(Values_summary AS NVARCHAR(MAX)), '')
            )
        ), 2) AS hd_jira_epic,
        
        -- ===========================================
        -- BUSINESS KEY
        -- ===========================================
        Values_id,
        
        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        Values_name,
        Values_key,
        Values_color_key,
        Values_done,
        Values_summary,
        
        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'werkportal') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id
        
    FROM source
)

SELECT * FROM staged
