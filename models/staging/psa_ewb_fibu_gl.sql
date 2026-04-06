/*
 * Persistent Staging Area: psa_ewb_fibu_gl
 *
 * Source: ext_ewb_fibu_gl (PolyBase Folder-Scan über 12 FIBU/GL Jahresscheiben E15-E26)
 * Strategy: append (GL-Einträge sind unveränderlich — neue Daten = neue dss_load_date)
 * Unique Key: RECNUM + dss_source_file_name (RECNUM nur innerhalb einer Jahresscheibe unique)
 *
 * Zweck: Cached alle GL-Zeilen aus ADLS in einer lokalen SQL-Tabelle, um wiederholte
 *        teure PolyBase-Scans (12 Parquet-Files × 3 CTEs = ~240M logical reads) zu vermeiden.
 *        Staging View ewb_fibu_gl referenziert diese PSA statt ext_ewb_fibu_gl direkt.
 *
 * Performance-Impact:
 *   Ohne PSA: sat_hauptbuch__abacus = ~300s (240M reads via PolyBase)
 *   Mit PSA:  sat_hauptbuch__abacus = <10s  (lokale SQL-Tabelle, Index auf hk)
 */

{{ config(
    materialized='incremental',
    incremental_strategy='append',
    as_columnstore=false
) }}

SELECT
    CAST(RECNUM AS DECIMAL(38,18))             AS RECNUM,
    CAST([DATE] AS DATETIME2)                  AS [DATE],
    CAST(BELNR AS NVARCHAR(4000))              AS BELNR,
    CAST(KTO AS DECIMAL(38,18))                AS KTO,
    CAST(GKTO AS DECIMAL(38,18))               AS GKTO,
    CAST(SAM AS NVARCHAR(4000))                AS SAM,
    CAST([TEXT] AS NVARCHAR(4000))             AS [TEXT],
    CAST(BETRAG AS DECIMAL(38,18))             AS BETRAG,
    CAST(SH AS NVARCHAR(4000))                 AS SH,
    CAST(KST AS DECIMAL(38,18))                AS KST,
    CAST(WAEHR AS NVARCHAR(4000))              AS WAEHR,
    CAST(FRW AS DECIMAL(38,18))                AS FRW,
    CAST(FWAUTO AS NVARCHAR(4000))             AS FWAUTO,
    CAST(FBETR AS DECIMAL(38,18))              AS FBETR,
    CAST(KST2 AS DECIMAL(38,18))               AS KST2,
    CAST(TEXT2 AS NVARCHAR(4000))              AS TEXT2,
    CAST(SAMNR AS DECIMAL(38,18))              AS SAMNR,
    CAST(PROJ AS DECIMAL(38,18))               AS PROJ,
    CAST(COMPANY AS DECIMAL(38,18))            AS COMPANY,
    CAST(CODE AS NVARCHAR(4000))               AS CODE,
    CAST(KORR AS DECIMAL(38,18))               AS KORR,
    CAST(GPROJ AS DECIMAL(38,18))              AS GPROJ,
    CAST(MWSTKTO AS DECIMAL(38,18))            AS MWSTKTO,
    CAST(MWSTINCL AS NVARCHAR(4000))           AS MWSTINCL,
    CAST(ISO AS NVARCHAR(4000))                AS ISO,
    CAST(MWSTBETR AS DECIMAL(38,18))           AS MWSTBETR,
    CAST(DIVISION AS DECIMAL(38,18))           AS DIVISION,
    CAST(MANDANT AS DECIMAL(38,18))            AS MANDANT,
    CAST(MWSTSATZ AS DECIMAL(38,18))           AS MWSTSATZ,
    CAST(MWSTTYP AS DECIMAL(38,18))            AS MWSTTYP,
    CAST(MWSTCODE AS NVARCHAR(4000))           AS MWSTCODE,
    CAST(MWSTMONAT AS DECIMAL(38,18))          AS MWSTMONAT,
    CAST(MWSTJAHR AS DECIMAL(38,18))           AS MWSTJAHR,
    CAST(MWSTLAND AS NVARCHAR(4000))           AS MWSTLAND,
    CAST(MWSTMETH AS DECIMAL(38,18))           AS MWSTMETH,
    CAST(PROJEBENE AS DECIMAL(38,18))          AS PROJEBENE,
    CAST(DKBELEGNUMMER AS DECIMAL(38,18))      AS DKBELEGNUMMER,
    CAST(DKKUNDENNUMMER AS DECIMAL(38,18))     AS DKKUNDENNUMMER,
    CAST(DKPOSNUMMER AS DECIMAL(38,18))        AS DKPOSNUMMER,
    CAST([timestamp_landing-zone] AS NVARCHAR(4000)) AS [timestamp_landing-zone],
    CAST(dss_record_source AS NVARCHAR(4000))  AS dss_record_source,
    COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
    CAST(dss_run_id AS NVARCHAR(4000))         AS dss_run_id,
    CAST(dss_stage_timestamp AS NVARCHAR(4000)) AS dss_stage_timestamp,
    CAST(dss_source_file_name AS NVARCHAR(4000)) AS dss_source_file_name

FROM {{ source('staging', 'ext_ewb_fibu_gl') }}

{% if is_incremental() %}
WHERE COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE())
    > (SELECT COALESCE(MAX(dss_load_date), '1900-01-01') FROM {{ this }})
{% endif %}
