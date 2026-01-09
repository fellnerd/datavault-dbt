{{
  config(
    materialized='incremental',
    schema='mds_master',
    alias='customer',
    incremental_strategy='append',
    as_columnstore=false,
    pre_hook=[
      "{% if is_incremental() %}
      -- Close existing current records that will be updated
      UPDATE mds_master.customer
      SET valid_to = GETUTCDATE(), 
          is_current = 0, 
          updated_at = GETUTCDATE(), 
          updated_by = 'dbt'
      WHERE is_current = 1 
        AND business_key IN (
          SELECT business_key 
          FROM mds_load.load_customer 
          WHERE is_processed = 0 
            AND operation IN ('UPDATE', 'DELETE', 'INSERT')
            AND business_key IN (SELECT business_key FROM mds_master.customer WHERE is_current = 1)
        )
      {% endif %}"
    ],
    post_hook=[
      "UPDATE mds_load.load_customer SET is_processed = 1, load_timestamp = GETUTCDATE() WHERE is_processed = 0"
    ]
  )
}}

{#
  MDS Master Customer Table - SCD Type 2
  
  Source: mds_load.load_customer (from Deploy API)
  Target: mds_master.customer (SCD2 historized)
  
  Logic:
  1. PRE-HOOK: Close existing current records (set is_current=0)
  2. SELECT: Insert new versions of changed records  
  3. POST-HOOK: Mark source records as processed
#}

{% if is_incremental() %}

-- Get unprocessed load records for incremental load
WITH source_data AS (
    SELECT 
        load_id,
        business_key,
        business_key_hash,
        operation,
        customer_id,
        name,
        email,
        phone,
        address,
        city,
        country_id,
        is_active,
        deployment_id,
        source_staged_record_id,
        load_user,
        load_timestamp
    FROM mds_load.load_customer
    WHERE is_processed = 0
),

-- Detect changes by comparing with current records
changes AS (
    SELECT 
        s.*,
        t.business_key AS existing_business_key,
        t.is_current AS existing_is_current,
        CASE 
            WHEN t.business_key IS NULL THEN 'NEW'
            WHEN s.operation = 'DELETE' THEN 'DELETE'
            WHEN s.operation = 'UPDATE' OR (
                -- Detect actual data changes
                COALESCE(CAST(s.customer_id AS NVARCHAR(MAX)), '') != COALESCE(CAST(t.customer_id AS NVARCHAR(MAX)), '') OR
                COALESCE(s.name, '') != COALESCE(t.name, '') OR
                COALESCE(s.email, '') != COALESCE(t.email, '') OR
                COALESCE(s.phone, '') != COALESCE(t.phone, '') OR
                COALESCE(s.address, '') != COALESCE(t.address, '') OR
                COALESCE(s.city, '') != COALESCE(t.city, '') OR
                COALESCE(CAST(s.country_id AS NVARCHAR(MAX)), '') != COALESCE(CAST(t.country_id AS NVARCHAR(MAX)), '') OR
                COALESCE(CAST(s.is_active AS NVARCHAR(1)), '') != COALESCE(CAST(t.is_active AS NVARCHAR(1)), '')
            ) THEN 'CHANGED'
            ELSE 'NO_CHANGE'
        END AS change_type
    FROM source_data s
    LEFT JOIN {{ this }} t 
        ON s.business_key = t.business_key 
        AND t.is_current = 1
)

-- For incremental: Insert new versions of changed records
SELECT
    business_key,
    business_key_hash,
    customer_id,
    name,
    email,
    phone,
    address,
    city,
    country_id,
    is_active,
    load_timestamp AS valid_from,
    CAST('9999-12-31' AS DATETIME2) AS valid_to,
    CAST(1 AS BIT) AS is_current,
    CASE WHEN operation = 'DELETE' THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS is_deleted,
    source_staged_record_id AS source_load_id,
    GETUTCDATE() AS created_at,
    'dbt' AS created_by,
    CAST(NULL AS DATETIME2) AS updated_at,
    CAST(NULL AS NVARCHAR(100)) AS updated_by
FROM changes
WHERE change_type IN ('NEW', 'CHANGED', 'DELETE')

{% else %}

-- For full refresh: Load all records from load table
SELECT
    business_key,
    business_key_hash,
    customer_id,
    name,
    email,
    phone,
    address,
    city,
    country_id,
    is_active,
    load_timestamp AS valid_from,
    CAST('9999-12-31' AS DATETIME2) AS valid_to,
    CAST(1 AS BIT) AS is_current,
    CASE WHEN operation = 'DELETE' THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS is_deleted,
    source_staged_record_id AS source_load_id,
    GETUTCDATE() AS created_at,
    'dbt' AS created_by,
    CAST(NULL AS DATETIME2) AS updated_at,
    CAST(NULL AS NVARCHAR(100)) AS updated_by
FROM mds_load.load_customer
WHERE is_processed = 0

{% endif %}
