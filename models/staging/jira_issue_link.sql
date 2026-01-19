/*
 * Staging Model: stg_jira_issue_link
 * 
 * Bereitet jira_issue_link-Daten für das Data Vault vor.
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 * Business Key: Fields_Issue_Links_id
 */

{%- set hashdiff_columns = [
    'Issues_key',
    'Fields_Issue_Links_outwardIssue_key',
    'Fields_Issue_Links_inwardIssue_key',
    'Fields_Issue_Links_type_name'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_jira_issue_link') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEYS
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(Fields_Issue_Links_id AS NVARCHAR(MAX)), '')
        ), 2) AS hk_jira_issue_link,

        -- ===========================================
        -- HASH DIFF (Change Detection)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                ISNULL(CAST(Issues_key AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(Fields_Issue_Links_outwardIssue_key AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(Fields_Issue_Links_inwardIssue_key AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(Fields_Issue_Links_type_name AS NVARCHAR(MAX)), '')
            )
        ), 2) AS hd_jira_issue_link,
        
        -- ===========================================
        -- BUSINESS KEY
        -- ===========================================
        Fields_Issue_Links_id,
        
        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        Issues_key,
        Fields_Issue_Links_outwardIssue_key,
        Fields_Issue_Links_inwardIssue_key,
        Fields_Issue_Links_type_name,
        
        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'werkportal') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id
        
    FROM source
)

SELECT * FROM staged
