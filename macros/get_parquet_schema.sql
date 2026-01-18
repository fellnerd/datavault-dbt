{% macro get_parquet_schema(folder_path, file_name) %}
{#
    Liest das Schema einer Parquet-Datei und gibt es als YAML für sources.yml aus.
    
    Verwendung:
        dbt run-operation get_parquet_schema --args '{"folder_path": "jira/sql", "file_name": "Platform.Api_Project.parquet"}'
    
    Output:
        YAML-Format für dbt-external-tables sources.yml
#}

{% set file_path = folder_path ~ '/' ~ file_name %}

{# Generiere External Table Name aus Dateiname #}
{% set table_name = 'ext_' ~ file_name 
    | replace('.parquet', '') 
    | replace('.', '_') 
    | lower %}

{# Query um Schema zu lesen - sp_describe_first_result_set gibt Metadaten zurück #}
{% set schema_query %}
    EXEC sp_describe_first_result_set N'
        SELECT TOP 0 * 
        FROM OPENROWSET(
            BULK ''{{ file_path }}'',
            DATA_SOURCE = ''StageFileSystem'',
            FORMAT = ''PARQUET''
        ) AS r
    '
{% endset %}

{% set results = run_query(schema_query) %}

{% if execute %}
    {{ log("", info=True) }}
    {{ log("      - name: " ~ table_name, info=True) }}
    {{ log('        description: "Auto-generated from ' ~ file_name ~ '"', info=True) }}
    {{ log("        external:", info=True) }}
    {{ log('          location: "' ~ file_path ~ '"', info=True) }}
    {{ log("          file_format: ParquetFormat", info=True) }}
    {{ log("          data_source: StageFileSystem", info=True) }}
    {{ log("        columns:", info=True) }}
    
    {% for row in results %}
        {% set col_name = row['name'] %}
        {% set sql_type = row['system_type_name'] | upper %}
        
        {# Typ-Mapping: Parquet/OPENROWSET → dbt-external-tables kompatibel #}
        {% if sql_type == 'VARCHAR(8000)' %}
            {% set sql_type = 'NVARCHAR(4000)' %}
        {% elif sql_type == 'VARCHAR(MAX)' %}
            {% set sql_type = 'NVARCHAR(MAX)' %}
        {% elif 'DECIMAL(38,18)' in sql_type or 'NUMERIC(38,18)' in sql_type %}
            {% set sql_type = 'DECIMAL(38,10)' %}
        {% elif sql_type == 'FLOAT' %}
            {% set sql_type = 'FLOAT' %}
        {% elif sql_type == 'REAL' %}
            {% set sql_type = 'REAL' %}
        {% elif sql_type == 'BIGINT' %}
            {% set sql_type = 'BIGINT' %}
        {% elif sql_type == 'INT' %}
            {% set sql_type = 'INT' %}
        {% elif sql_type == 'SMALLINT' %}
            {% set sql_type = 'SMALLINT' %}
        {% elif sql_type == 'TINYINT' %}
            {% set sql_type = 'TINYINT' %}
        {% elif sql_type == 'BIT' %}
            {% set sql_type = 'BIT' %}
        {% elif sql_type == 'DATE' %}
            {% set sql_type = 'DATE' %}
        {% elif 'DATETIME2' in sql_type %}
            {% set sql_type = 'DATETIME2' %}
        {% elif 'DATETIMEOFFSET' in sql_type %}
            {% set sql_type = 'DATETIMEOFFSET' %}
        {% elif sql_type == 'TIME' %}
            {% set sql_type = 'TIME' %}
        {% elif sql_type == 'VARBINARY(MAX)' or sql_type == 'VARBINARY(8000)' %}
            {% set sql_type = 'VARBINARY(MAX)' %}
        {% elif sql_type == 'UNIQUEIDENTIFIER' %}
            {% set sql_type = 'UNIQUEIDENTIFIER' %}
        {% endif %}
        
        {{ log("          - name: " ~ col_name, info=True) }}
        {{ log("            data_type: " ~ sql_type, info=True) }}
    {% endfor %}
    
    {{ log("", info=True) }}
    {{ log("# Spalten: " ~ results | length, info=True) }}
{% endif %}

{% endmacro %}
