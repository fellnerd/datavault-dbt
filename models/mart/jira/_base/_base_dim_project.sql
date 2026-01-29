{{
  config(
    materialized='ephemeral'
  )
}}

{# Base model for dim_project - DO NOT EDIT, this file is regenerated #}

SELECT
  -- Surrogate Key
  ABS(CONVERT(BIGINT, HASHBYTES('MD5', CAST(hub_project.project_id AS NVARCHAR(MAX))))) AS dim_project_key,
  -- Business Key
  hub_project.project_id,
  -- Attributes
  sat_project.name
FROM {{ ref('hub_project') }} hub_project
LEFT JOIN {{ ref('sat_project') }} sat_project ON hub_project.hk_project = sat_project.hk_project
WHERE sat_project.dss_is_current = 'Y'