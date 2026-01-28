{{
  config(
    materialized='ephemeral'
  )
}}

{# Base model for dim_projekt - DO NOT EDIT, this file is regenerated #}

SELECT
  -- Surrogate Key
  CONVERT(INT, HASHBYTES('MD5', CAST(hub.project_id AS NVARCHAR(MAX)))) AS dim_projekt_key,
  -- Business Key
  hub.project_id,
  -- Attributes
  sat.name
FROM {{ ref('hub_project') }} hub
LEFT JOIN {{ ref('sat_project') }} sat ON hub.hk_project = sat.hk_project