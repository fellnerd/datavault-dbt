/*
 * Staging Model: stg_jira_project
 * 
 * Bereitet jira_project-Daten für das Data Vault vor.
 */

WITH source AS (
    SELECT 
        [Id],
        [Project_Key],
        [Name],
        [Project_Type_Key],
        [Project_Category_Name],
        [Description],
        [Lead_AccountId],
        [Url],
        [dss_record_source],
        [dss_load_date],
        [dss_run_id]
    FROM {{ source('staging', 'ext_jira_project') }}
),

staged AS (
    SELECT
        -- Hash Keys
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST([Project_Key] AS NVARCHAR(MAX)), '')
        ), 2) AS hk_jira_project,
        
        -- Hash Diff
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                ISNULL(CAST([Name] AS NVARCHAR(MAX)), ''),
                ISNULL(CAST([Project_Key] AS NVARCHAR(MAX)), ''),
                ISNULL(CAST([Project_Type_Key] AS NVARCHAR(MAX)), ''),
                ISNULL(CAST([Project_Category_Name] AS NVARCHAR(MAX)), ''),
                ISNULL(CAST([Description] AS NVARCHAR(MAX)), ''),
                ISNULL(CAST([Lead_AccountId] AS NVARCHAR(MAX)), ''),
                ISNULL(CAST([Url] AS NVARCHAR(MAX)), '')
            )
        ), 2) AS hd_jira_project,
        
        -- Business Keys
        [Id],
        [Project_Key],
        [Lead_AccountId],
        
        -- Payload
        [Name],
        [Project_Type_Key],
        [Project_Category_Name],
        [Description],
        [Url],
        
        -- Metadata
        COALESCE([dss_record_source], 'jira') AS dss_record_source,
        COALESCE(CAST([dss_load_date] AS DATETIME2), GETDATE()) AS dss_load_date,
        [dss_run_id]
        
    FROM source
)

SELECT * FROM staged
