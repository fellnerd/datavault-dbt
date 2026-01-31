{{
  config(
    materialized='ephemeral'
  )
}}

{# Base model for dim_vorgang_status - DO NOT EDIT, this file is regenerated #}

SELECT
  -- Surrogate Key
  ABS(CONVERT(BIGINT, HASHBYTES('MD5', CAST(issue_status_id AS NVARCHAR(MAX))))) AS dim_vorgang_status_key,
  -- Business Key
  issue_status_id
FROM {{ ref('ref_vorgang_status') }}