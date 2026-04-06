{{- config(materialized='view') -}}

{#-
  Staging: Sharepoint Kostenstellen (Cost Center Master Data)
  Source: ext_ewb_sp_kostenstellen_json (JSON via OPENJSON)
  Business Key: KostenstelleNr
  DV Role: Reference Table (ref_kostenstelle)
-#}

SELECT
    CONVERT(CHAR(64), HASHBYTES('SHA2_256',
        ISNULL(LTRIM(RTRIM(CAST(j.KostenstelleNr AS NVARCHAR(MAX)))), '-1')
    ), 2) AS hk_kostenstelle,
    j.KostenstelleNr,
    j.KostenstelleName,
    j.Kostenstelle,
    j.Bereich_L1,
    j.Bereich_L2,
    j.Bereichsname_L1,
    j.Bereichsname_L2,
    j.BereichNeu_L1,
    j.BereichNeu_L2,
    j.BereichsnameNeu_L1,
    j.BereichsnameNeu_L2,
    j.Investitionsrechnung,
    j.fileLocation,
    j.timestamp_landing_zone,
    CONCAT_WS('||', 'default', 'default',
        ISNULL(LTRIM(RTRIM(CAST(j.KostenstelleNr AS NVARCHAR(MAX)))), '-1')
    ) AS dss_business_key,
    'ewb_sharepoint' AS dss_record_source,
    COALESCE(TRY_CAST(j.timestamp_landing_zone AS DATETIME2), GETDATE()) AS dss_load_date,
    GETDATE() AS dss_create_datetime
FROM {{ source('staging', 'ext_ewb_sp_kostenstellen_json') }} AS r
CROSS APPLY OPENJSON(r.jsonline) WITH (
    KostenstelleNr      INT             '$.KostenstelleNr',
    KostenstelleName     NVARCHAR(500)   '$.KostenstelleName',
    Kostenstelle         NVARCHAR(500)   '$.Kostenstelle',
    Bereich_L1           NVARCHAR(500)   '$."Bereich L1"',
    Bereich_L2           NVARCHAR(500)   '$."Bereich L2"',
    Bereichsname_L1      NVARCHAR(500)   '$."Bereichsname L1"',
    Bereichsname_L2      NVARCHAR(500)   '$."Bereichsname L2"',
    BereichNeu_L1        NVARCHAR(500)   '$."BereichNeu L1"',
    BereichNeu_L2        NVARCHAR(500)   '$."BereichNeu L2"',
    BereichsnameNeu_L1   NVARCHAR(500)   '$."BereichsnameNeu L1"',
    BereichsnameNeu_L2   NVARCHAR(500)   '$."BereichsnameNeu L2"',
    Investitionsrechnung INT             '$.Investitionsrechnung',
    fileLocation         NVARCHAR(1000)  '$.fileLocation',
    timestamp_landing_zone NVARCHAR(100) '$."timestamp_landing-zone"'
) AS j
WHERE j.KostenstelleNr IS NOT NULL
