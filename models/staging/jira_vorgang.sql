/*
 * Staging Model: jira_vorgang
 *
 * Source: ext_jira_issues
 * Business Key: ISSUE_ID
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 *
 * Links (Foreign Keys):
 *   - jira.hub_project via project_id
 *
 * Hash Keys calculated here (automate_dv pattern):
 *   - hk_vorgang (Entity Hash Key)
 *   - hk_project (FK Hash Key for jira.hub_project)
 *   - hk_link_vorgang_project (Link Hash Key)
 */

{%- set hashdiff_columns = [
    'issue_key',
    'issue_status_id',
    'issue_type_id',
    'original_estimate',
    'original_estimate_with_subtasks',
    'parent_issue_id',
    'priority',
    'remaining_estimate',
    'remaining_estimate_with_subtasks',
    'reporter_account_id',
    'resolution',
    'summary',
    'time_spent',
    'time_spent_with_subtasks',
    'work_ratio'
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
        -- FK HASH KEYS (for Links)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(project_id AS NVARCHAR(MAX)), '')
        ), 2) AS hk_project,

        -- ===========================================
        -- LINK HASH KEYS
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                ISNULL(CAST(ISSUE_ID AS NVARCHAR(MAX)), ''),
                '^^',
                ISNULL(CAST(project_id AS NVARCHAR(MAX)), '')
            )
        ), 2) AS hk_link_vorgang_project,

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
        issue_key,
        issue_type_id,
        issue_status_id,
        summary,
        priority,
        work_ratio,
        resolution,
        project_id,
        reporter_account_id,
        time_spent,
        time_spent_with_subtasks,
        original_estimate,
        original_estimate_with_subtasks,
        remaining_estimate,
        remaining_estimate_with_subtasks,
        parent_issue_id,

        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'jira') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id

    FROM source
)

SELECT * FROM staged