/*
 * Faktentabelle: fakt_forecast
 * Schema: mart_finance
 *
 * Forecast-Daten aus Sharepoint (Planungsdaten).
 * Repliziert Synapse [Finance].[Forecast].
 * Granularitaet: 1 Zeile pro (Datum x Szenario x Kostenstelle x Konto).
 *
 * FK-Beziehungen:
 *   konto_key → dim_konto (surrogate_key Konto)
 *   kostenstelle_key → dim_kostenstelle (surrogate_key Kostenstelle)
 *   datum_date_key → dim_date (YYYYMMDD)
 *
 * Quelle: ewb_sp_forecast (Sharepoint JSON via OPENJSON)
 */

{{ config(
    materialized='view',
    tags=['fact']
) }}

SELECT
    TRY_CAST(FORMAT(
        COALESCE(
            TRY_CAST(f.Datum AS DATE),
            CASE WHEN TRY_CAST(f.Datum AS INT) BETWEEN 40000 AND 60000
                 THEN DATEADD(day, TRY_CAST(f.Datum AS INT) - 2, '1900-01-01')
            END
        ), 'yyyyMMdd') AS INT)                   AS datum_date_key,
    {{ surrogate_key('f.Konto') }}           AS konto_key,
    {{ surrogate_key('f.Kostenstelle') }}     AS kostenstelle_key,
    CAST(f.Szenario AS NVARCHAR(255))        AS szenario,
    CAST(f.Konto AS INT)                     AS konto_nr,
    CAST(f.Kostenstelle AS INT)              AS kostenstelle_nr,
    CAST(f.KST_KOA AS NVARCHAR(255))        AS kst_koa,
    CAST(f.Betrag AS DECIMAL(18,4))          AS betrag,
    f.dss_load_date,
    f.dss_record_source
FROM {{ ref('ewb_sp_forecast') }} f
WHERE f.Konto IS NOT NULL
  AND f.Kostenstelle IS NOT NULL
