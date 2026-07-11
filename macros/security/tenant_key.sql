/*
 * Macro: tenant_key
 *
 * Liefert den Mandanten-Schluessel (tenant_key) des aktuellen dbt-Targets.
 * Grundlage der Mandantentrennung im dss_sec_value_key (erstes Segment).
 *
 * Ableitung:
 *   Target ewb / ewb-dev / ewb-test  ->  'ewb'
 *   Target jira                      ->  'jira'
 *   sonst                            ->  var('tenant_key', 'ewb')
 *
 * Verwendung:
 *   {{ tenant_key() }}   ->   ewb
 */

{% macro tenant_key() %}
    {%- if target.name.startswith('ewb') -%}
        {{- 'ewb' -}}
    {%- elif target.name.startswith('jira') -%}
        {{- 'jira' -}}
    {%- else -%}
        {{- var('tenant_key', 'ewb') -}}
    {%- endif -%}
{% endmacro %}


/*
 * Macro: sec_value_key
 *
 * Baut den RLS-Schluessel dss_sec_value_key als SQL-Ausdruck:
 *   Mandant (tenant_key) + optionaler Kontextwert, getrennt durch '||'.
 *
 * Verwendung im Model-SQL (SELECT-Liste):
 *   {{ sec_value_key() }}                    AS dss_sec_value_key   -- 'ewb'
 *   {{ sec_value_key("CAST(kst AS NVARCHAR(50))") }}
 *                                            AS dss_sec_value_key   -- 'ewb||<kst>'
 */

{% macro sec_value_key(context_expr=none) %}
    {%- if context_expr -%}
        CONCAT_WS('||', '{{ tenant_key() }}', {{ context_expr }})
    {%- else -%}
        '{{ tenant_key() }}'
    {%- endif -%}
{% endmacro %}
