{% macro cleanup_old_objects() %}
    {% set cleanup_sql %}
        DROP VIEW IF EXISTS vault.v_sat_company_current;
        DROP VIEW IF EXISTS business.company_current_v;
    {% endset %}
    
    {% do run_query(cleanup_sql) %}
    {{ log("Alte Views gelöscht: vault.v_sat_company_current, business.company_current_v", info=True) }}
{% endmacro %}
