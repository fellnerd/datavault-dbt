/*
 * Staging Model: stg_jira_user
 * 
 * Bereitet jira_user-Daten für das Data Vault vor.
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 * Business Key: Users_AccountId
 */

{%- set hashdiff_columns = [
    'Users_displayName',
    'Users_emailAddress',
    'Users_timeZone',
    'Users_active',
    'Users_Account_Type',
    'Group_Name'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_jira_user') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEYS
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(Users_AccountId AS NVARCHAR(MAX)), '')
        ), 2) AS hk_jira_user,

        -- ===========================================
        -- HASH DIFF (Change Detection)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                ISNULL(CAST(Users_displayName AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(Users_emailAddress AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(Users_timeZone AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(Users_active AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(Users_Account_Type AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(Group_Name AS NVARCHAR(MAX)), '')
            )
        ), 2) AS hd_jira_user,
        
        -- ===========================================
        -- BUSINESS KEY
        -- ===========================================
        Users_AccountId,
        
        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        Users_displayName,
        Users_emailAddress,
        Users_timeZone,
        Users_active,
        Users_Account_Type,
        Group_Name,
        
        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'werkportal') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id
        
    FROM source
)

SELECT * FROM staged
