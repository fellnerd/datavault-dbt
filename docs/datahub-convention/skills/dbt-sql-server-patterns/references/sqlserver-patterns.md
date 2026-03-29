# SQL Server Syntax Quick Reference for dbt

## Data Types (Confluence-relevant)

| DV Concept | SQL Server Type | Notes |
|-----------|----------------|-------|
| Hash Key | `CHAR(64)` | SHA2_256 hex output |
| Business Key | `NVARCHAR(255)` | Unicode support |
| dss_record_source | `VARCHAR(255)` | ASCII sufficient |
| dss_load_date | `DATETIME2(7)` | Highest precision |
| dss_create_datetime | `DATETIME2(7)` | Highest precision |
| dss_business_key | `NVARCHAR(255)` | Concatenated BK |
| dss_is_current | `CHAR(1)` | 'Y' or 'N' |
| dss_deleted | `CHAR(1)` | 'Y' or 'N' |
| dss_version | `INT` | Starting at 1 |
| dss_end_datetime | `DATETIME2(7)` | Current: 9999-12-31 |

## Hash Functions

```sql
-- SHA2_256 (Confluence Standard)
CONVERT(CHAR(64), HASHBYTES('SHA2_256', input), 2)

-- NEVER use:
CAST(HASHBYTES('SHA2_256', input) AS CHAR(64))  -- WRONG! Truncates!
```

## String Functions

```sql
-- Trimming (Confluence: LTRIM + RTRIM)
LTRIM(RTRIM(column_name))

-- Concatenation with separator
CONCAT_WS('||', val1, val2, val3)

-- NULL handling
ISNULL(expression, '-1')
COALESCE(expr1, expr2, '-1')

-- Type conversion
CAST(column AS NVARCHAR(MAX))
CONVERT(NVARCHAR(MAX), column)        -- Preferred for dates
CONVERT(VARCHAR(10), date_col, 120)   -- yyyy-mm-dd format
```

## Date Functions

```sql
-- Current timestamp
GETDATE()                    -- datetime
SYSDATETIME()                -- datetime2(7)
SYSUTCDATETIME()            -- datetime2(7) UTC

-- Ghost Record dates
'1753-01-01T00:00:00.000'   -- datetime minimum
'9999-12-31T23:59:59.999'   -- datetime maximum (current record end)

-- Date arithmetic (for dss_end_datetime calculation)
DATEADD(NANOSECOND, -100, next_start_datetime)  -- "minus 100ns"
```

## Window Functions (for Current Views)

```sql
-- Next start datetime (for dss_end_datetime)
LEAD(dss_load_date) OVER (
    PARTITION BY hk_entity 
    ORDER BY dss_load_date
) AS next_load_date

-- Version number
ROW_NUMBER() OVER (
    PARTITION BY hk_entity 
    ORDER BY dss_load_date
) AS dss_version

-- Is current flag
CASE 
    WHEN ROW_NUMBER() OVER (
        PARTITION BY hk_entity 
        ORDER BY dss_load_date DESC
    ) = 1 THEN 'Y' 
    ELSE 'N' 
END AS dss_is_current
```

## Incremental Patterns

```sql
-- Append (Data Vault standard)
{{ config(
    materialized='incremental',
    incremental_strategy='append',
    as_columnstore=false
) }}

-- Merge (PSA pattern)
{{ config(
    materialized='incremental',
    incremental_strategy='merge',
    unique_key=['col1', 'col2'],
    as_columnstore=false
) }}
```

## External Tables

```sql
-- Manual OPENROWSET (for debugging)
SELECT TOP 10 *
FROM OPENROWSET(
    BULK 'https://storage.blob.core.windows.net/container/path/*.parquet',
    DATA_SOURCE = 'ds_adls',
    FORMAT = 'PARQUET'
) AS [result]

-- Check external table exists
SELECT * FROM sys.external_tables 
WHERE name = 'ext_concept_entity'
```

## System Queries (Useful for Auditing)

```sql
-- All vault tables
SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA LIKE 'vault%'
ORDER BY TABLE_SCHEMA, TABLE_NAME

-- Column details
SELECT c.name, t.name AS type, c.max_length, c.is_nullable
FROM sys.columns c
JOIN sys.types t ON c.user_type_id = t.user_type_id
WHERE c.object_id = OBJECT_ID('vault_sap_co.hub_catsco')

-- Row counts
SELECT s.name AS [schema], t.name AS [table], 
       SUM(p.rows) AS row_count
FROM sys.tables t
JOIN sys.schemas s ON t.schema_id = s.schema_id
JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0,1)
WHERE s.name LIKE 'vault%'
GROUP BY s.name, t.name
ORDER BY s.name, t.name
```
