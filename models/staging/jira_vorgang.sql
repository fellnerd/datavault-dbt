/*
 * Staging Model: jira_vorgang
 *
 * Source: ext_jira_issues
 * Business Key: ISSUE_ID
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 *
 * Hash Keys calculated here (automate_dv pattern):
 *   - hk_vorgang (Entity Hash Key)
 */

{%- set hashdiff_columns = [
    'ISSUE_KEY',
    'ISSUE_STATUS_ID',
    'ISSUE_TYPE_ID',
    'PROJECT_ID',
    'PROJECT_KEY',
    'SUMMARY'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_jira_issues') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEY (Entity)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(ISSUE_ID AS NVARCHAR(MAX)), '')
        ), 2) AS hk_vorgang,

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
        ), 2) AS hd_vorgang,

        -- ===========================================
        -- BUSINESS KEY(S)
        -- ===========================================
        ISSUE_ID,

        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        ISSUE_KEY,
        ISSUE_TYPE_ID,
        ISSUE_STATUS_ID,
        SUMMARY,
        PROJECT_ID,
        PROJECT_KEY,

        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'jira') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id

    FROM source
)

SELECT * FROM staged