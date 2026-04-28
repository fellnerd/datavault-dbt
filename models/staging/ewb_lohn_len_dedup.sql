/*
 * Pre-Staging Deduplication: ewb_lohn_len_dedup
 *
 * Problem: LOHN.LEN.Main liefert eine Zeile pro Mitarbeiter × Lohnperiode
 *          (LPE_YEAR × LPE_MONTH). Dies führt in sat_person__abacus zu
 *          Pseudo-Historien (~26 Versionen pro Person statt echter SCD2).
 *
 * Fix: Reduzierung auf die aktuellste Lohnperiode pro EMPL_NR.
 *      LPE_YEAR/LPE_MONTH sind Perioden-Identifikatoren, keine Personenattribute.
 *
 * Downstream: ewb_lohn_len_main (automate_dv.stage) liest diesen View als Source.
 */

{{ config(materialized='view') }}

WITH latest_period AS (
    SELECT
        EMPL_NR,
        MAX(
            TRY_CAST(LPE_YEAR AS INT) * 100 + TRY_CAST(LPE_MONTH AS INT)
        ) AS max_period_key
    FROM {{ source('staging', 'ext_ewb_lohn_len_main') }}
    WHERE EMPL_NR IS NOT NULL
    GROUP BY EMPL_NR
)

SELECT src.*
FROM {{ source('staging', 'ext_ewb_lohn_len_main') }} src
INNER JOIN latest_period lp
    ON  src.EMPL_NR = lp.EMPL_NR
    AND TRY_CAST(src.LPE_YEAR AS INT) * 100 + TRY_CAST(src.LPE_MONTH AS INT) = lp.max_period_key
