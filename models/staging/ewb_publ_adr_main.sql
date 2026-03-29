/*
 * Staging Model: ewb_publ_adr_main
 *
 * Source: ext_ewb_publ_adr_main
 * Business Key: INR
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 *
 * Links (Foreign Keys):
 *   - _common.hub_person via lohnnr
 *
 * Hash Keys calculated here (automate_dv pattern):
 *   - hk_adresse (Entity Hash Key)
 *   - hk_person (FK Hash Key for _common.hub_person via lohnnr)
 *   - hk_link_adresse_person (Link Hash Key)
 */

{%- set hashdiff_person_adresse_columns = [
    'name',
    'vorname'
] -%}

{%- set hashdiff_adresse_kontakt_columns = [
    'ort',
    'plz',
    'street'
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
            ISNULL(LTRIM(RTRIM(CAST(INR AS NVARCHAR(MAX)))), '-1')
        ), 2) AS hk_adresse,

        -- ===========================================
        -- FK HASH KEYS (for Links)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(LTRIM(RTRIM(CAST(lohnnr AS NVARCHAR(MAX)))), '-1')
        ), 2) AS hk_person,

        -- ===========================================
        -- LINK HASH KEYS
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                ISNULL(LTRIM(RTRIM(CAST(INR AS NVARCHAR(MAX)))), '-1'),
                '^^',
                ISNULL(LTRIM(RTRIM(CAST(lohnnr AS NVARCHAR(MAX)))), '-1')
            )
        ), 2) AS hk_link_adresse_person,

        -- ===========================================
        -- HASH DIFFS (Change Detection - Multi-Satellite)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                {%- for col in hashdiff_person_adresse_columns %}
                ISNULL(LTRIM(RTRIM(CAST({{ col }} AS NVARCHAR(MAX)))), '-1'){{ ',' if not loop.last else '' }}
                {%- endfor %}
                {%- if hashdiff_person_adresse_columns | length == 1 %}, ''{%- endif %}
            )
        ), 2) AS hd_person_adresse,
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                {%- for col in hashdiff_adresse_kontakt_columns %}
                ISNULL(LTRIM(RTRIM(CAST({{ col }} AS NVARCHAR(MAX)))), '-1'){{ ',' if not loop.last else '' }}
                {%- endfor %}
                {%- if hashdiff_adresse_kontakt_columns | length == 1 %}, ''{%- endif %}
            )
        ), 2) AS hd_adresse_kontakt,

        -- ===========================================
        -- BUSINESS KEY(S)
        -- ===========================================
        INR,

        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        name,
        vorname,
        plz,
        ort,
        street,
        lohnnr,
        lohnjn,
        gesperrt,

        -- ===========================================
        -- METADATA
        -- ===========================================
        CONCAT_WS('||', 'default', 'default',
            ISNULL(LTRIM(RTRIM(CAST(INR AS NVARCHAR(MAX)))), '-1')
        ) AS dss_business_key,
        GETDATE() AS dss_create_datetime,
        COALESCE(dss_record_source, 'ewb_abacus') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id

    FROM source
)

SELECT * FROM staged