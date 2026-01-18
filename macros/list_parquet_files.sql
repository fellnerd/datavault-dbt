{% macro list_parquet_files(folder_path) %}
{#
    Listet alle Parquet-Dateien in einem ADLS-Verzeichnis auf.
    
    Verwendung:
        dbt run-operation list_parquet_files --args '{"folder_path": "jira/sql"}'
        dbt run-operation list_parquet_files --args '{"folder_path": "werkportal/postgres"}'
    
    Voraussetzung:
        - External Data Source "StageFileSystem" muss existieren
        - Zugriff auf ADLS über OPENROWSET
#}

{% set query %}
    SELECT DISTINCT
        -- Extrahiere nur den Dateinamen (nach dem letzten /)
        REVERSE(LEFT(REVERSE(r.filepath()), CHARINDEX('/', REVERSE(r.filepath())) - 1)) AS file_name,
        r.filepath() AS full_path
    FROM OPENROWSET(
        BULK '{{ folder_path }}/*.parquet',
        DATA_SOURCE = 'StageFileSystem',
        FORMAT = 'PARQUET'
    ) AS r
    ORDER BY file_name
{% endset %}

{% set results = run_query(query) %}

{% if execute %}
    {{ log("", info=True) }}
    {{ log("=== Parquet-Dateien in '" ~ folder_path ~ "' ===", info=True) }}
    {{ log("", info=True) }}
    
    {% for row in results %}
        {{ log(row['file_name'], info=True) }}
    {% endfor %}
    
    {{ log("", info=True) }}
    {{ log("Gefunden: " ~ results | length ~ " Dateien", info=True) }}
{% endif %}

{% endmacro %}
