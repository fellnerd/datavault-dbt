/*
 * Reference Table: ref_actual_forecast
 *
 * Pattern: Non-historised Reference Table (Data Vault 2.1)
 * Source: ewb_sp_actualforecast (Sharepoint Finance/ActualForecast)
 * Primary Key: Y_Month (Natural Key)
 * Schema: vault (via dbt_project.yml _common config)
 *
 * 24-Zeilen-Kalender-Lookup: Monat → "Actual" oder "Forecast".
 * Repliziert Synapse [Finance].[ActualForecast].
 * Power BI Join: dim_date.year_month = ref_actual_forecast.year_month_normalized
 * → Ermöglicht Actual/Forecast-Slicer über alle Finance-Facts.
 *
 * BUGFIX 2026-07-24: Y_Month liefert real das Format 'YYYYMMM' (z.B. '2022M05'),
 * NICHT 'YYYY-MM' wie urspruenglich dokumentiert/angenommen. dim_date.year_month
 * liefert 'YYYY-MM' (z.B. '2022-05'). Der direkte Join Y_Month = year_month matchte
 * dadurch NIE (0 Zeilen) — die Actual/Forecast-Logik im Power-BI-Modell war
 * bislang wirkungslos. Fix: normalisierte Spalte year_month_normalized ergaenzt,
 * roher Y_Month bleibt unveraendert erhalten (Audit-Treue zur Quelle).
 * Power-BI-Beziehung muss auf year_month_normalized umgestellt werden (manuell,
 * nicht Teil dieses dbt-Fixes).
 *
 * Developer: Daniel Fellner, MSc
 * Company:   ppmc analytics ag
 * Contact:   office@ppmcag.com
 * Version:   2026-07-24 V1.1 year_month_normalized ergaenzt (Format-Bugfix)
 *
 * HINWEIS: Nutzt NICHT automate_dv.ref_table() wie andere Reference Tables in
 * diesem Ordner — das Macro erzeugt selbst ein WITH-Statement, das sich nicht in
 * eine eigene CTE nesten laesst (SQL Server: "CTE kann keine weitere CTE als
 * ersten Befehl enthalten"). Logik unten ist funktional identisch zu
 * automate_dv.ref_table() fuer diesen Fall (SELECT DISTINCT + WHERE pk IS NOT
 * NULL, keine Incremental-Diff-Logik noetig, da materialized='view').
 */

{{ config(
    materialized='view'
) }}

SELECT DISTINCT
    a.Y_Month,
    a.Actual_Forecast,
    a.dss_load_date,
    a.dss_record_source,
    -- 'YYYYMMM' (z.B. '2022M05') -> 'YYYY-MM' (z.B. '2022-05'), passend zu dim_date.year_month
    LEFT(a.Y_Month, 4) + '-' + RIGHT(a.Y_Month, 2) AS year_month_normalized
FROM {{ ref('ewb_sp_actualforecast') }} a
WHERE a.Y_Month IS NOT NULL
