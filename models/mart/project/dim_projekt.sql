/*
 * Dimension: dim_projekt
 * Schema: mart_project
 *
 * Projektstammdaten mit Status-Aufloesung.
 * Repliziert Synapse [Projekt].[Projekt].
 *
 * Quell-Vault-Objekte:
 *   hub_projekt + sat_projekt (PROJ.NPO), ref_projektstatus (PROJ.PST)
 */

{{ config(
    materialized='view',
    tags=['dimension']
) }}

SELECT
    {{ surrogate_key('hp.projnr') }}     AS projekt_key,
    CAST(hp.projnr AS NVARCHAR(255))                                         AS projekt_id,
    ISNULL(CAST(hp.projnr AS NVARCHAR(255)), 'UNKNOWN')                      AS projekt_code,
    ISNULL(sp.projname, ISNULL(CAST(hp.projnr AS NVARCHAR(255)), 'UNKNOWN')) AS projekt_name,
    CAST(sp.inaktiv AS INT)               AS inaktiv,
    CAST(sp.refprojnr AS INT)             AS gruppe_nr,
    TRY_CAST(sp.creation AS DATE)         AS erstellt,
    CAST(sp.status AS INT)                AS status_nr,
    ISNULL(ref_ps.bezeichn, 'UNKNOWN')    AS status,
    TRY_CAST(sp.status1 AS DATE)          AS status_datum,
    sp.dss_load_date,
    sp.dss_record_source
FROM {{ ref('hub_projekt') }} hp
INNER JOIN {{ ref('sat_projekt_current_v') }} sp
    ON hp.hk_projekt = sp.hk_projekt
    AND sp.dss_is_current = 'Y'
LEFT JOIN {{ ref('ref_projektstatus') }} ref_ps
    ON TRY_CAST(sp.status AS INT) = TRY_CAST(ref_ps.status AS INT)
