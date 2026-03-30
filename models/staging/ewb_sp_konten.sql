{{- config(materialized='view') -}}

{#-
  Staging: Sharepoint Konten (Kontenplan / Chart of Accounts)
  Source: ext_ewb_sp_konten_json (JSON via OPENJSON)
  Business Key: KontoNr
  DV Role: Reference Table (ref_konto)
-#}

SELECT
    CONVERT(CHAR(64), HASHBYTES('SHA2_256',
        ISNULL(LTRIM(RTRIM(CAST(j.KontoNr AS NVARCHAR(MAX)))), '-1')
    ), 2) AS hk_konto,
    j.KontoNr,
    j.KontoName,
    j.Konto,
    j.Konto_L1,
    j.KontoName_L1,
    j.Konto_L2,
    j.KontoName_L2,
    j.fileLocation,
    j.timestamp_landing_zone,
    CONCAT_WS('||', 'default', 'default',
        ISNULL(LTRIM(RTRIM(CAST(j.KontoNr AS NVARCHAR(MAX)))), '-1')
    ) AS dss_business_key,
    'ewb_sharepoint' AS dss_record_source,
    COALESCE(TRY_CAST(j.timestamp_landing_zone AS DATETIME2), GETDATE()) AS dss_load_date,
    GETDATE() AS dss_create_datetime
FROM {{ source('staging', 'ext_ewb_sp_konten_json') }} AS r
CROSS APPLY OPENJSON(r.jsonline) WITH (
    KontoNr         INT             '$.KontoNr',
    KontoName       NVARCHAR(500)   '$.KontoName',
    Konto           NVARCHAR(500)   '$.Konto',
    Konto_L1        NVARCHAR(500)   '$."Konto L1"',
    KontoName_L1    NVARCHAR(500)   '$."KontoName L1"',
    Konto_L2        NVARCHAR(500)   '$."Konto L2"',
    KontoName_L2    NVARCHAR(500)   '$."KontoName L2"',
    fileLocation    NVARCHAR(1000)  '$.fileLocation',
    timestamp_landing_zone NVARCHAR(100) '$."timestamp_landing-zone"'
) AS j
WHERE j.KontoNr IS NOT NULL
