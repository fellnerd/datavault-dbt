{{- config(materialized='view') -}}

{#-
  Staging: Sharepoint Budget (Planungsdaten)
  Source: ext_ewb_sp_budget_json (JSON via OPENJSON)
  Business Key: Datum + Kostenstelle + Konto + Szenario
  DV Role: Mart-level enrichment (Budget vs Actual)
-#}

SELECT
    j.Datum,
    j.Szenario,
    j.Kostenstelle,
    j.Konto,
    j.KST_KOA,
    j.Betrag,
    j.fileLocation,
    j.timestamp_landing_zone,
    'ewb_sharepoint' AS dss_record_source,
    COALESCE(TRY_CAST(j.timestamp_landing_zone AS DATETIME2), GETDATE()) AS dss_load_date,
    GETDATE() AS dss_create_datetime
FROM {{ source('staging', 'ext_ewb_sp_budget_json') }} AS r
CROSS APPLY OPENJSON(r.jsonline) WITH (
    Datum           NVARCHAR(100)   '$.Datum',
    Szenario        NVARCHAR(500)   '$.Szenario',
    Kostenstelle    INT             '$.Kostenstelle',
    Konto           INT             '$.Konto',
    KST_KOA         NVARCHAR(500)   '$."KST-KOA"',
    Betrag          FLOAT           '$.Betrag',
    fileLocation    NVARCHAR(1000)  '$.fileLocation',
    timestamp_landing_zone NVARCHAR(100) '$."timestamp_landing-zone"'
) AS j
WHERE j.Datum IS NOT NULL
