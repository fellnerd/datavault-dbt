/*
 * Staging Model: ewb_publ_adr_main
 *
 * Source: ext_ewb_publ_adr_main
 * Business Key: INR
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 *
 * Hash Keys calculated here (automate_dv pattern):
 *   - hk_adresse (Entity Hash Key)
 */

{%- set hashdiff_columns = [
    'name',
    'vorname'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_ewb_publ_adr_main') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEY (Entity)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(INR AS NVARCHAR(MAX)), '')
        ), 2) AS hk_adresse,

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
        ), 2) AS hd_person_adresse,

        -- ===========================================
        -- BUSINESS KEY(S)
        -- ===========================================
        INR,

        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        name,
        vorname,

        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'ewb_abacus') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id

    FROM source
)

SELECT * FROM staged