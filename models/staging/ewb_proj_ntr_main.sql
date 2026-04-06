/*
 * Staging View: ewb_proj_ntr_main
 * Source: ext_ewb_proj_ntr_main (PROJ.NTR.Main.parquet)
 * Pattern: Reference Table Source (keine Hash-Berechnung)
 * Target: ref_leistungsart
 *
 * Developer: Daniel Fellner, MSc
 * Company:   ppmc analytics ag
 * Contact:   office@ppmcag.com
 * Version:   2025-07-14 V1.0 Initialversion
 *
 * Columns:
 *   NUMBER      — Primary Key (Leistungsart-Code: 1000, 1010, 1020, etc.)
 *   DESCRIPTION — Bezeichnung der Leistungsart
 *   TYPE        — Typ
 *   INAKTIV     — Inaktiv-Flag
 *
 * Hinweis: NTR hat ~1000 Zeilen über 3 Datasets aber nur 29 distinct NUMBER-Werte.
 *          DATASET=2 enthält die vollständigen Definitionen.
 *          SELECT DISTINCT + WHERE DATASET=2 dedupliziert auf 29 Leistungsarten.
 */

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_ewb_proj_ntr_main') }}
),

deduplicated AS (
    SELECT DISTINCT
        NUMBER,
        DESCRIPTION,
        [TYPE],
        INAKTIV
    FROM source
    WHERE DATASET = 2
),

staged AS (
    SELECT
        CAST(NUMBER AS INT)                                         AS number,
        DESCRIPTION                                                 AS description,
        CAST([TYPE] AS INT)                                         AS type,
        CAST(INAKTIV AS INT)                                        AS inaktiv,
        'ewb_abacus'                                                AS dss_record_source,
        GETDATE()                                                   AS dss_load_date

    FROM deduplicated
)

SELECT * FROM staged
