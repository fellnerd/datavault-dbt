/*
 * Faktentabelle: fakt_stunden
 * Schema: mart_project
 *
 * Projektsachkonto-Buchungen (Stunden/Kosten pro Projekt und Periode).
 * Repliziert Synapse structured-table [Projekt].[Stunden].
 *
 * Granularitaet: 1 Zeile = 1 Projektsachkonto-Buchung
 *   (PROJNR + CODE + PERIYEAR + PERIMONTH + GB + DATASET)
 *
 * FK-Beziehungen (Star Schema):
 *   - ProjektNr    → dim_projekt.ProjektNr
 *   - LeistungsartNr → dim_leistungsart.LeistungsartNr
 *   - DatumKey     → dim_date.date_key
 *
 * Measures:
 *   - Betrag (AZBETINT) — Ist-Betrag intern
 *
 * Quell-Vault-Objekte:
 *   - hub_projektsachkonto + sat_projektsachkonto (PROJ.NSA)
 *   - link_projektsachkonto_projekt → hub_projekt (NSA → NPO)
 *
 * KORREKTUR gegenueber Synapse:
 *   - Synapse: NSA.PROJNR = ADR.LOHNNR (PersonalNr) — FEHLERHAFT
 *     Nur 2.5% der NSA.PROJNR matchen ADR.LOHNNR
 *   - DV-Korrektur: NSA.PROJNR = NPO.PROJNR (ProjektNr)
 *     97.5% Match bestaetigt (Datenanalyse 2025-03-14)
 *
 * Business-Logik:
 *   1. Filter: AZBETINT <> 0 (nur Eintraege mit Betrag)
 *   2. DatumKey: DATEFROMPARTS(PERIYEAR, PERIMONTH, 1) → dim_date.date_key
 */

{{ config(
    materialized='table',
    as_columnstore=false,
    tags=['fact'],
    post_hook=[
        "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_fakt_stunden_projekt' AND object_id = OBJECT_ID('{{ this }}')) CREATE NONCLUSTERED INDEX ix_fakt_stunden_projekt ON {{ this }} (ProjektNr)",
        "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_fakt_stunden_datum' AND object_id = OBJECT_ID('{{ this }}')) CREATE NONCLUSTERED INDEX ix_fakt_stunden_datum ON {{ this }} (DatumKey)",
        "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_fakt_stunden_leistungsart' AND object_id = OBJECT_ID('{{ this }}')) CREATE NONCLUSTERED INDEX ix_fakt_stunden_leistungsart ON {{ this }} (LeistungsartNr)"
    ]
) }}

SELECT
    CAST(hp.projnr AS INT)               AS ProjektNr,
    CAST(hpsk.code AS INT)               AS LeistungsartNr,
    CAST(FORMAT(
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
    ) AS INT)                             AS DatumKey,
    spsk.azbetint                         AS Betrag,
    hpsk.gb                               AS GB,
    CAST(hpsk.dataset AS INT)             AS Dataset
FROM {{ ref('hub_projektsachkonto') }} hpsk
INNER JOIN {{ ref('sat_projektsachkonto') }} spsk
    ON hpsk.hk_projektsachkonto = spsk.hk_projektsachkonto
    AND spsk.dss_is_current = 'Y'
INNER JOIN {{ ref('link_projektsachkonto_projekt') }} lpp
    ON hpsk.hk_projektsachkonto = lpp.hk_projektsachkonto
INNER JOIN {{ ref('hub_projekt') }} hp
    ON lpp.hk_projekt = hp.hk_projekt
WHERE spsk.azbetint <> 0
