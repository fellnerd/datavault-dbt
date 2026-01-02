# Static Tables

Dieser Ordner enthält persistierte Mart-Tabellen mit den folgenden Eigenschaften:

- **Schema:** `mart_static`
- **Materialisierung:** `incremental` (MERGE-Strategie)
- **Index:** Non-Clustered auf Hash Key
- **Tag:** `static`

## Verwendung

```bash
# Initial Load
dbt run --select <table_name> --full-refresh

# Inkrementelles Update
dbt run --select <table_name>

# Alle Static Tables
dbt run --select tag:static
```

## Erstellen

Mit dem Agent-Tool:
```
Tool: create_static_table
```

Oder mit dem Command:
```
/create-static-table <name>
```
