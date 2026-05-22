/*
 * Dimension: dim_kostenstelle
 * Schema: mart_finance
 *
 * Kostenstellenplan (Cost Center Master Data) mit Sharepoint-Hierarchie.
 * Ghost Hub: Kostenstellen-Nummern werden aus Hauptbuch-Buchungszeilen (FIBU.GL) abgeleitet.
 * Stammdaten (Kostenstellenplan) aus Sharepoint ref_kostenstelle (151 Kostenstellen).
 *
 * Hierarchie: Bereich_L1/L2 (alt), BereichNeu_L1/L2 (neu), Investitionsrechnung.
 *
 * Vault-Lineage: hub_kostenstelle.kst LEFT JOIN ref_kostenstelle (Sharepoint Kostenstellenplan)
 * LEFT JOIN: Nicht alle GL-Kostenstellen haben einen Sharepoint-Eintrag.
 */

{{ config(
    materialized='view',
    tags=['dimension']
) }}

SELECT
    {{ surrogate_key('hk.kst') }}                                                        AS kostenstelle_key,
    CAST(TRY_CAST(hk.kst AS INT) AS NVARCHAR(255))                                       AS kostenstelle_id,
    ISNULL(CAST(rk.Kostenstelle AS NVARCHAR(255)), CAST(TRY_CAST(hk.kst AS INT) AS NVARCHAR(255))) AS kostenstelle_code,
    ISNULL(CAST(rk.KostenstelleName AS NVARCHAR(255)),
           ISNULL(CAST(rk.Kostenstelle AS NVARCHAR(255)),
                  ISNULL(CAST(TRY_CAST(hk.kst AS INT) AS NVARCHAR(255)), 'UNKNOWN')))    AS kostenstelle_name,
    CAST(rk.Bereich_L1 AS NVARCHAR(255))                                                 AS bereich,
    CAST(rk.Bereichsname_L1 AS NVARCHAR(255))                                            AS bereich_name,
    CAST(rk.Bereich_L2 AS NVARCHAR(255))                                                 AS bereich_detail,
    CAST(rk.Bereichsname_L2 AS NVARCHAR(255))                                            AS bereich_detail_name,
    CAST(rk.BereichNeu_L1 AS NVARCHAR(255))                                              AS bereich_neu,
    CAST(rk.BereichsnameNeu_L1 AS NVARCHAR(255))                                         AS bereich_neu_name,
    CAST(rk.BereichNeu_L2 AS NVARCHAR(255))                                              AS bereich_neu_detail,
    CAST(rk.BereichsnameNeu_L2 AS NVARCHAR(255))                                         AS bereich_neu_detail_name,
    TRY_CAST(rk.Investitionsrechnung AS INT)                                              AS investitionsrechnung,
    hk.dss_load_date,
    hk.dss_record_source
FROM {{ ref('hub_kostenstelle') }} hk
LEFT JOIN {{ ref('ref_kostenstelle_v') }} rk
    ON TRY_CAST(hk.kst AS INT) = rk.KostenstelleNr
