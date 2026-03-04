{#
    SQL Server PolyBase External Table Creator (Selective)
    
    Erstellt einzelne External Tables für Parquet-Dateien.
    Optimiert: Nur eine neue Tabelle, nicht alle auf einmal.
    
    Verwendung:
      dbt run-operation create_external_table --args '{"table_name": "ext_jira_project"}'
    
    Die Tabellendefinition wird aus sources.yml gelesen.
#}

{% macro create_external_table(table_name, source_name="staging", schema_name="stg") %}
    
    {# Graph aus dbt laden #}
    {% set sources = graph.sources.values() | selectattr("source_name", "equalto", source_name) | list %}
    {% set ext_source = sources | selectattr("name", "equalto", table_name) | first %}
    
    {% if not ext_source %}
        {{ exceptions.raise_compiler_error("Source '" ~ table_name ~ "' not found in source '" ~ source_name ~ "'") }}
    {% endif %}
    
    {% set external_config = ext_source.external %}
    {% set columns = ext_source.columns %}
    
    {% if not external_config %}
        {{ exceptions.raise_compiler_error("No external config found for '" ~ table_name ~ "'") }}
    {% endif %}
    
    {# SQL Spalten generieren - Fix für dbt Source-Struktur #}
    {% set column_defs = [] %}
    {% for col_name in columns.keys() %}
        {% set col_config = columns[col_name] %}
        {% do column_defs.append("[" ~ col_name ~ "] " ~ col_config.data_type) %}
    {% endfor %}
    
    {% if execute %}
        {{ log("", info=true) }}
        {{ log("=== Creating External Table: [" ~ schema_name ~ "].[" ~ table_name ~ "] ===", info=true) }}
        {{ log("Location: " ~ external_config.location, info=true) }}
        {{ log("Columns: " ~ column_defs|length, info=true) }}
        
        {# DROP falls existiert #}
        {% set drop_sql %}
            IF EXISTS (SELECT * FROM sys.external_tables WHERE name = '{{ table_name }}' AND schema_id = SCHEMA_ID('{{ schema_name }}'))
                DROP EXTERNAL TABLE [{{ schema_name }}].[{{ table_name }}];
        {% endset %}
        
        {% do run_query(drop_sql) %}
        {{ log("✓ Dropped (if existed)", info=true) }}
        
        {# CREATE #}
        {% set create_sql %}
            CREATE EXTERNAL TABLE [{{ schema_name }}].[{{ table_name }}] (
                {{ column_defs | join(",\n                ") }}
            )
            WITH (
                LOCATION = '/{{ external_config.location }}',
                DATA_SOURCE = {{ external_config.data_source }},
                FILE_FORMAT = {{ external_config.file_format }}
            );
        {% endset %}
        
        {% do run_query(create_sql) %}
        {{ log("✓ Created successfully!", info=true) }}
        {{ log("", info=true) }}
    {% endif %}
    
{% endmacro %}
