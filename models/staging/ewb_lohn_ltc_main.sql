/*
 * Staging View: ewb_lohn_ltc_main
 * Source: ext_ewb_lohn_ltc_main (LOHN.LTC.Main.parquet)
 * Pattern: Reference Table Source (keine Hash-Berechnung)
 * Target: ref_abteilung
 *
 * Columns:
 *   NR          — Primary Key (Abteilungsnummer)
 *   DESCRIPTION — Abteilungsbezeichnung
 *   [GROUP]     — Gruppierungsebene (=1 für Abteilungen) — Reserved Keyword!
 */

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_ewb_lohn_ltc_main') }}
),

staged AS (
    SELECT
        NR                                                          AS nr,
        TEXT                                                        AS description,
        [GROUP]                                                     AS group_nr,
        COALESCE(dss_record_source, 'ewb_abacus')                  AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE())  AS dss_load_date

    FROM source
    WHERE [GROUP] = 1
)

SELECT * FROM staged
