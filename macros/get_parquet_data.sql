{% macro get_parquet_data(folder_path, file_name, limit=10) %}
{#
    Liest Beispieldaten aus einer Parquet-Datei.
    
    Verwendung:
        dbt run-operation get_parquet_data --args '{"folder_path": "jira/sql", "file_name": "Platform.Api_Project.parquet"}'
        dbt run-operation get_parquet_data --args '{"folder_path": "jira/sql", "file_name": "Platform.Api_Project.parquet", "limit": 5}'
    
    Output:
        Tabellarische Ansicht der ersten N Zeilen
#}

{% set file_path = folder_path ~ '/' ~ file_name %}

{% set query %}
    SELECT TOP {{ limit }} *
    FROM OPENROWSET(
        BULK '{{ file_path }}',
        DATA_SOURCE = 'StageFileSystem',
        FORMAT = 'PARQUET'
    ) AS r
{% endset %}

{% set results = run_query(query) %}

{% if execute %}
    {{ log("", info=True) }}
    {{ log("=== Daten aus '" ~ file_name ~ "' (TOP " ~ limit ~ ") ===", info=True) }}
    {{ log("", info=True) }}
    
    {# Spalten-Header #}
    {% set columns = results.column_names %}
    {{ log("Spalten: " ~ columns | join(", "), info=True) }}
    {{ log("", info=True) }}
    
    {# Datenzeilen #}
    {% for row in results %}
        {{ log("--- Zeile " ~ loop.index ~ " ---", info=True) }}
        {% for col in columns %}
            {% set value = row[col] %}
            {% if value is none %}
                {% set value = "NULL" %}
            {% elif value | string | length > 80 %}
                {% set value = value | string | truncate(80) %}
            {% endif %}
            {{ log("  " ~ col ~ ": " ~ value, info=True) }}
        {% endfor %}
    {% endfor %}
    
    {{ log("", info=True) }}
    {{ log("Zeilen: " ~ results | length ~ " (von max " ~ limit ~ ")", info=True) }}
{% endif %}

{% endmacro %}
