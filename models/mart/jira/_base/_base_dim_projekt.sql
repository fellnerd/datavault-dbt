{{
  config(
    materialized='ephemeral'
  )
}}

{# Base model for dim_projekt - DO NOT EDIT, this file is regenerated #}

SELECT
  -- Surrogate Key
  ABS(CONVERT(BIGINT, HASHBYTES('MD5', CAST(project_id AS NVARCHAR(MAX))))) AS dim_projekt_key,
  -- Business Key
  project_id
FROM {{ ref('hub_project') }}