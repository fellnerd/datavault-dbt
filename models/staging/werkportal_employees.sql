/*
 * Staging Model: werkportal_employees
 *
 * Source: ext_werkportal_public_wp_employees
 * Business Key: object_id
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 */

{%- set hashdiff_columns = [
    'available_from',
    'company_client',
    'description',
    'name',
    'profession_id',
    'state',
    'subprofession_id',
    'subscription'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_werkportal_public_wp_employees') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEY (Entity)
        -- ===========================================
        -- Note: FK hash keys are calculated in Link models, not in staging
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(object_id AS NVARCHAR(MAX)), '')
        ), 2) AS hk_employees,

        -- ===========================================
        -- HASH DIFF (Change Detection)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                {%- for col in hashdiff_columns %}
                ISNULL(CAST({{ col }} AS NVARCHAR(MAX)), ''){{ ',' if not loop.last else '' }}
                {%- endfor %}
            )
        ), 2) AS hd_employees,

        -- ===========================================
        -- BUSINESS KEY(S)
        -- ===========================================
        object_id,

        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        date_created,
        date_updated,
        subscription,
        name,
        state,
        subprofession_id,
        profession_id,
        company_client,
        available_from,
        description,

        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'werkportal') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id

    FROM source
)

SELECT * FROM staged