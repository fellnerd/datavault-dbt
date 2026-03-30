{{- config(materialized='view') -}}

{#-
  Staging: Sharepoint Zugangsrechte (Access Permissions)
  Source: ext_ewb_sp_zugangsrechte_json (JSON via OPENJSON)
  Business Key: Email + KostenstelleNr + Konto
  DV Role: Mart-level enrichment (Berechtigungsmatrix)
-#}

SELECT
    j.Email,
    j.Konto,
    j.Konto_L1,
    j.Konto_L2,
    j.KostenstelleNr,
    j.Bereich_L1,
    j.Bereich_L2,
    j.BereichNeu_L1,
    j.BereichNeu_L2,
    j.ProjektNr,
    j.fileLocation,
    j.timestamp_landing_zone,
    'ewb_sharepoint' AS dss_record_source,
    COALESCE(TRY_CAST(j.timestamp_landing_zone AS DATETIME2), GETDATE()) AS dss_load_date,
    GETDATE() AS dss_create_datetime
FROM {{ source('staging', 'ext_ewb_sp_zugangsrechte_json') }} AS r
CROSS APPLY OPENJSON(r.jsonline) WITH (
    Email           NVARCHAR(500)   '$.Email',
    Konto           NVARCHAR(500)   '$.Konto',
    Konto_L1        NVARCHAR(500)   '$."Konto L1"',
    Konto_L2        NVARCHAR(500)   '$."Konto L2"',
    KostenstelleNr  NVARCHAR(500)   '$.KostenstelleNr',
    Bereich_L1      NVARCHAR(500)   '$."Bereich L1"',
    Bereich_L2      NVARCHAR(500)   '$."Bereich L2"',
    BereichNeu_L1   NVARCHAR(500)   '$."BereichNeu L1"',
    BereichNeu_L2   NVARCHAR(500)   '$."BereichNeu L2"',
    ProjektNr       NVARCHAR(500)   '$.ProjektNr',
    fileLocation    NVARCHAR(1000)  '$.fileLocation',
    timestamp_landing_zone NVARCHAR(100) '$."timestamp_landing-zone"'
) AS j
WHERE j.Email IS NOT NULL
