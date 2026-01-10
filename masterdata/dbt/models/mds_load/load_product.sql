{{
  config(
    materialized='incremental',
    schema='mds_load',
    alias='product',
    incremental_strategy='append',
    as_columnstore=false,
    post_hook=[
      "-- Update staged_record status to 'loaded'",
      "UPDATE sr SET sr.status = 'loaded' FROM mds_stage.staged_record sr INNER JOIN mds_stage.[commit] c ON sr.commit_id = c.id WHERE sr.entity_id = 1 AND sr.status = 'committed' AND c.status = 'approved'",
      "-- Update commit status to 'loaded'",
      "UPDATE mds_stage.[commit] SET status = 'loaded', deployed_at = GETUTCDATE() WHERE status = 'approved' AND entity_id = 1"
    ]
  )
}}

{#
  =====================================================
  MDS Load: Products
  =====================================================
  
  Entity Code: product
  Entity ID:   1
  Generated:   2026-01-10T18:25:43.336525
  
  Source: mds_stage.staged_record (JSON data)
  Target: mds_load.product (flache Tabelle)
  
  Lädt alle committed Records aus staged_record,
  deren Commit status='approved' hat.
  =====================================================
#}

{% if is_incremental() %}

-- Incremental: Nur approved Commits laden
SELECT
    sr.business_key_hash,
    sr.business_key,
    JSON_VALUE(sr.data, '$.product_code') AS product_code,
    JSON_VALUE(sr.data, '$.product_name') AS product_name,
    JSON_VALUE(sr.data, '$.price') AS price,
    sr.commit_id,
    sr.operation,
    'MDS' AS source_system,
    CAST(sr.id AS NVARCHAR(255)) AS source_id,
    CAST(0 AS BIT) AS is_processed,
    GETUTCDATE() AS created_at,
    CAST(NULL AS DATETIME2) AS processed_at
FROM mds_stage.staged_record sr
INNER JOIN mds_stage.[commit] c ON sr.commit_id = c.id
WHERE sr.entity_id = 1
  AND sr.status = 'committed'
  AND c.status = 'approved'
  AND NOT EXISTS (
    -- Verhindere Duplikate
    SELECT 1 FROM {{ this }} t 
    WHERE t.source_id = CAST(sr.id AS NVARCHAR(255))
  )

{% else %}

-- Full Refresh: Alle committed Records laden
SELECT
    sr.business_key_hash,
    sr.business_key,
    JSON_VALUE(sr.data, '$.product_code') AS product_code,
    JSON_VALUE(sr.data, '$.product_name') AS product_name,
    JSON_VALUE(sr.data, '$.price') AS price,
    sr.commit_id,
    sr.operation,
    'MDS' AS source_system,
    CAST(sr.id AS NVARCHAR(255)) AS source_id,
    CAST(0 AS BIT) AS is_processed,
    GETUTCDATE() AS created_at,
    CAST(NULL AS DATETIME2) AS processed_at
FROM mds_stage.staged_record sr
INNER JOIN mds_stage.[commit] c ON sr.commit_id = c.id
WHERE sr.entity_id = 1
  AND sr.status = 'committed'
  AND c.status IN ('approved', 'loaded', 'deployed')

{% endif %}
