/*
 * Staging Model: jira_tempolog
 *
 * Source: ext_jira_tempolog
 * Business Key: id
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 *
 * Hash Keys calculated here (automate_dv pattern):
 *   - hk_tempolog (Entity Hash Key)
 */

{%- set hashdiff_columns = [
    'updatedAt'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_jira_tempolog') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEY (Entity)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(id AS NVARCHAR(MAX)), '')
        ), 2) AS hk_tempolog,

        -- ===========================================
        -- HASH DIFF (Change Detection - Satellite)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                {%- for col in hashdiff_columns %}
                ISNULL(CAST({{ col }} AS NVARCHAR(MAX)), ''){{ ',' if not loop.last else '' }}
                {%- endfor %}
                {%- if hashdiff_columns | length == 1 %}, ''{%- endif %}
            )
        ), 2) AS hd_tempolog,

        -- ===========================================
        -- BUSINESS KEY(S)
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
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'jira') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id

    FROM source
)

SELECT * FROM staged