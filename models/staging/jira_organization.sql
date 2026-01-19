/*
 * Staging Model: stg_jira_organization
 * 
 * Bereitet jira_organization-Daten für das Data Vault vor.
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 * Business Key: Organization_ID
 */

{%- set hashdiff_columns = [
    'Name'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_servicedesk_organizations') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEYS
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(Organization_ID AS NVARCHAR(MAX)), '')
        ), 2) AS hk_jira_organization,

        -- ===========================================
        -- HASH DIFF (Change Detection)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(Name AS NVARCHAR(MAX)), '')
        ), 2) AS hd_jira_organization,
        
        -- ===========================================
        -- BUSINESS KEY
        -- ===========================================
        Organization_ID,
        
        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        Name,
        
        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'werkportal') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id
        
    FROM source
)

SELECT * FROM staged
