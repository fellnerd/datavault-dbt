{% macro log_row_counts() %}
  {#
    Gibt Row Counts aller CDR/Vertrag-Tabellen aus.
    Aufruf: dbt run-operation log_row_counts --target ewb-dev
  #}
  {% set tables = [
    ('stg',          'psa_rsn_mobile_cdr_main'),
    ('vault',        'hub_vertrag'),
    ('vault',        'hub_kunde'),
    ('vault',        'link_vertrag_kunde'),
    ('vault',        'sat_kunde__compax'),
    ('vault',        'sat_vertrag_eff__compax'),
    ('vault',        'sat_vertrag_optionen_ma__compax'),
    ('vault_telecom','hub_sim'),
    ('vault_telecom','hub_msisdn'),
    ('vault_telecom','link_vertrag_sim'),
    ('vault_telecom','link_vertrag_msisdn'),
    ('vault_telecom','link_cdr_event_tl'),
    ('vault_telecom','sat_cdr_event__compax'),
  ] %}

  {% do log('', info=true) %}
  {% do log('=== Row Count Summary (' ~ target.database ~ ') ===', info=true) %}

  {% for schema, table in tables %}
    {% set rel = adapter.get_relation(
        database=target.database,
        schema=schema,
        identifier=table
    ) %}
    {% if rel %}
      {% set result = run_query("SELECT COUNT(*) AS cnt FROM " ~ rel) %}
      {% set cnt = result.columns[0].values()[0] %}
      {% do log('  %-45s %s rows' | format(schema ~ '.' ~ table, cnt), info=true) %}
    {% else %}
      {% do log('  %-45s (not deployed yet)' | format(schema ~ '.' ~ table), info=true) %}
    {% endif %}
  {% endfor %}

  {% do log('==========================================', info=true) %}
  {% do log('', info=true) %}
{% endmacro %}
