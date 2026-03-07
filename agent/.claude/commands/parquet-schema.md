---
description: Zeige das Schema einer Parquet-Datei als YAML für sources.yml
---

# Parquet-Schema abrufen

Liest das Schema einer Parquet-Datei und gibt es als YAML für dbt-external-tables sources.yml aus.

## Parameter

- `folder_path` (required): Pfad zum Ordner in ADLS
- `file_name` (required): Name der Parquet-Datei

## Beispiel

```
Zeige das Schema von Platform.Api_Project.parquet im Ordner jira/sql
```

## Workflow

1. Erst `list_parquet_files` aufrufen um Dateinamen zu finden
2. Dann `get_parquet_schema` für die gewünschte Datei
3. YAML-Ausgabe in sources.yml kopieren

## Typ-Mapping

| Parquet/OPENROWSET | → | dbt-external-tables |
|-------------------|---|---------------------|
| VARCHAR(8000) | → | NVARCHAR(4000) |
| DECIMAL(38,18) | → | DECIMAL(38,10) |
| BIT | → | BIT |
| DATETIME2 | → | DATETIME2 |
