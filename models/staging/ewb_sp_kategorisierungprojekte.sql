{{- config(materialized='view') -}}

{#-
  Staging: Sharepoint KategorisierungProjekte (Project Categorization)
  Source: ext_ewb_sp_kategorisierungprojekte_json (JSON via OPENJSON)
  Business Key: Projektnummer
  DV Role: Mart-level enrichment (Projekt-Kategorisierung)
-#}

SELECT
    j.Projektnummer,
    j.KategorieNr,
    j.KostenstelleName,
    j.fileLocation,
    j.timestamp_landing_zone,
    'ewb_sharepoint' AS dss_record_source,
    COALESCE(TRY_CAST(j.timestamp_landing_zone AS DATETIME2), GETDATE()) AS dss_load_date,
    GETDATE() AS dss_create_datetime
FROM {{ source('staging', 'ext_ewb_sp_kategorisierungprojekte_json') }} AS r
CROSS APPLY OPENJSON(r.jsonline) WITH (
    Projektnummer   NVARCHAR(500)   '$.Projektnummer',
    KategorieNr     NVARCHAR(500)   '$.KategorieNr',
    KostenstelleName NVARCHAR(500)  '$.KostenstelleName',
    fileLocation    NVARCHAR(1000)  '$.fileLocation',
    timestamp_landing_zone NVARCHAR(100) '$."timestamp_landing-zone"'
) AS j
WHERE j.Projektnummer IS NOT NULL
