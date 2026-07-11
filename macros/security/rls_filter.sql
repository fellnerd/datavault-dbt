/*
 * Macro: rls_filter
 *
 * Row Level Security fuer Mart-Views: erzeugt ein EXISTS-Praedikat gegen die
 * Pruefefunktion sec.fn_check_rls (siehe security/ddl/02_fn_check_rls.sql).
 *
 * Der Filter wird direkt in das View-SQL eingebettet (native Security Policies
 * koennen nicht an Views gebunden werden). Der Optimizer sieht das Praedikat
 * transparent -> Predicate Pushdown fuer Power BI DirectQuery.
 *
 * Voraussetzung: das Model fuehrt eine Spalte dss_sec_value_key,
 * aufgebaut mit dem Macro sec_value_key (Format 'tenant||kontext').
 *
 * Verwendung im View-SQL:
 *   SELECT ... FROM {{ ref('fakt_buchungen') }}
 *   WHERE {{ rls_filter('finance') }}
 *
 *   -- abweichende Schluessel-Spalte/-Ausdruck:
 *   WHERE {{ rls_filter('finance', "CONCAT_WS('||', mandant, kst)") }}
 */

{% macro rls_filter(security_context, sec_value_key_expr='dss_sec_value_key') %}
    EXISTS (
        SELECT 1
        FROM sec.fn_check_rls({{ sec_value_key_expr }}, '{{ security_context }}')
    )
{% endmacro %}
