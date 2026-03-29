/*
 * Dimension: dim_projekt
 * Schema: mart_project
 *
 * Projektstammdaten mit Status-Aufloesung.
 * Repliziert Synapse structured-table [Projekt].[Projekt].
 *
 * Surrogate Key: ProjektNr (INT) = NPO.PROJNR
 *
 * Quell-Vault-Objekte:
 *   - hub_projekt + sat_projekt (PROJ.NPO — Stammdaten)
 *   - ref_projektstatus (PROJ.PST — Status-Aufloesung)
 *
 * Business-Logik (aus Azure Pipeline / Synapse):
 *   1. Alle Projekte (aktiv + inaktiv)
 *   2. Status-Aufloesung: NPO.STATUS → PST.STATUS/BEZEICHN
 *      (PST Dedup durch DATASET=2 Filter in Staging sichergestellt)
 *
 * Nicht implementiert (out of scope):
 *   - Sharepoint-Anreicherung: Kostenstellen (GruppeName),
 *     KategorisierungProjekte + ProjekteKategorien (HauptgruppeName)
 */

{{ config(
    materialized='table',
    as_columnstore=false,
    tags=['dimension'],
    post_hook=[
        "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_dim_projekt_pk' AND object_id = OBJECT_ID('{{ this }}')) CREATE NONCLUSTERED INDEX ix_dim_projekt_pk ON {{ this }} (ProjektNr)"
    ]
) }}

SELECT
    CAST(hp.projnr AS INT)               AS ProjektNr,
    sp.projname                           AS ProjektName,
    CAST(sp.inaktiv AS INT)               AS Inaktiv,
    CAST(sp.refprojnr AS INT)             AS GruppeNr,
    TRY_CAST(sp.creation AS DATE)         AS Erstellt,
    CAST(sp.status AS INT)                AS StatusNr,
    ref_ps.bezeichn                       AS Status,
    TRY_CAST(sp.status1 AS DATE)          AS StatusDatum
FROM {{ ref('hub_projekt') }} hp
INNER JOIN {{ ref('sat_projekt') }} sp
    ON hp.hk_projekt = sp.hk_projekt
    AND sp.dss_is_current = 'Y'
LEFT JOIN {{ ref('ref_projektstatus') }} ref_ps
    ON TRY_CAST(sp.status AS INT) = TRY_CAST(ref_ps.status AS INT)
