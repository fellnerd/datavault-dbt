# Data Vault Compliance Audit

Performs a comprehensive audit of Data Vault models against Confluence ITDATAH guidelines. Checks hashing rules, naming conventions, technical attributes, ghost records, and structural integrity.

## When to Use

- After creating or modifying Data Vault models
- Before merging a Pull Request
- Periodic compliance review of the entire Data Vault
- When onboarding a new developer (verify understanding)
- When the Confluence guidelines change

## Prerequisites

- dbt project with automate_dv models
- Access to compiled SQL (`dbt compile`)
- Understanding of Confluence ITDATAH guidelines

## Audit Categories

### 1. Hashing Compliance (Confluence §4)

Check every staging view for:

| Rule | Check | Severity |
|------|-------|----------|
| SHA2_256 | Algorithm is SHA2_256 | CRITICAL |
| CHAR(64) | Output type is CHAR(64) | CRITICAL |
| CONVERT | Uses CONVERT not CAST | CRITICAL |
| Separator `\|\|` | Double pipe separator | CRITICAL |
| NULL → '-1' | null_placeholder_string = '-1' | CRITICAL |
| LTRIM/RTRIM | Applied to all hash columns | HIGH |
| BK Alphabetical | Business Keys sorted alphabetically | HIGH |

**How to verify:**
```bash
dbt compile --select staging
# Then check target/compiled/ for HASHBYTES calls
```

### 2. Naming Convention (Confluence §5)

| Object | Expected Pattern | Check |
|--------|-----------------|-------|
| Hub | `hub_{concept}` | No plural, lowercase |
| Satellite | `sat_{hub}__{system}` | Double underscore separator |
| Link | `link_{hub1}_{hub2}` | Min. 2 hubs in name |
| Hash Key | `hk_{entity}` | Matches entity name |
| Hash Diff | `hd_{entity}` | Matches entity name |
| Metadata | `dss_*` prefix | All technical columns |

**How to verify:**
```sql
-- Check all model names
SELECT TABLE_SCHEMA, TABLE_NAME 
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA LIKE 'vault%'
ORDER BY TABLE_SCHEMA, TABLE_NAME
```

### 3. Technical Attributes (Confluence §6)

Every Hub must have:
- [ ] `hk_{entity}` (CHAR(64))
- [ ] Business Key columns
- [ ] `dss_business_key` (NVARCHAR(255))
- [ ] `dss_create_datetime` (DATETIME2(7))
- [ ] `dss_load_date` (DATETIME2(7))
- [ ] `dss_record_source` (VARCHAR(255))

Every Satellite must have:
- [ ] `hk_{entity}` (CHAR(64), FK)
- [ ] `HASHDIFF` (CHAR(64))
- [ ] Payload columns
- [ ] `dss_create_datetime` (DATETIME2(7))
- [ ] `dss_load_date` (DATETIME2(7))
- [ ] `dss_record_source` (VARCHAR(255))

Every Link must have:
- [ ] `hk_link_{hub1}_{hub2}` (CHAR(64))
- [ ] FK hash keys to all participating Hubs
- [ ] `dss_load_date` (DATETIME2(7))
- [ ] `dss_record_source` (VARCHAR(255))

### 4. Business Key Rules (Confluence §3)

- [ ] `dss_business_key` format: `default||default||BK1||...||BKn`
- [ ] BK columns alphabetically sorted
- [ ] NULL BK values → '-1'
- [ ] LTRIM + RTRIM applied
- [ ] No special characters (Tab, LF, FF, CR removed)

### 5. Structural Integrity

- [ ] Every Hub has at least 1 Satellite
- [ ] Every Satellite references exactly 1 Hub or Link
- [ ] Every Link connects at least 2 Hubs (except DC: 1)
- [ ] No Link-on-Link structures
- [ ] Current View exists for every Satellite

### 6. Ghost Records (Confluence §7)

- [ ] Every Hub has 1 Zero Key record (HK = '-1')
- [ ] Every Satellite has 1 Ghost Record
- [ ] Ghost Record `dss_record_source` = 'ghost_record'
- [ ] Default values per data type (see references/audit-checklist.md)

### 7. Documentation

- [ ] Schema YAML exists for every model
- [ ] Tests: not_null + unique on HK
- [ ] Tests: relationships on Sat→Hub FK
- [ ] ER Diagram exists and is up-to-date
- [ ] Comment headers complete in all SQL files

## Automated Audit Queries

```sql
-- 1. Hash Key format check (all should be CHAR(64))
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS
WHERE COLUMN_NAME LIKE 'hk_%' 
  AND (DATA_TYPE != 'char' OR CHARACTER_MAXIMUM_LENGTH != 64)

-- 2. Missing dss_record_source
SELECT t.TABLE_SCHEMA, t.TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES t
WHERE t.TABLE_SCHEMA LIKE 'vault%'
  AND NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS c
    WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA 
      AND c.TABLE_NAME = t.TABLE_NAME
      AND c.COLUMN_NAME = 'dss_record_source'
  )

-- 3. Ghost record check
SELECT 'hub_' + SUBSTRING(TABLE_NAME, 5, LEN(TABLE_NAME)) AS entity,
       COUNT(*) AS ghost_count
FROM INFORMATION_SCHEMA.TABLES t
CROSS APPLY (
    SELECT COUNT(*) AS cnt 
    FROM ... -- dynamic SQL needed
) x
WHERE TABLE_SCHEMA LIKE 'vault%' AND TABLE_NAME LIKE 'hub_%'
```

## Troubleshooting

| Finding | Severity | Fix |
|---------|----------|-----|
| CAST instead of CONVERT | CRITICAL | Update hash_override.sql |
| BK not sorted | HIGH | Reorder in staging hashed_columns |
| Missing dss_business_key | HIGH | Add to src_extra_columns in hub |
| dss_create_datetime in HASHDIFF | MEDIUM | Move from payload to src_extra_columns |
| No current view | MEDIUM | Create sat_*_current_v.sql |
| Missing schema YAML | LOW | Create _<concept>__models.yml |

## References

- `references/audit-checklist.md` - Full audit checklist
- Confluence ITDATAH sections 2-7, 14

---
name: dv-compliance-audit
description: 'Performs comprehensive Data Vault compliance audit against Confluence ITDATAH guidelines checking hashing naming attributes ghost records and structural integrity. Use after model changes or before releases. Keywords: audit compliance check validation hash naming convention quality'
---
