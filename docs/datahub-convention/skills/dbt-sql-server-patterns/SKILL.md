# dbt SQL Server Patterns

Provides SQL Server-specific patterns, workarounds, and best practices for running dbt + automate_dv on SQL Server / Azure SQL.

## When to Use

- Encountering SQL Server-specific errors or limitations
- Writing custom SQL macros for SQL Server
- Troubleshooting dbt-sqlserver or automate_dv issues
- Setting up External Tables (OPENROWSET/Parquet)
- Configuring Azure SQL Basic Tier limitations

## Prerequisites

- dbt-sqlserver adapter installed
- SQL Server 2019+ or Azure SQL
- ODBC Driver 17 or 18
- automate_dv 0.11.x

## Pattern Catalog

### 1. Hash Override (hash_override.sql)

SQL Server does not natively support automate_dv hash functions. The `hash_override.sql` macro provides:

```sql
-- Pattern: CONVERT + HASHBYTES (NOT CAST!)
CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
    CONCAT_WS('||', 
        ISNULL(LTRIM(RTRIM(CAST(col1 AS NVARCHAR(MAX)))), '-1'),
        ISNULL(LTRIM(RTRIM(CAST(col2 AS NVARCHAR(MAX)))), '-1')
    )
), 2)
```

**Critical:** Always use `CONVERT(..., 2)` — style 2 produces hex without '0x' prefix.

### 2. Incremental Strategy

SQL Server supports: `append`, `merge`, `delete+insert`.

For Data Vault (Insert-Only):
```yaml
config:
  materialized: incremental
  incremental_strategy: append
  as_columnstore: false    # REQUIRED for Azure SQL Basic Tier
```

**Why `append`?** Data Vault Raw layer is Insert-Only. No updates, no deletes.

### 3. Azure SQL Basic Tier Limitations

| Limitation | Workaround |
|-----------|-----------|
| No columnstore indexes | `as_columnstore: false` |
| No partitioning | Use date-based WHERE clauses |
| 2GB max database size | Monitor with `sp_spaceused` |
| Limited DTUs | Schedule loads off-peak |

### 4. External Tables (Parquet/ADLS)

```sql
-- Pattern in sources.yml:
tables:
  - name: ext_<concept>_<entity>
    external:
      location: "{{ var('<concept>_container') }}/<path>"
      file_format: parquet
    columns:
      - name: COLUMN_NAME
        data_type: nvarchar(4000)
```

Use `dbt run-operation stage_external_sources` to create/update.

### 5. CONCAT_WS for Business Keys

SQL Server's `CONCAT_WS` handles NULL differently than other DBs:
```sql
-- NULL values are SKIPPED by CONCAT_WS
-- Use ISNULL to replace with '-1' BEFORE concatenation
CONCAT_WS('||', 
    'default', 
    'default',
    ISNULL(LTRIM(RTRIM(BK1)), '-1'),
    ISNULL(LTRIM(RTRIM(BK2)), '-1')
)
```

### 6. Date/Time Handling

```sql
-- Current timestamp
GETDATE()           -- datetime (less precise)
SYSDATETIME()       -- datetime2(7) (more precise)

-- Minimum date (Confluence Ghost Records)
'1753-01-01'        -- datetime minimum
'0001-01-01'        -- datetime2 minimum (NOT used in Confluence!)

-- CONVERT date formats
CONVERT(VARCHAR(10), date_col, 120)   -- yyyy-mm-dd
CONVERT(DATETIME2(7), string_col, 120) -- ISO format
```

### 7. NULL Handling in Hashing

```sql
-- ISNULL preferred over COALESCE for single-value replacement
ISNULL(CAST(col AS NVARCHAR(MAX)), '-1')

-- Multi-value: COALESCE
COALESCE(col1, col2, '-1')
```

### 8. Schema Generation

The `generate_schema_name` macro strips the default schema prefix:
```sql
-- Input: custom_schema='vault_sap_co', default='dv'
-- Output: 'vault_sap_co' (NOT 'dv_vault_sap_co')
```

### 9. PSA (Persistent Staging Area)

For large External Tables, use PSA to cache data:
```yaml
config:
  materialized: incremental
  incremental_strategy: merge   # or append
  unique_key: ['BK1', 'BK2']
  as_columnstore: false
```

### 10. Windows Authentication (On-Premises)

```yaml
# profiles.yml
dev:
  type: sqlserver
  driver: "ODBC Driver 17 for SQL Server"
  server: "etl-test1"
  database: LOAD
  windows_login: true
  schema: stg
```

### 11. Azure CLI Authentication

```yaml
# profiles.yml
dev:
  type: sqlserver
  driver: "ODBC Driver 18 for SQL Server"
  server: "sql-datavault-weu-001.database.windows.net"
  database: Vault
  authentication: cli
  schema: stg
```

## Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|---------|
| `String or binary data would be truncated` | Column too small | Check NVARCHAR length in source |
| `Cannot insert duplicate key` | Incremental not filtering | Check `is_incremental()` logic |
| `Invalid object name 'stg.ext_*'` | External table missing | `dbt run-operation stage_external_sources` |
| `HASHBYTES returns varbinary` | Using CAST | Change to CONVERT(..., 2) |
| `Columnstore not supported` | Azure Basic Tier | Set `as_columnstore: false` |
| `Login failed for user` | Auth issue | Check windows_login or cli auth |
| `Schema 'dv_vault_sap' does not exist` | generate_schema_name missing | Check macro returns custom_schema directly |
| `CONCAT_WS skips NULLs` | Missing ISNULL | Wrap each column in ISNULL(..., '-1') |

## Performance Tips

1. **Use CONVERT not CAST** for hashing — CAST can truncate datetime/float
2. **LTRIM/RTRIM** in hash_override — avoids space-induced hash mismatches
3. **Avoid SELECT *** — list columns explicitly in staging
4. **Batch External Table creation** — `stage_external_sources` creates all at once
5. **Monitor compile time** — large YAML blocks slow down `dbt compile`

## References

- `references/sqlserver-patterns.md` - SQL Server syntax quick reference
- `macros/hash_override.sql` - Project hash implementation
- `macros/generate_schema_name.sql` - Schema routing logic
- `macros/stage_external_sources_selective.sql` - External table management

---
name: dbt-sql-server-patterns
description: 'SQL Server-specific patterns and workarounds for dbt and automate_dv including hash override, incremental strategy, Azure SQL limitations, external tables, and authentication. Use when encountering SQL Server errors or setting up new environments. Keywords: SQL Server Azure hash CONVERT HASHBYTES external table OPENROWSET columnstore'
---
