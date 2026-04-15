/*
 * Reference Table: ref_actual_forecast
 *
 * Pattern: Non-historised Reference Table (Data Vault 2.1)
 * Source: ewb_sp_actualforecast (Sharepoint Finance/ActualForecast)
 * Primary Key: Y_Month (Natural Key, Format: 'YYYY-MM')
 * Schema: vault (via dbt_project.yml _common config)
 *
 * 24-Zeilen-Kalender-Lookup: Monat → "Actual" oder "Forecast".
 * Repliziert Synapse [Finance].[ActualForecast].
 * Power BI Join: dim_date.year_month = ref_actual_forecast.Y_Month
 * → Ermöglicht Actual/Forecast-Slicer über alle Finance-Facts.
 *
 * Developer: Daniel Fellner, MSc
 * Company:   ppmc analytics ag
 * Contact:   office@ppmcag.com
 * Version:   2026-04-15 V1.0 Vault-Migration (vorher mart_finance.ref_actual_forecast_v)
 */

{{ config(
    materialized='view'
) }}

{%- set yaml_metadata -%}
source_model: "ewb_sp_actualforecast"
src_pk: "Y_Month"
src_extra_columns:
    - "Actual_Forecast"
src_ldts: "dss_load_date"
src_source: "dss_record_source"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.ref_table(
    src_pk=metadata_dict["src_pk"],
    src_extra_columns=metadata_dict["src_extra_columns"],
    src_ldts=metadata_dict["src_ldts"],
    src_source=metadata_dict["src_source"],
    source_model=metadata_dict["source_model"]
) }}
