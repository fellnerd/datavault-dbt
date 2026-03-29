/*
 * Faktentabelle: fakt_stunden
 * Schema: mart_project
 *
 * Projektsachkonto-Buchungen (Stunden/Kosten pro Projekt und Periode).
 * Repliziert Synapse [Projekt].[Stunden].
 *
 * Granularitaet: 1 Zeile pro Projektsachkonto-Buchung
 * Filter: AZBETINT <> 0
 *
 * KORREKTUR: NSA.PROJNR = ProjektNr (nicht PersonalNr wie in Synapse)
 */

{{ config(
    materialized='view',
    tags=['fact']
) }}

SELECT
    ABS(CONVERT(BIGINT, HASHBYTES('MD5', CAST(hp.projnr AS NVARCHAR(MAX)))))   AS projekt_key,
    ABS(CONVERT(BIGINT, HASHBYTES('MD5', CAST(hpsk.code AS NVARCHAR(MAX)))))   AS leistungsart_key,
    TRY_CAST(FORMAT(
        DATEFROMPARTS(
            CASE WHEN COALESCE(TRY_CAST(hpsk.periyear AS INT), 1900) = 0
                 THEN 1900
                 ELSE COALESCE(TRY_CAST(hpsk.periyear AS INT), 1900)
            END,
            CASE WHEN COALESCE(TRY_CAST(hpsk.perimonth AS INT), 1) = 0
                 THEN 1
                 ELSE COALESCE(TRY_CAST(hpsk.perimonth AS INT), 1)
            END,
            1
        ), 'yyyyMMdd'
    ) AS INT)                             AS datum_key,
    -- Measures
    spsk.azbetint                         AS betrag,
    -- Degenerate Dimensions
    hpsk.gb                               AS gb,
    CAST(hpsk.dataset AS INT)             AS dataset,
    -- Metadata
    spsk.dss_load_date,
    spsk.dss_record_source
FROM {{ ref('hub_projektsachkonto') }} hpsk
INNER JOIN {{ ref('sat_projektsachkonto') }} spsk
    ON hpsk.hk_projektsachkonto = spsk.hk_projektsachkonto
    AND spsk.dss_is_current = 'Y'
INNER JOIN {{ ref('link_projektsachkonto_projekt') }} lpp
    ON hpsk.hk_projektsachkonto = lpp.hk_projektsachkonto
INNER JOIN {{ ref('hub_projekt') }} hp
    ON lpp.hk_projekt = hp.hk_projekt
WHERE spsk.azbetint <> 0
