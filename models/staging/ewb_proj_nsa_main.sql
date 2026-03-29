/*
 * Staging Model: ewb_proj_nsa_main
 *
 * Source: ext_ewb_proj_nsa_main (PROJ.NSA.Main.parquet)
 * System: Abacus EWB
 * Business Key: PROJNR^^CODE^^PERIYEAR^^PERIMONTH^^GB^^DATASET (Composite)
 *
 * Hash Keys calculated here:
 *   - hk_projektsachkonto (Entity Hash Key)
 *   - hk_projekt (Foreign Key → hub_projekt)
 *   - hk_link_projektsachkonto_projekt (Link Hash Key)
 *   - hd_projektsachkonto (Hash Diff für Satellite)
 *
 * Developer: Daniel Fellner, MSc
 * Company:   ppmc analytics ag
 * Contact:   office@ppmcag.com
 * Version:   2026-07-14 V1.0 Initialversion
 */

{%- set hashdiff_columns = [
    'BUDGETINT',
    'BETRAGINT',
    'VORTRAGINT',
    'BUDGETEXT',
    'BETRAGEXT',
    'VORTRAGEXT',
    'AZBUTINT',
    'AZBETINT',
    'AZVORTINT',
    'AZBUTEXT',
    'AZBETEXT',
    'AZVORTEXT'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_ewb_proj_nsa_main') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEY (Entity)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256',
            CONCAT(
                ISNULL(CAST(PROJNR AS NVARCHAR(MAX)), ''), '^^',
                ISNULL(CAST(CODE AS NVARCHAR(MAX)), ''), '^^',
                ISNULL(CAST(PERIYEAR AS NVARCHAR(MAX)), ''), '^^',
                ISNULL(CAST(PERIMONTH AS NVARCHAR(MAX)), ''), '^^',
                ISNULL(CAST(GB AS NVARCHAR(MAX)), ''), '^^',
                ISNULL(CAST(DATASET AS NVARCHAR(MAX)), '')
            )
        ), 2) AS hk_projektsachkonto,

        -- ===========================================
        -- FOREIGN KEY (→ hub_projekt)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256',
            ISNULL(CAST(PROJNR AS NVARCHAR(MAX)), '')
        ), 2) AS hk_projekt,

        -- ===========================================
        -- LINK HASH KEY (→ link_projektsachkonto_projekt)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256',
            CONVERT(CHAR(64), HASHBYTES('SHA2_256',
                CONCAT(
                    ISNULL(CAST(PROJNR AS NVARCHAR(MAX)), ''), '^^',
                    ISNULL(CAST(CODE AS NVARCHAR(MAX)), ''), '^^',
                    ISNULL(CAST(PERIYEAR AS NVARCHAR(MAX)), ''), '^^',
                    ISNULL(CAST(PERIMONTH AS NVARCHAR(MAX)), ''), '^^',
                    ISNULL(CAST(GB AS NVARCHAR(MAX)), ''), '^^',
                    ISNULL(CAST(DATASET AS NVARCHAR(MAX)), '')
                )
            ), 2) + '^^' +
            CONVERT(CHAR(64), HASHBYTES('SHA2_256',
                ISNULL(CAST(PROJNR AS NVARCHAR(MAX)), '')
            ), 2)
        ), 2) AS hk_link_projektsachkonto_projekt,

        -- ===========================================
        -- HASH DIFF (Change Detection - Satellite)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256',
            CONCAT(
                {%- for col in hashdiff_columns %}
                ISNULL(CAST({{ col }} AS NVARCHAR(MAX)), ''){{ ',' if not loop.last else '' }}
                {%- endfor %}
            )
        ), 2) AS hd_projektsachkonto,

        -- ===========================================
        -- BUSINESS KEY(S)
        -- ===========================================
        PROJNR,
        CODE,
        PERIYEAR,
        PERIMONTH,
        GB,
        DATASET,

        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        BUDGETINT,
        BETRAGINT,
        VORTRAGINT,
        BUDGETEXT,
        BETRAGEXT,
        VORTRAGEXT,
        AZBUTINT,
        AZBETINT,
        AZVORTINT,
        AZBUTEXT,
        AZBETEXT,
        AZVORTEXT,

        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'ewb_abacus') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id

    FROM source
)

SELECT * FROM staged
