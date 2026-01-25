/*
 * Staging Model: jira_comments_seed
 *
 * Source: test_jira_comments
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 *
 * Links (Foreign Keys):
 *   - jira.hub_vorgang via issue_id
 *
 * Dependent Child Keys (for DC Satellites):
 *   - jira.hub_vorgang: comment_author, comment_date
 *
 * Hash Keys calculated here (automate_dv pattern):
 *   - hk_comments_seed (Entity Hash Key)
 *   - hk_vorgang (FK Hash Key for jira.hub_vorgang)
 *   - hk_link_comments_seed_vorgang (Link Hash Key)
 */

{%- set hashdiff_columns = [
    'comment_text',
    'issue_key'
] -%}

WITH source AS (
    SELECT 
        *,
        'jira' AS dss_record_source,
        GETDATE() AS dss_load_date
    FROM {{ ref('test_jira_comments') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- FK HASH KEYS (for Links)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(issue_id AS NVARCHAR(MAX)), '')
        ), 2) AS hk_vorgang,

        -- ===========================================
        -- LINK HASH KEYS
        -- ===========================================
        -- Link with DCK: comment_author, comment_date
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                ISNULL(CAST(issue_id AS NVARCHAR(MAX)), ''),
                '^^',
                ISNULL(CAST(comment_author AS NVARCHAR(MAX)), ''),
                '^^',
                ISNULL(CAST(comment_date AS NVARCHAR(MAX)), '')
            )
        ), 2) AS hk_link_comments_seed_vorgang,

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
        ), 2) AS hd_comments_seed,

        -- ===========================================
        -- HASH DIFF (DC Satellites)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                ISNULL(CAST(comment_author AS NVARCHAR(MAX)), ''),
                '^^',
                ISNULL(CAST(comment_date AS NVARCHAR(MAX)), ''),
                '^^',
                ISNULL(CAST(comment_text AS NVARCHAR(MAX)), ''),
                '^^',
                ISNULL(CAST(issue_key AS NVARCHAR(MAX)), '')
            )
        ), 2) AS hd_comments_seed_vorgang_dc,

        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        issue_id,
        comment_author,
        comment_date,
        issue_key,
        comment_text,

        -- ===========================================
        -- METADATA
        -- ===========================================
        dss_record_source,
        dss_load_date

    FROM source
)

SELECT * FROM staged