/*
 * Reference Table: ref_vorgang_status
 * 
 * Source: ext_jira_issuestatuses
 * Primary Key: issue_status_id, scope_id
 * 
 * Pattern: Non-historised Reference Table (Data Vault 2.0)
 * Purpose: Lookup/reference data for jira
 * Usage: JOIN with satellite tables in Mart layer
 */

{{ config(
    materialized='table',
    schema='vault_jira'
) }}

SELECT DISTINCT
    ISSUE_STATUS_ID AS issue_status_id,
    ISSUE_STATUS_NAME AS issue_status_name,
    DESCRIPTION AS description,
    CATEGORY AS category,
    SCOPE_ID AS scope_id,
    dss_load_date,
    dss_record_source

FROM {{ source('staging', 'ext_jira_issuestatuses') }}
WHERE ISSUE_STATUS_ID IS NOT NULL AND SCOPE_ID IS NOT NULL
