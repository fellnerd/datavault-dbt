/*
 * Macros: drop_security_policy / apply_security_policy
 *
 * Native SQL Server Security Policy fuer PHYSISCHE Mart-Tabellen
 * (z.B. mart_finance.fakt_buchungen). Views verwenden stattdessen
 * das rls_filter-Macro.
 *
 * WICHTIG - beide Hooks sind Pflicht und nur paarweise verwenden:
 * Eine Tabelle mit gebundener Security Policy kann nicht gedroppt werden.
 * dbt droppt 'table'-Modelle bei jedem Run -> ohne pre_hook schlaegt
 * jeder dbt run fehl; ohne post_hook ist die Tabelle nach dem Run ungeschuetzt.
 *
 * Verwendung im Model (materialized='table'):
 *   {{ config(
 *       materialized='table',
 *       pre_hook=["{{ drop_security_policy() }}"],
 *       post_hook=["{{ apply_security_policy('finance') }}"]
 *   ) }}
 *
 * Policy-Name: sec.policy_<modelname> (z.B. sec.policy_fakt_buchungen)
 */

{% macro drop_security_policy() %}
    {% set policy_name = 'policy_' ~ this.identifier %}

    IF EXISTS (
        SELECT 1 FROM sys.security_policies sp
        JOIN sys.schemas s ON s.schema_id = sp.schema_id
        WHERE sp.name = '{{ policy_name }}' AND s.name = 'sec'
    )
    BEGIN
        DROP SECURITY POLICY sec.[{{ policy_name }}]
    END
{% endmacro %}


{% macro apply_security_policy(security_context, sec_value_key_column='dss_sec_value_key') %}
    {% set policy_name = 'policy_' ~ this.identifier %}

    IF NOT EXISTS (
        SELECT 1 FROM sys.security_policies sp
        JOIN sys.schemas s ON s.schema_id = sp.schema_id
        WHERE sp.name = '{{ policy_name }}' AND s.name = 'sec'
    )
    BEGIN
        EXEC('
            CREATE SECURITY POLICY sec.[{{ policy_name }}]
            ADD FILTER PREDICATE sec.fn_check_rls([{{ sec_value_key_column }}], ''{{ security_context }}'')
            ON [{{ this.schema }}].[{{ this.identifier }}]
            WITH (STATE = ON)
        ')
    END
{% endmacro %}
