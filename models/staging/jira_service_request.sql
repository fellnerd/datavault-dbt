/*
 * Staging Model: stg_jira_service_request
 * 
 * Bereitet jira_service_request-Daten für das Data Vault vor.
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 * Business Key: Issue_Key
 */

{%- set hashdiff_columns = [
    'Issue_Id',
    'Request_Type_Name',
    'Service_Desk_Project_Name',
    'Created_Date_Iso8601',
    'Current_Status_Status',
    'Reporter_AccountId'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_servicedesk_sd_customer_request') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEYS
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(Issue_Key AS NVARCHAR(MAX)), '')
        ), 2) AS hk_jira_service_request,

        -- ===========================================
        -- HASH DIFF (Change Detection)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                ISNULL(CAST(Issue_Id AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(Request_Type_Name AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(Service_Desk_Project_Name AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(Created_Date_Iso8601 AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(Current_Status_Status AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(Reporter_AccountId AS NVARCHAR(MAX)), '')
            )
        ), 2) AS hd_jira_service_request,
        
        -- ===========================================
        -- BUSINESS KEY
        -- ===========================================
        Issue_Key,
        
        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        Issue_Id,
        Request_Type_Name,
        Service_Desk_Project_Name,
        Created_Date_Iso8601,
        Current_Status_Status,
        Reporter_AccountId,
        
        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'werkportal') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id
        
    FROM source
)

SELECT * FROM staged
