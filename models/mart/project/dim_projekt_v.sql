/*
 * Dimension: dim_projekt
 * Schema: mart_project
 *
 * Projektstammdaten mit Status-Aufloesung und Sharepoint-Kategorisierung.
 * Repliziert Synapse [Projekt].[Projekt].
 *
 * Quell-Vault-Objekte:
 *   hub_projekt + sat_projekt (PROJ.NPO), ref_projektstatus (PROJ.PST)
 * Sharepoint-Anreicherung:
 *   ewb_sp_kostenstellen (GruppeName via REFPROJNR)
 *   ewb_sp_kategorisierungprojekte + ewb_sp_projektekategorien (Hauptgruppe)
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
    CAST(kst.KostenstelleName AS NVARCHAR(255)) AS gruppe_name,
    CAST(kat.KategorieNr AS NVARCHAR(255))      AS hauptgruppe_nr,
    CAST(pk.KategorieName AS NVARCHAR(255))     AS hauptgruppe_name,
    TRY_CAST(sp.creation AS DATE)         AS erstellt,
    TRY_CAST(FORMAT(TRY_CAST(sp.creation AS DATE), 'yyyyMMdd') AS INT) AS erstellt_date_key,
    CAST(sp.status AS INT)                AS status_nr,
    ISNULL(ref_ps.bezeichn, 'UNKNOWN')    AS status,
    TRY_CAST(sp.status1 AS DATE)          AS status_datum,
    TRY_CAST(FORMAT(TRY_CAST(sp.status1 AS DATE), 'yyyyMMdd') AS INT)  AS status_datum_date_key,
    sp.dss_load_date,
    sp.dss_record_source
FROM {{ ref('hub_projekt') }} hp
INNER JOIN {{ ref('sat_projekt__abacus_current_v') }} sp
    ON hp.hk_projekt = sp.hk_projekt
LEFT JOIN {{ ref('ref_projektstatus_v') }} ref_ps
    ON TRY_CAST(sp.status AS INT) = TRY_CAST(ref_ps.status AS INT)
LEFT JOIN {{ ref('ewb_sp_kostenstellen') }} kst
    ON CAST(sp.refprojnr AS NVARCHAR(MAX)) = CAST(kst.KostenstelleNr AS NVARCHAR(MAX))
LEFT JOIN {{ ref('ewb_sp_kategorisierungprojekte') }} kat
    ON CAST(hp.projnr AS NVARCHAR(MAX)) = kat.Projektnummer
LEFT JOIN {{ ref('ewb_sp_projektekategorien') }} pk
    ON kat.KategorieNr = pk.KategorieNr
