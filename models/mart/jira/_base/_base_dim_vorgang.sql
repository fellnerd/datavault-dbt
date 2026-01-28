{{
  config(
    materialized='ephemeral'
  )
}}

{# Base model for dim_vorgang - DO NOT EDIT, this file is regenerated #}

SELECT
  -- Surrogate Key
  CONVERT(INT, HASHBYTES('MD5', CAST(hub_vorgang.issue_id AS NVARCHAR(MAX)))) AS dim_vorgang_key,
  -- Business Key
  hub_vorgang.issue_id,
  -- Attributes
  sat_vorgang.summary
FROM {{ ref('hub_vorgang') }} hub_vorgang
LEFT JOIN {{ ref('sat_vorgang') }} sat_vorgang ON hub_vorgang.hk_vorgang = sat_vorgang.hk_vorgang
WHERE sat_vorgang.dss_is_current = 'Y'