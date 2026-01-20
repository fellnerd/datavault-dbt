/*
 * Staging Model: stg_tempo_worklog
 * 
 * Bereitet tempo_worklog-Daten für das Data Vault vor.
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 * Business Key: id
 */

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_tempo_worklog') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEYS
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(id AS NVARCHAR(MAX)), '')
        ), 2) AS hk_tempo_worklog,

        -- ===========================================
        -- HASH DIFF (Change Detection)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                ISNULL(CAST(issueKey AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(issueId AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(issueSummary AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(date AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(startTime AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(timeSpentSeconds AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(timeSpentHours AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(description AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(accountId AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(displayName AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(createdAt AS NVARCHAR(MAX)), ''),
                ISNULL(CAST(updatedAt AS NVARCHAR(MAX)), '')
            )
        ), 2) AS hd_tempo_worklog,
        
        -- ===========================================
        -- BUSINESS KEY
        -- ===========================================
        id,
        
        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        issueKey,
        issueId,
        issueSummary,
        date,
        startTime,
        timeSpentSeconds,
        timeSpentHours,
        description,
        accountId,
        displayName,
        createdAt,
        updatedAt,
        
        -- ===========================================
        -- METADATA (aus Quelle)
        -- ===========================================
        COALESCE(dss_record_source, 'tempo') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id
        
    FROM source
)

SELECT * FROM staged
