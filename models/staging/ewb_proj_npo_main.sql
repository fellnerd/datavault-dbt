/*
 * Staging Model: ewb_proj_npo_main
 *
 * Source: ext_ewb_proj_npo_main
 * Business Key: PROJNR
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 *
 * Hash Keys calculated here (automate_dv pattern):
 *   - hk_projekt (Entity Hash Key)
 */

{%- set hashdiff_columns = [
    'creation',
    'inaktiv',
    'projgroup',
    'projname',
    'refprojnr',
    '[status]',
    'status1',
    'statusdef'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_ewb_proj_npo_main') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEY (Entity)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(LTRIM(RTRIM(CAST(PROJNR AS NVARCHAR(MAX)))), '-1')
        ), 2) AS hk_projekt,

        -- ===========================================
        -- HASH DIFF (Change Detection - Satellite)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                {%- for col in hashdiff_columns %}
                ISNULL(LTRIM(RTRIM(CAST({{ col }} AS NVARCHAR(MAX)))), '-1'){{ ',' if not loop.last else '' }}
                {%- endfor %}
                {%- if hashdiff_columns | length == 1 %}, ''{%- endif %}
            )
        ), 2) AS hd_projekt,

        -- ===========================================
        -- BUSINESS KEY(S)
        -- ===========================================
        PROJNR,

        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        refprojnr,
        inaktiv,
        projgroup,
        projname,
        statusdef,
        [status],
        status1,
        creation,

        -- ===========================================
        -- METADATA
        -- ===========================================
        CONCAT_WS('||', 'default', 'default',
            ISNULL(LTRIM(RTRIM(CAST(PROJNR AS NVARCHAR(MAX)))), '-1')
        ) AS dss_business_key,
        GETDATE() AS dss_create_datetime,
        COALESCE(dss_record_source, 'ewb_abacus') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id

    FROM source
)

SELECT * FROM staged