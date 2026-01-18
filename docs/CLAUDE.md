# Claude Code Instructions - Data Vault dbt Project

## MCP Server

This project includes a custom MCP server (`datavault-agent`) running on `http://10.0.0.25:3001`.
Use the MCP tools for all Data Vault operations instead of manual file editing.

## Interaction Style

### Always Ask Before Acting

**Before creating any Data Vault object**, present options to the user and wait for selection:

```
Which type of object do you want to create?

1. Hub
   Core business entity (e.g., hub_customer, hub_product)
2. Satellite
   Attributes with history tracking
3. Link
   Relationship between entities
4. Staging View
   Prepare source data with hash calculations
5. Mart View
   Flattened view for BI/reporting
6. Type something else
```

### Confirm Destructive Actions

**Always ask for confirmation before:**
- `dbt run --full-refresh` (loses history!)
- `delete_model`
- Any ALTER TABLE or DROP statements
- Modifying existing models

### Present Choices Clearly

When multiple options exist, use numbered lists:

```
Which entity should the satellite belong to?

1. company
   Existing: hub_company, sat_company
2. project
   Existing: hub_project, sat_project
3. invoice
   Existing: hub_invoice, sat_invoice
4. Create new entity
```

### Validate Before Executing

After gathering requirements, **always summarize and confirm**:

```
I'll create the following:

📄 models/staging/stg_product.sql
   - Hash Key: hk_product (SHA256 of object_id)
   - Hash Diff: hd_product
   - Payload: name, price, category, description

📄 models/raw_vault/hubs/hub_product.sql
📄 models/raw_vault/satellites/sat_product.sql

Proceed? (y/n)
```

## Data Vault Workflow

### Creating a New Entity (Full Flow)

1. **Ask for entity name** and source table
2. **Show available columns** from external table
3. **Ask which columns** for Business Key vs Payload
4. **Show preview** of files to be created
5. **Wait for confirmation**
6. **Create files** using MCP tools (not cat/echo!)
7. **Run dbt** and show results

### Adding Attributes to Existing Satellite

1. **List current attributes** in the satellite
2. **Show available attributes** from source (use `suggest_attributes` tool)
3. **Ask which to add**
4. **Explain impact** (new columns will have NULL for existing rows)
5. **Confirm and execute**

### Creating a Mart View

1. **Ask purpose** (current data, historical, aggregated?)
2. **Show available entities** and their relationships
3. **Ask which entities to join**
4. **Ask which columns to include**
5. **Preview the SQL**
6. **Confirm and create**

## Tool Usage Rules

### DO Use MCP Tools For:
- `create_hub`, `create_satellite`, `create_link`, `create_staging`, `create_mart`
- `list_entities`, `get_entity_info`, `suggest_attributes`
- `run_command` for dbt operations
- `db_*` tools for database queries (read-only!)

### DO NOT:
- Use `cat >` or `echo >` to create SQL files
- Use `run_command` with shell redirects to create files
- Modify database directly (only via dbt)
- Run `--full-refresh` without explicit user confirmation

## Schema Information

```
Schemas:
- stg.*          External Tables + Staging Views
- vault.*        Hubs, Satellites, Links, PITs
- mart_*.*       Business context views (mart_project, mart_finance, etc.)

Naming:
- Hub:       hub_<entity>
- Satellite: sat_<entity>
- Link:      link_<entity1>_<entity2>
- Staging:   stg_<entity>
- Mart:      v_<descriptive_name>
```

## Common Workflows

### "Create a new entity"
→ Ask: What's the entity name? What's the source table?
→ Show: External table columns
→ Ask: Which columns for business key? Which for payload?
→ Confirm: Preview files
→ Execute: create_staging → create_hub → create_satellite → dbt run

### "Add attribute to satellite"
→ Show: Current attributes + available from source
→ Ask: Which to add?
→ Warn: Existing rows will have NULL
→ Confirm: Edit model
→ Execute: edit_model → dbt run (with on_schema_change: append_new_columns)

### "Show me data from X"
→ Use: db_preview_data or db_run_query
→ Format: Clean table output

### "Run dbt"
→ Ask: Which models? (if not specified)
→ Execute: run_command with dbt run
→ Show: Formatted results with model status table

## Language

Respond in the same language as the user (German or English).
