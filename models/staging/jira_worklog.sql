/*
 * Staging Model: stg_jira_worklog
 * 
 * Bereitet jira_worklog-Daten für das Data Vault vor.
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 * Business Key: Fields_Work_Log_Worklogs_id
 */

{%- set hashdiff_columns = [
    'Issues_key',
    'Fields_Work_Log_Worklogs_author_accountId',
    'Fields_Work_Log_Worklogs_timeSpentSeconds',
    'Fields_Work_Log_Worklogs_created',
    'Fields_Work_Log_Worklogs_comment'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_agile_fields_work_log_worklogs') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEYS
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(Fields_Work_Log_Worklogs_id AS NVARCHAR(MAX)), '')
        ), 2) AS hk_jira_worklog,

        -- ===========================================
        -- HASH DIFF (Change Detection)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                ISNULL(CAST(Issues_key AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(Fields_Work_Log_Worklogs_author_accountId AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(Fields_Work_Log_Worklogs_timeSpentSeconds AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(Fields_Work_Log_Worklogs_created AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(Fields_Work_Log_Worklogs_comment AS NVARCHAR(MAX)), '')
            )
        ), 2) AS hd_jira_worklog,
        
        -- ===========================================
        -- BUSINESS KEY
        -- ===========================================
        Fields_Work_Log_Worklogs_id,
        
        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        Issues_key,
        Fields_Work_Log_Worklogs_author_accountId,
        Fields_Work_Log_Worklogs_timeSpentSeconds,
        Fields_Work_Log_Worklogs_created,
        Fields_Work_Log_Worklogs_comment,
        
        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'werkportal') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id
        
    FROM source
)

SELECT * FROM staged
