/*
 * Reference: ref_actual_forecast
 * Schema: mart_finance
 *
 * Lookup-Tabelle: Monat → "Actual" oder "Forecast".
 * Repliziert Synapse [Finance].[ActualForecast].
 * 24 Zeilen (2 Jahre x 12 Monate).
 *
 * Quelle: ewb_sp_actualforecast (Sharepoint JSON via OPENJSON)
 */

{{ config(
    materialized='view',
    tags=['reference']
) }}

SELECT
    CAST(af.Y_Month AS NVARCHAR(20))            AS y_month,
    CAST(af.Actual_Forecast AS NVARCHAR(20))     AS actual_forecast,
    af.dss_load_date,
    af.dss_record_source
FROM {{ ref('ewb_sp_actualforecast') }} af
