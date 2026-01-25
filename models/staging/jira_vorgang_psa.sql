/*
 * Staging Model: jira_vorgang_psa
 *
 * Source: jira_issues
 * Business Key: ISSUE_ID
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 *
 * Hash Keys calculated here (automate_dv pattern):
 *   - hk_vorgang_psa (Entity Hash Key)
 */

{%- set hashdiff_columns = [
    'BUSINESS_ORIGINAL_ESTIMATE',
    'BUSINESS_ORIGINAL_ESTIMATE_WITH_SUBTASKS',
    'BUSINESS_REMAINING_ESTIMATE',
    'BUSINESS_REMAINING_ESTIMATE_WITH_SUBTASKS',
    'BUSINESS_TIME_SPENT',
    'BUSINESS_TIME_SPENT_WITH_SUBTASKS',
    'CREATED',
    'CREATOR_ACCOUNT_ID',
    'CREATOR_NAME',
    'CURRENT_ASSIGNEE_ACCOUNT_ID',
    'CURRENT_ASSIGNEE_NAME',
    'DESCRIPTION',
    'DUE_DATE',
    'ENVIRONMENT',
    'ISSUE_KEY',
    'ISSUE_STATUS_ID',
    'ISSUE_STATUS_NAME',
    'ISSUE_TYPE_ID',
    'ISSUE_TYPE_NAME',
    'LAST_VIEWED',
    'ORIGINAL_ESTIMATE',
    'ORIGINAL_ESTIMATE_WITH_SUBTASKS',
    'PARENT_ISSUE_ID',
    'PARENT_ISSUE_KEY',
    'PARENT_ISSUE_STATUS_ID',
    'PARENT_ISSUE_STATUS_NAME',
    'PARENT_ISSUE_SUMMARY',
    'PARENT_ISSUE_TYPE_ID',
    'PARENT_ISSUE_TYPE_NAME',
    'PARENT_PRIORITY',
    'PRIORITY',
    'PROJECT_ID',
    'PROJECT_KEY',
    'REMAINING_ESTIMATE',
    'REMAINING_ESTIMATE_WITH_SUBTASKS',
    'REPORTER_ACCOUNT_ID',
    'REPORTER_NAME',
    'RESOLUTION',
    'RESOLUTION_DATE',
    'SECURITY_LEVEL_NAME',
    'STATUS_CATEGORY_CHANGE_DATE',
    'SUMMARY',
    'TIME_SPENT',
    'TIME_SPENT_WITH_SUBTASKS',
    'UPDATED',
    'VOTES',
    'WATCHERS',
    'WORK_RATIO'
] -%}

WITH source AS (
    SELECT * FROM {{ ref('psa_jira_issues') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEY (Entity)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(ISSUE_ID AS NVARCHAR(MAX)), '')
        ), 2) AS hk_vorgang_psa,

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
        ), 2) AS hd_vorgang_psa,

        -- ===========================================
        -- BUSINESS KEY(S)
        -- ===========================================
        ISSUE_ID,

        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        ISSUE_KEY,
        ISSUE_TYPE_ID,
        ISSUE_TYPE_NAME,
        ISSUE_STATUS_ID,
        ISSUE_STATUS_NAME,
        SUMMARY,
        DESCRIPTION,
        PRIORITY,
        WATCHERS,
        WORK_RATIO,
        VOTES,
        RESOLUTION,
        PROJECT_ID,
        PROJECT_KEY,
        CURRENT_ASSIGNEE_ACCOUNT_ID,
        CURRENT_ASSIGNEE_NAME,
        CREATOR_ACCOUNT_ID,
        CREATOR_NAME,
        REPORTER_ACCOUNT_ID,
        REPORTER_NAME,
        ENVIRONMENT,
        CREATED,
        UPDATED,
        DUE_DATE,
        RESOLUTION_DATE,
        LAST_VIEWED,
        SECURITY_LEVEL_NAME,
        STATUS_CATEGORY_CHANGE_DATE,
        TIME_SPENT,
        TIME_SPENT_WITH_SUBTASKS,
        ORIGINAL_ESTIMATE,
        ORIGINAL_ESTIMATE_WITH_SUBTASKS,
        REMAINING_ESTIMATE,
        REMAINING_ESTIMATE_WITH_SUBTASKS,
        BUSINESS_TIME_SPENT,
        BUSINESS_TIME_SPENT_WITH_SUBTASKS,
        BUSINESS_ORIGINAL_ESTIMATE,
        BUSINESS_ORIGINAL_ESTIMATE_WITH_SUBTASKS,
        BUSINESS_REMAINING_ESTIMATE,
        BUSINESS_REMAINING_ESTIMATE_WITH_SUBTASKS,
        PARENT_ISSUE_ID,
        PARENT_ISSUE_KEY,
        PARENT_ISSUE_SUMMARY,
        PARENT_ISSUE_TYPE_ID,
        PARENT_ISSUE_TYPE_NAME,
        PARENT_PRIORITY,
        PARENT_ISSUE_STATUS_ID,
        PARENT_ISSUE_STATUS_NAME,

        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'jira') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id

    FROM source
)

SELECT * FROM staged