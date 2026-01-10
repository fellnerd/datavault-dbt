{{
  config(
    materialized='view',
    schema='mds_view',
    alias='v_country'
  )
}}

{#
  MDS View: Country View
  Entity: Countries (country)
  View Type: standard
  
  Generated: 2026-01-10T00:34:28.748397
  
  Quelle: mds_master.country (nur aktuelle Records)
#}

SELECT
    country_code AS [Code],
    country_name AS [Name],
    region AS [Region],
    currency AS [Currency]
FROM mds_master.country
WHERE is_current = 1
  AND is_deleted = 0
