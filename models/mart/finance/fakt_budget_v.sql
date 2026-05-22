/*
 * Faktentabelle: fakt_budget
 * Schema: mart_finance
 *
 * Budget-Daten aus Sharepoint (Planungsdaten).
 * Repliziert Synapse [Finance].[Budget].
 * Granularitaet: 1 Zeile pro (Datum x Szenario x Kostenstelle x Konto).
 *
 * FK-Beziehungen:
 *   konto_key → dim_konto (surrogate_key Konto)
 *   kostenstelle_key → dim_kostenstelle (surrogate_key Kostenstelle)
 *   datum_date_key → dim_date (YYYYMMDD)
 *
 * Quelle: ewb_sp_budget (Sharepoint JSON via OPENJSON)
 */

{{ config(
    materialized='view',
    tags=['fact']
) }}

SELECT
    TRY_CAST(FORMAT(
        COALESCE(
            TRY_CAST(b.Datum AS DATE),
            CASE WHEN TRY_CAST(b.Datum AS INT) BETWEEN 40000 AND 60000
                 THEN DATEADD(day, TRY_CAST(b.Datum AS INT) - 2, '1900-01-01')
            END
        ), 'yyyyMMdd') AS INT)                   AS datum_date_key,
    {{ surrogate_key('b.Konto') }}           AS konto_key,
    {{ surrogate_key('b.Kostenstelle') }}     AS kostenstelle_key,
    CAST(b.Szenario AS NVARCHAR(255))        AS szenario,
    CAST(b.Konto AS INT)                     AS konto_nr,
    CAST(b.Kostenstelle AS INT)              AS kostenstelle_nr,
    CAST(b.KST_KOA AS NVARCHAR(255))        AS kst_koa,
    CAST(b.Betrag AS DECIMAL(18,4))          AS betrag,
    b.dss_load_date,
    b.dss_record_source
FROM {{ ref('ewb_sp_budget') }} b
WHERE b.Konto IS NOT NULL
  AND b.Kostenstelle IS NOT NULL
