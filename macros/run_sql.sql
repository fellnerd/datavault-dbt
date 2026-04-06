{% macro run_sql(sql) %}
{# Ad-hoc SQL Runner für Exploration. Verwendung:
   dbt run-operation run_sql --args '{"sql": "SELECT TOP 5 * FROM stg.ext_ewb_fibu_gl_e25"}' --target ewb-dev
#}
{% set results = run_query(sql) %}
{% if execute %}
    {% set columns = results.column_names %}
    {{ log(columns | join(" | "), info=True) }}
    {{ log("---", info=True) }}
    {% for row in results %}
        {% set vals = [] %}
        {% for col in columns %}
            {% set val = row[col] %}
            {% if val is none %}{% set val = "NULL" %}{% endif %}
            {% do vals.append(val | string | truncate(60)) %}
        {% endfor %}
        {{ log(vals | join(" | "), info=True) }}
    {% endfor %}
    {{ log("--- " ~ results | length ~ " rows ---", info=True) }}
{% endif %}
{% endmacro %}
