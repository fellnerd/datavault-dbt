/*
 * Staging Model: jira_project
 *
 * Source: ext_jira_projects
 * Business Key: PROJECT_ID
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 *
 * Hash Keys calculated here (automate_dv pattern):
 *   - hk_project (Entity Hash Key)
 */

{%- set hashdiff_columns = [
    'CATEGORY',
    'DESCRIPTION',
    'LEAD_NAME',
    'NAME',
    'PROJECT_KEY',
    'TOTAL_ISSUE_COUNT',
    'TYPE',
    'URL'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_jira_projects') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEY (Entity)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(PROJECT_ID AS NVARCHAR(MAX)), '')
        ), 2) AS hk_project,

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
        ), 2) AS hd_project,

        -- ===========================================
        -- BUSINESS KEY(S)
        -- ===========================================
        PROJECT_ID AS project_id,

        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        PROJECT_KEY as project_key,
        NAME as name,
        URL as url,
        DESCRIPTION as description,
        CATEGORY as category,
        TYPE as type,
        LEAD_NAME as lead,
        TOTAL_ISSUE_COUNT as issue_count,

        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'jira') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id

    FROM source
)

SELECT * FROM staged