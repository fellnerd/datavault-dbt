/*
 * Staging Model: ewb_fibu_fhe_main
 *
 * Source: ext_ewb_fibu_fhe_main (FIBU.FHE.Main.parquet)
 * System: Abacus EWB
 * Business Key: RECNUM (Datensatznummer)
 *
 * Hash Keys calculated here:
 *   - hk_ewb_fibu_fhe (Entity Hash Key)
 *   - hd_ewb_fibu_fhe (Hash Diff für Satellite)
 *
 * Developer: Daniel Fellner, MSc
 * Company:   ppmc analytics ag
 * Contact:   office@ppmcag.com
 * Version:   2026-03-09 V1.0 Initialversion
 */

{%- set hashdiff_columns = [
    '[PLAN]',
    'VARIANTE',
    '[LEVEL]',
    'ID',
    'TYP',
    'REF_LEVEL',
    'REF_ID',
    'REF_TYP',
    'BOTTOM',
    'FONTID',
    'BEFORE',
    'AFTER',
    'BOLDSW',
    'ULINESW',
    'ITALICSW',
    'SUPPRESS',
    'NONUM',
    'FORMFEED',
    'INDENT',
    'NODEFAULT',
    'DECIMALS',
    'SYSSW1',
    'SYSSW2',
    'SYSSW3',
    'SYSSW4',
    'SYSDAT1',
    'SYSDAT2',
    'APPSW1',
    'APPSW2',
    'APPSW3',
    'APPSW4',
    'APPSW5',
    'APPSW6',
    'APPSW7',
    'APPSW8',
    'APPSW9',
    'APPSW10',
    'APPNUM1',
    'APPNUM2',
    'APPNUM3',
    'APPNUM4',
    'APPNUM5',
    'APPNUM6',
    'APPDAT1',
    'APPDAT2',
    'CREUSER',
    'MUTUSER',
    'CREDAT',
    'MUTDAT',
    'ZUONR',
    'ID_ASCII',
    'IDTYP_ASCII',
    'ENTERPRISE',
    'GUID',
    'APPGUID1',
    'APPGUID2',
    'APPGUID3'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_ewb_fibu_fhe_main') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEY (Entity)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256',
            ISNULL(CAST(RECNUM AS NVARCHAR(MAX)), '')
        ), 2) AS hk_ewb_fibu_fhe,

        -- ===========================================
        -- HASH DIFF (Change Detection - Satellite)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256',
            CONCAT(
                {%- for col in hashdiff_columns %}
                ISNULL(CAST({{ col }} AS NVARCHAR(MAX)), ''){{ ',' if not loop.last else '' }}
                {%- endfor %}
            )
        ), 2) AS hd_ewb_fibu_fhe,

        -- ===========================================
        -- BUSINESS KEY
        -- ===========================================
        RECNUM,

        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        [PLAN],
        VARIANTE,
        [LEVEL],
        ID,
        TYP,
        REF_LEVEL,
        REF_ID,
        REF_TYP,
        BOTTOM,
        FONTID,
        BEFORE,
        AFTER,
        BOLDSW,
        ULINESW,
        ITALICSW,
        SUPPRESS,
        NONUM,
        FORMFEED,
        INDENT,
        NODEFAULT,
        DECIMALS,
        SYSSW1,
        SYSSW2,
        SYSSW3,
        SYSSW4,
        SYSDAT1,
        SYSDAT2,
        APPSW1,
        APPSW2,
        APPSW3,
        APPSW4,
        APPSW5,
        APPSW6,
        APPSW7,
        APPSW8,
        APPSW9,
        APPSW10,
        APPNUM1,
        APPNUM2,
        APPNUM3,
        APPNUM4,
        APPNUM5,
        APPNUM6,
        APPSTR,
        APPDAT1,
        APPDAT2,
        CREUSER,
        MUTUSER,
        CREDAT,
        MUTDAT,
        ZUONR,
        ID_ASCII,
        IDTYP_ASCII,
        ENTERPRISE,
        GUID,
        APPGUID1,
        APPGUID2,
        APPGUID3,

        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'ewb_abacus') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id

    FROM source
)

SELECT * FROM staged
