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
 *
 * NSA.CODE = Projektsachkonto-Code (383 distinct Werte):
 *   - 1000er: Leistungsarten (Normalzeit, Überzeit, Ferien) → 17% der Rows
 *   - Übrige: Kostensachkonten ohne Leistungsart-Beschreibung → 83% der Rows
 *   sachkonto_code: immer befüllt (Degenerate Dimension)
 *   leistungsart_key: nullable FK — nur gesetzt wenn CODE in ref_leistungsart
 */

{{ config(
    materialized='view',
    tags=['fact']
) }}

SELECT
    {{ surrogate_key('hp.projnr') }}   AS projekt_key,
    -- Nullable FK: nur ~17% der Rows haben eine echte Leistungsart (1000er-Codes)
    la.leistungsart_key                 AS leistungsart_key,
    -- Degenerate Dimension: immer befüllt (alle 383 Sachkonto-Codes)
    CAST(hpsk.code AS INT)              AS sachkonto_code,
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
    ) AS INT)                             AS perioden_date_key,
    -- Measures
    spsk.azbetint                         AS betrag,
    -- Degenerate Dimensions
    hpsk.gb                               AS gb,
    CAST(hpsk.dataset AS INT)             AS dataset,
    -- Metadata
    spsk.dss_load_date,
    spsk.dss_record_source
FROM {{ ref('hub_projektsachkonto') }} hpsk
INNER JOIN {{ ref('sat_projektsachkonto__abacus_current_v') }} spsk
    ON hpsk.hk_projektsachkonto = spsk.hk_projektsachkonto
INNER JOIN {{ ref('link_projektsachkonto_projekt') }} lpp
    ON hpsk.hk_projektsachkonto = lpp.hk_projektsachkonto
INNER JOIN {{ ref('hub_projekt') }} hp
    ON lpp.hk_projekt = hp.hk_projekt
-- LEFT JOIN: Leistungsart nur für 1000er-Codes vorhanden (17% der Rows)
LEFT JOIN {{ ref('dim_leistungsart_v') }} la
    ON CAST(hpsk.code AS INT) = TRY_CAST(la.leistungsart_id AS INT)
WHERE spsk.azbetint <> 0
