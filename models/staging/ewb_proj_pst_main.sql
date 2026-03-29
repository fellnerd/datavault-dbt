/*
 * Staging View: ewb_proj_pst_main
 * Source: ext_ewb_proj_pst_main (PROJ.PST.Main.parquet)
 * Pattern: Reference Table Source (keine Hash-Berechnung)
 * Target: ref_projektstatus
 *
 * Developer: Daniel Fellner, MSc
 * Company:   ppmc analytics ag
 * Contact:   office@ppmcag.com
 * Version:   2025-07-14 V1.0 Initialversion
 *
 * Columns:
 *   STATUS   — Primary Key (Statuscode)
 *   BEZEICHN — Bezeichnung des Projektstatus
 *   LANGCODE — Sprachcode
 *
 * Hinweis: Synapse filtert WHERE LEN(TRIM(BEZEICHN)) > 2 —
 *          diese Logik gehoert in den Mart, NICHT ins Staging.
 */

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_ewb_proj_pst_main') }}
),

staged AS (
    SELECT
        CAST(STATUS AS INT)                                         AS status,
        BEZEICHN                                                    AS bezeichn,
        LANGCODE                                                    AS langcode,
        COALESCE(dss_record_source, 'ewb_abacus')                  AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE())  AS dss_load_date

    FROM source
)

SELECT * FROM staged
