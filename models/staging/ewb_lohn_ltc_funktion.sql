/*
 * Staging View: ewb_lohn_ltc_funktion
 * Source: ext_ewb_lohn_ltc_main (LOHN.LTC.Main.parquet)
 * Pattern: Reference Table Source (keine Hash-Berechnung)
 * Target: ref_funktion_v
 *
 * Ergänzung zu ewb_lohn_ltc_main (Abteilungen, GROUP=1).
 * Diese View liefert LTC-Einträge für GROUP=41 (Funktionscodes) — Business Key ist ID
 * (Funktionscode aus CODE_2 in LOHN.LEN). GROUP=41 enthält alle 207 Funktionsbezeichnungen.
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
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE())  AS dss_load_date,
        ROW_NUMBER() OVER (PARTITION BY ID ORDER BY NR)            AS rn

    FROM source
    WHERE [GROUP] = 41
      AND ID IS NOT NULL
)

SELECT id, description, group_nr, dss_record_source, dss_load_date
FROM staged
WHERE rn = 1
