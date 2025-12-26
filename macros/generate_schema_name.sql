/*
 * Custom Schema Macro für Data Vault
 * 
 * Überschreibt das Standard dbt-sqlserver Verhalten.
 * Statt: <target_schema>_<custom_schema>
 * Jetzt: <custom_schema> (ohne Prefix)
 * 
 * Ergebnis:
 *   - staging models → [stage]
 *   - vault models   → [vault]
 */

{% macro generate_schema_name(custom_schema_name, node) -%}
    {%- set default_schema = target.schema -%}
    
    {%- if custom_schema_name is none -%}
        {{ default_schema }}
    {%- else -%}
        {{ custom_schema_name | trim }}
    {%- endif -%}
{%- endmacro %}
