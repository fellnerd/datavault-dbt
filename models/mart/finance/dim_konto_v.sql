/*
 * Dimension: dim_konto
 * Schema: mart_finance
 *
 * Kontenplan (Chart of Accounts) mit Sharepoint-Hierarchie.
 * Ghost Hub: Konto-Nummern werden aus Hauptbuch-Buchungszeilen (FIBU.GL) abgeleitet.
 * Stammdaten (Kontenplan) aus Sharepoint ref_konto (254 Konten).
 *
 * Hierarchie: Konto_L1 (Kontogruppe) → Konto_L2 (Unterkategorie) → Konto (Detail)
 *
 * Vault-Lineage: hub_konto.kto LEFT JOIN ref_konto (Sharepoint Kontenplan)
 * LEFT JOIN: Nicht alle GL-Konto-Nummern haben einen Sharepoint-Eintrag.
 */

{{ config(
    materialized='view',
    tags=['dimension']
) }}

SELECT
    {{ surrogate_key('hk.kto') }}                                                        AS konto_key,
    CAST(hk.kto AS NVARCHAR(255))                                                        AS konto_id,
    ISNULL(CAST(rk.Konto AS NVARCHAR(255)), CAST(hk.kto AS NVARCHAR(255)))               AS konto_code,
    ISNULL(CAST(rk.KontoName AS NVARCHAR(255)),
           ISNULL(CAST(rk.Konto AS NVARCHAR(255)),
                  ISNULL(CAST(hk.kto AS NVARCHAR(255)), 'UNKNOWN')))                     AS konto_name,
    CAST(rk.Konto_L1 AS NVARCHAR(255))                                                   AS konto_gruppe,
    CAST(rk.KontoName_L1 AS NVARCHAR(255))                                               AS konto_gruppe_name,
    CAST(rk.Konto_L2 AS NVARCHAR(255))                                                   AS konto_subgruppe,
    CAST(rk.KontoName_L2 AS NVARCHAR(255))                                               AS konto_subgruppe_name,
    hk.dss_load_date,
    hk.dss_record_source
FROM {{ ref('hub_konto') }} hk
LEFT JOIN {{ ref('ref_konto_v') }} rk
    ON CAST(hk.kto AS NVARCHAR(MAX)) = CAST(rk.KontoNr AS NVARCHAR(MAX))
