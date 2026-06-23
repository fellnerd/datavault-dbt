/*
 * Staging View: ewb_lohn_ltc_funktion
 * Source: ext_ewb_lohn_ltc_main (LOHN.LTC.Main.parquet)
 * Pattern: Reference Table Source (keine Hash-Berechnung)
 * Target: ref_funktion_v
 *
 * Ergänzung zu ewb_lohn_ltc_main (Abteilungen).
 * Diese View liefert alle LTC-Einträge ungefiltert — Business Key ist ID
 * (Funktionscode aus CODE_2 in LOHN.LEN).
 *
 * Columns:
 *   ID       — Primary Key (Funktionscode, z.B. CODE_2 aus LEN)
 *   TEXT     — Funktionsbezeichnung
 *   [GROUP]  — Gruppierungsebene — Reserved Keyword!
 */

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_ewb_lohn_ltc_main') }}
),

staged AS (
    SELECT
        ID                                                          AS id,
        TEXT                                                        AS description,
        [GROUP]                                                     AS group_nr,
        COALESCE(dss_record_source, 'ewb_abacus')                  AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE())  AS dss_load_date

    FROM source
    WHERE ID IS NOT NULL
)

SELECT * FROM staged
