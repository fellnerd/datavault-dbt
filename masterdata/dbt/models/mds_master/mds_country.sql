{{
  config(
    materialized='incremental',
    schema='mds_master',
    alias='country',
    incremental_strategy='append',
    as_columnstore=false,
    pre_hook=[
      "{% if is_incremental() %}
      -- Close existing current records that will be updated
      UPDATE mds_master.country
      SET valid_to = GETUTCDATE(), 
          is_current = 0, 
          updated_at = GETUTCDATE(), 
          updated_by = 'dbt'
      WHERE is_current = 1 
        AND business_key IN (
          SELECT business_key 
          FROM mds_load.country 
          WHERE is_processed = 0 
            AND operation IN ('UPDATE', 'DELETE', 'INSERT')
            AND business_key IN (SELECT business_key FROM mds_master.country WHERE is_current = 1)
        )
      {% endif %}"
    ],
    post_hook=[
      "UPDATE mds_load.country SET is_processed = 1, processed_at = GETUTCDATE() WHERE is_processed = 0"
    ]
  )
}}

{#
  =====================================================
  MDS Master: Countries
  =====================================================
  
  Entity Code: country
  Generated:   2026-01-10T00:34:28.669745
  
  Source: mds_load.country
  Target: mds_master.country (SCD2 historisiert)
  
  Business Key: country_code
  Columns: country_code, country_name, region, currency
  =====================================================
#}

{% if is_incremental() %}

-- Incremental: Nur unverarbeitete Records aus Load-Tabelle
WITH source_data AS (
    SELECT 
        id AS load_id,
        business_key,
        business_key_hash,
        operation,
        country_code,
        country_name,
        region,
        currency,
        commit_id,
        source_system,
        source_id,
        created_at
    FROM mds_load.country
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
                COALESCE(CAST(s.country_code AS NVARCHAR(MAX)), '') != COALESCE(CAST(t.country_code AS NVARCHAR(MAX)), '') OR
                COALESCE(CAST(s.country_name AS NVARCHAR(MAX)), '') != COALESCE(CAST(t.country_name AS NVARCHAR(MAX)), '') OR
                COALESCE(CAST(s.region AS NVARCHAR(MAX)), '') != COALESCE(CAST(t.region AS NVARCHAR(MAX)), '') OR
                COALESCE(CAST(s.currency AS NVARCHAR(MAX)), '') != COALESCE(CAST(t.currency AS NVARCHAR(MAX)), '')
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
    country_code,
        country_name,
        region,
        currency,
    created_at AS valid_from,
    CAST('9999-12-31' AS DATETIME2) AS valid_to,
    CAST(1 AS BIT) AS is_current,
    CASE WHEN operation = 'DELETE' THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS is_deleted,
    commit_id,
    source_system,
    source_id,
    load_id AS source_load_id,
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
    country_code,
        country_name,
        region,
        currency,
    created_at AS valid_from,
    CAST('9999-12-31' AS DATETIME2) AS valid_to,
    CAST(1 AS BIT) AS is_current,
    CASE WHEN operation = 'DELETE' THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS is_deleted,
    commit_id,
    source_system,
    source_id,
    id AS source_load_id,
    GETUTCDATE() AS created_at,
    'dbt' AS created_by,
    CAST(NULL AS DATETIME2) AS updated_at,
    CAST(NULL AS NVARCHAR(100)) AS updated_by
FROM mds_load.country
WHERE is_processed = 0

{% endif %}
