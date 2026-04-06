{% macro get_parquet_schema(folder_path, file_name, data_source='StageFileSystem', file_format='ParquetFormat') %}
{#
    Liest das Schema einer Parquet-Datei und gibt es als YAML für sources.yml aus.
    
    Verwendung:
        dbt run-operation get_parquet_schema --args '{folder_path: "jira/sql", file_name: "Platform.Api_Project.parquet", data_source: "StageFileSystem", file_format: "ParquetFormat"}'
    
    Parameter:
        folder_path  - Ordnerpfad relativ zur Data Source (z.B. "ewb/abacus")
        file_name    - Dateiname inkl. .parquet Extension
        data_source  - Name der SQL External Data Source (Default: StageFileSystem)
        file_format  - Name des SQL External File Format (Default: ParquetFormat)
    
    Output:
        YAML-Format für dbt-external-tables sources.yml
    
    Namenskonvention:
        ext_<concept>_<entity>
        - concept: Erster Ordner im Pfad (z.B. "jira" aus "jira/sql")
        - entity: Bereinigter Dateiname ohne Extension
#}

{% set file_path = folder_path ~ '/' ~ file_name %}

{# Extrahiere Concept aus dem Ordnerpfad (erster Ordner) #}
{% set path_parts = folder_path.split('/') %}
{% set concept = path_parts[0] | lower | replace('-', '_') | replace(' ', '_') %}

{# Bereinige Dateiname für Entity-Teil #}
{% set entity_raw = file_name 
    | replace('.parquet', '') 
    | replace('.', '_') 
    | replace('-', '_')
    | lower %}

{# Entferne bekannte Präfixe wie "platform_api_" #}
{% set entity = entity_raw 
    | replace('platform_api_', '')
    | replace('platform_', '')
    | replace('api_', '') %}

{# Generiere External Table Name: ext_<concept>_<entity> #}
{% set table_name = 'ext_' ~ concept ~ '_' ~ entity %}

{# Query um Schema zu lesen - sp_describe_first_result_set gibt Metadaten zurück #}
{% set schema_query %}
    EXEC sp_describe_first_result_set N'
        SELECT TOP 0 * 
        FROM OPENROWSET(
            BULK ''{{ file_path }}'',
            DATA_SOURCE = ''{{ data_source }}'',
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
    {{ log('          file_format: ' ~ file_format, info=True) }}
    {{ log('          data_source: ' ~ data_source, info=True) }}
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
