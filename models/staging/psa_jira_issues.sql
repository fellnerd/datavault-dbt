/*
 * Persistent Staging Area: psa_jira_issues
 * 
 * Source: ext_jira_issues
 * Strategy: merge
 * Unique Key: ISSUE_ID
 * Incremental Column: UPDATED
 * 
 * Purpose: Persists external table data to avoid repeated OPENROWSET calls.
 *          Staging views (hash calculation) should reference this PSA table.
 */

{{ config(
    materialized='incremental',
    incremental_strategy='merge',
    unique_key='ISSUE_ID',
    as_columnstore=false
) }}

SELECT
    ISSUE_ID,
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
    dss_record_source,
    dss_load_date,
    dss_run_id,
    dss_stage_timestamp,
    dss_source_file_name

FROM {{ source('staging', 'ext_jira_issues') }}

{% if is_incremental() %}
WHERE UPDATED > (SELECT COALESCE(MAX(UPDATED), '1900-01-01') FROM {{ this }})
{% endif %}
