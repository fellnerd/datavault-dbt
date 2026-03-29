/*
 * Staging Model: ewb_proj_ntc_main
 *
 * Source: ext_ewb_proj_ntc_main (PROJ.NTC.Main.parquet)
 * Business Key: EMPLNR ^^ PROJDAT (zusammengesetzter BK, DV 2.1 Standard)
 * Hash Key Separator: '^^'
 *
 * Hash Keys calculated here (automate_dv pattern):
 *   - hk_zeiterfassung              (Entity Hash Key — Hub)
 *   - hk_person                     (Cross-Reference — FK zu hub_person aus LEN.EMPL_NR)
 *   - hk_link_zeiterfassung_person  (Link Hash Key = SHA2_256(hk_zeiterfassung ^^ hk_person))
 *
 * Payload (25 Spalten):
 *   - RECNUM, DATASET               (technische Zeilenfelder)
 *   - FROM1..FROM10, TO1..TO10      (10 Zeitintervall-Paare "von"/"bis")
 *   - ANZAHL                        (Stunden)
 *   - USER_F                        (letzter Benutzer)
 *   - MUTDAT                        (Mutationsdatum)
 *
 * Entfernt:
 *   - VARDATA         (VARBINARY(MAX), kein Mehrwert für DV)
 *   - timestamp_landing-zone (Bindestrich im Spaltennamen — nicht referenzierbar)
 *
 * Developer: Daniel Fellner, MSc
 * Company:   ppmc analytics ag
 * Contact:   office@ppmcag.com
 * Version:   2026-03-26 V1.0 Initialversion
 */

{%- set hashdiff_columns = [
    'DATASET',
    'FROM1',
    'TO1',
    'FROM2',
    'TO2',
    'FROM3',
    'TO3',
    'FROM4',
    'TO4',
    'FROM5',
    'TO5',
    'FROM6',
    'TO6',
    'FROM7',
    'TO7',
    'FROM8',
    'TO8',
    'FROM9',
    'TO9',
    'FROM10',
    'TO10',
    'ANZAHL',
    'USER_F',
    'MUTDAT'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_ewb_proj_ntc_main') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEYS (Entities & Link)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256',
            ISNULL(LTRIM(RTRIM(CAST(EMPLNR AS NVARCHAR(MAX)))), '-1') + '^^' +
            ISNULL(LTRIM(RTRIM(CONVERT(NVARCHAR(MAX), PROJDAT, 126))), '-1')
        ), 2) AS hk_zeiterfassung,

        -- Cross-Reference: hk_person für Link (EMPLNR = EMPL_NR in LEN)
        CONVERT(CHAR(64), HASHBYTES('SHA2_256',
            ISNULL(LTRIM(RTRIM(CAST(EMPLNR AS NVARCHAR(MAX)))), '-1')
        ), 2) AS hk_person,

        -- Link Hash Key: link_zeiterfassung_person
        CONVERT(CHAR(64), HASHBYTES('SHA2_256',
            CONVERT(CHAR(64), HASHBYTES('SHA2_256',
                ISNULL(LTRIM(RTRIM(CAST(EMPLNR AS NVARCHAR(MAX)))), '-1') + '^^' +
                ISNULL(LTRIM(RTRIM(CONVERT(NVARCHAR(MAX), PROJDAT, 126))), '-1')
            ), 2) + '^^' +
            CONVERT(CHAR(64), HASHBYTES('SHA2_256',
                ISNULL(LTRIM(RTRIM(CAST(EMPLNR AS NVARCHAR(MAX)))), '-1')
            ), 2)
        ), 2) AS hk_link_zeiterfassung_person,

        -- ===========================================
        -- HASH DIFF (Change Detection - Satellite)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256',
            CONCAT(
                {%- for col in hashdiff_columns %}
                ISNULL(LTRIM(RTRIM(CAST({{ col }} AS NVARCHAR(MAX)))), '-1'){{ ',' if not loop.last else '' }}
                {%- endfor %}
            )
        ), 2) AS hd_zeiterfassung,

        -- ===========================================
        -- BUSINESS KEYS
        -- ===========================================
        EMPLNR,     -- Mitarbeiternummer (FK → hub_person)
        PROJDAT,    -- Projektdatum (Zeiterfassungstag)

        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        -- Technische Felder
        RECNUM,
        DATASET,

        -- Zeitintervalle (10 Paare "von" / "bis")
        FROM1,  TO1,
        FROM2,  TO2,
        FROM3,  TO3,
        FROM4,  TO4,
        FROM5,  TO5,
        FROM6,  TO6,
        FROM7,  TO7,
        FROM8,  TO8,
        FROM9,  TO9,
        FROM10, TO10,

        -- Stunden & Audit
        ANZAHL,     -- Gesamtstunden
        USER_F,     -- Letzter bearbeitender Benutzer
        MUTDAT,     -- Mutationsdatum

        -- ===========================================
        -- METADATA
        -- ===========================================
        CONCAT_WS('||', 'default', 'default',
            ISNULL(LTRIM(RTRIM(CAST(EMPLNR AS NVARCHAR(MAX)))), '-1'),
            ISNULL(LTRIM(RTRIM(CONVERT(NVARCHAR(MAX), PROJDAT, 126))), '-1')
        ) AS dss_business_key,
        GETDATE() AS dss_create_datetime,
        COALESCE(dss_record_source, 'ewb_abacus') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id

    FROM source
)

SELECT * FROM staged
