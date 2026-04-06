{{- config(materialized='view') -}}

{#-
  Staging: Sharepoint ActualForecast (Actual vs Forecast Flags)
  Source: ext_ewb_sp_actualforecast_json (JSON via OPENJSON)
  Business Key: Y_Month
  DV Role: Mart-level enrichment
-#}

SELECT
    j.Y_Month,
    j.Actual_Forecast,
    j.fileLocation,
    j.timestamp_landing_zone,
    'ewb_sharepoint' AS dss_record_source,
    COALESCE(TRY_CAST(j.timestamp_landing_zone AS DATETIME2), GETDATE()) AS dss_load_date,
    GETDATE() AS dss_create_datetime
FROM {{ source('staging', 'ext_ewb_sp_actualforecast_json') }} AS r
CROSS APPLY OPENJSON(r.jsonline) WITH (
    Y_Month         NVARCHAR(100)   '$."Y-Month"',
    Actual_Forecast NVARCHAR(100)   '$."Actual/Forecast"',
    fileLocation    NVARCHAR(1000)  '$.fileLocation',
    timestamp_landing_zone NVARCHAR(100) '$."timestamp_landing-zone"'
) AS j
WHERE j.Y_Month IS NOT NULL
