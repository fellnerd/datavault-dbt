{{
  config(
    materialized='incremental',
    schema='mds_master',
    alias='product',
    incremental_strategy='append',
    as_columnstore=false,
    pre_hook=[
      "{% if is_incremental() %}
      -- Close existing current records that will be updated
      UPDATE mds_master.product
      SET valid_to = GETUTCDATE(), 
          is_current = 0, 
          updated_at = GETUTCDATE(), 
          updated_by = 'dbt'
      WHERE is_current = 1 
        AND business_key IN (
          SELECT business_key 
          FROM mds_load.product 
          WHERE is_processed = 0 
            AND operation IN ('UPDATE', 'DELETE', 'INSERT')
            AND business_key IN (SELECT business_key FROM mds_master.product WHERE is_current = 1)
        )
      {% endif %}"
    ],
    post_hook=[
      "-- Mark load records as processed",
      "UPDATE mds_load.product SET is_processed = 1, processed_at = GETUTCDATE() WHERE is_processed = 0",
      "-- Update commit status to 'deployed' for all loaded commits",
      "UPDATE mds_stage.[commit] SET status = 'deployed' WHERE status = 'loaded' AND entity_id = 1"
    ]
  )
}}

{#
  =====================================================
  MDS Master: Products
  =====================================================
  
  Entity Code: product
  Generated:   2026-01-10T18:25:43.336719
  
  Source: mds_load.product
  Target: mds_master.product (SCD2 historisiert)
  
  Business Key: product_code
  Columns: product_code, product_name, price
  =====================================================
#}

{% if is_incremental() %}

-- Incremental: Nur unverarbeitete Records aus Load-Tabelle
WITH source_data AS (
    SELECT 
        CAST(source_id AS BIGINT) AS load_id,
        business_key,
        business_key_hash,
        operation,
        product_code,
        product_name,
        price,
        commit_id,
        source_system,
        source_id,
        created_at
    FROM mds_load.product
    WHERE is_processed = 0
),

-- Change Detection
changes AS (
    SELECT 
        s.*,
        t.business_key AS existing_business_key,
        CASE 
            WHEN t.business_key IS NULL THEN 'NEW'
            WHEN s.operation = 'DELETE' THEN 'DELETE'
            WHEN s.operation = 'UPDATE' OR (
                COALESCE(CAST(s.product_code AS NVARCHAR(MAX)), '') != COALESCE(CAST(t.product_code AS NVARCHAR(MAX)), '') OR
                COALESCE(CAST(s.product_name AS NVARCHAR(MAX)), '') != COALESCE(CAST(t.product_name AS NVARCHAR(MAX)), '') OR
                COALESCE(CAST(s.price AS NVARCHAR(MAX)), '') != COALESCE(CAST(t.price AS NVARCHAR(MAX)), '')
            ) THEN 'CHANGED'
            ELSE 'NO_CHANGE'
        END AS change_type
    FROM source_data s
    LEFT JOIN {{ this }} t 
        ON s.business_key = t.business_key 
        AND t.is_current = 1
)

-- Insert new versions
SELECT
    business_key,
    business_key_hash,
    product_code,
        product_name,
        price,
    created_at AS valid_from,
    CAST('9999-12-31' AS DATETIME2) AS valid_to,
    CAST(1 AS BIT) AS is_current,
    CASE WHEN operation = 'DELETE' THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS is_deleted,
    commit_id,
    source_system,
    source_id,
    CAST(load_id AS BIGINT) AS source_load_id,
    GETUTCDATE() AS created_at,
    'dbt' AS created_by,
    CAST(NULL AS DATETIME2) AS updated_at,
    CAST(NULL AS NVARCHAR(100)) AS updated_by
FROM changes
WHERE change_type IN ('NEW', 'CHANGED', 'DELETE')

{% else %}

-- Full Refresh: Alle Records
SELECT
    business_key,
    business_key_hash,
    product_code,
        product_name,
        price,
    created_at AS valid_from,
    CAST('9999-12-31' AS DATETIME2) AS valid_to,
    CAST(1 AS BIT) AS is_current,
    CASE WHEN operation = 'DELETE' THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS is_deleted,
    commit_id,
    source_system,
    source_id,
    CAST(source_id AS BIGINT) AS source_load_id,
    GETUTCDATE() AS created_at,
    'dbt' AS created_by,
    CAST(NULL AS DATETIME2) AS updated_at,
    CAST(NULL AS NVARCHAR(100)) AS updated_by
FROM mds_load.product
WHERE is_processed = 0

{% endif %}
