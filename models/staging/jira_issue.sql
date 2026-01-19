/*
 * Staging Model: stg_jira_issue
 * 
 * Bereitet jira_issue-Daten für das Data Vault vor.
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 * Business Key: Issues_key
 */

{%- set hashdiff_columns = [
    'Issues_id',
    'Board_Id',
    'Issues_fields_priority_name',
    'Issues_fields_assignee_accountId',
    'Issues_fields_reporter_accountId',
    'Issues_fields_summary',
    'Issues_fields_description',
    'Issues_fields_created',
    'Issues_fields_updated'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_jira_issue') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEYS
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(Issues_key AS NVARCHAR(MAX)), '')
        ), 2) AS hk_jira_issue,

        -- ===========================================
        -- HASH DIFF (Change Detection)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                ISNULL(CAST(Issues_id AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(Board_Id AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(Issues_fields_priority_name AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(Issues_fields_assignee_accountId AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(Issues_fields_reporter_accountId AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(Issues_fields_summary AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(Issues_fields_description AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(Issues_fields_created AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(Issues_fields_updated AS NVARCHAR(MAX)), '')
            )
        ), 2) AS hd_jira_issue,
        
        -- ===========================================
        -- BUSINESS KEY
        -- ===========================================
        Issues_key,
        
        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        Issues_id,
        Board_Id,
        Issues_fields_priority_name,
        Issues_fields_assignee_accountId,
        Issues_fields_reporter_accountId,
        Issues_fields_summary,
        Issues_fields_description,
        Issues_fields_created,
        Issues_fields_updated,
        
        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'werkportal') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id
        
    FROM source
)

SELECT * FROM staged
