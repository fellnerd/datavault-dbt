{{- config(materialized='view') -}}

{#-
  Staging: Sharepoint ProjekteKategorien (Project Category Lookup)
  Source: ext_ewb_sp_projektekategorien_json (JSON via OPENJSON)
  Business Key: KategorieNr
  DV Role: Reference/Lookup for KategorisierungProjekte
-#}

SELECT
    j.KategorieNr,
    j.KategorieName,
    j.fileLocation,
    j.timestamp_landing_zone,
    'ewb_sharepoint' AS dss_record_source,
    COALESCE(TRY_CAST(j.timestamp_landing_zone AS DATETIME2), GETDATE()) AS dss_load_date,
    GETDATE() AS dss_create_datetime
FROM {{ source('staging', 'ext_ewb_sp_projektekategorien_json') }} AS r
CROSS APPLY OPENJSON(r.jsonline) WITH (
    KategorieNr     NVARCHAR(500)   '$.KategorieNr',
    KategorieName   NVARCHAR(500)   '$.KategorieName',
    fileLocation    NVARCHAR(1000)  '$.fileLocation',
    timestamp_landing_zone NVARCHAR(100) '$."timestamp_landing-zone"'
) AS j
WHERE j.KategorieNr IS NOT NULL
