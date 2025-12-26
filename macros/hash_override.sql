/*
 * Custom Hash Macro für SQL Server
 * 
 * Überschreibt das Standard automate_dv Hash Macro für bessere
 * Kompatibilität mit Azure SQL Database.
 */

{% macro sqlserver__hash(columns, alias=none, is_hashdiff=false) %}

{%- if columns is string -%}
    {%- set columns = [columns] -%}
{%- endif -%}

{%- set hash_alg = var('hash', 'SHA') -%}

{%- if hash_alg == 'MD5' -%}
    CONVERT(CHAR(32), HASHBYTES('MD5', 
        CONCAT_WS('||',
            {%- for column in columns %}
            ISNULL(CAST({{ column }} AS NVARCHAR(MAX)), '')
            {%- if not loop.last %}, {% endif %}
            {%- endfor %}
        )
    ), 2)
{%- else -%}
    CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
        CONCAT_WS('||',
            {%- for column in columns %}
            ISNULL(CAST({{ column }} AS NVARCHAR(MAX)), '')
            {%- if not loop.last %}, {% endif %}
            {%- endfor %}
        )
    ), 2)
{%- endif -%}

{%- if alias %} AS {{ alias }} {%- endif %}

{% endmacro %}
