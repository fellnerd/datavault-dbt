/*
 * Test: dbt-Service-User-Exemption vorhanden
 *
 * Der Login, unter dem dbt laeuft, MUSS in sec.sec_special_user_privilege
 * mit no_sec = 1 stehen. Fehlt die Row, filtern Security Policies die
 * dbt-eigenen Lesezugriffe -> leere Marts/Tests OHNE Fehlermeldung.
 *
 * Der Test ist selbst-guarded: existiert das sec-Schema (noch) nicht
 * (Tenant vor Security-Rollout), kompiliert er zu einem No-op.
 */

{% set sec_exists = false %}
{% if execute %}
    {% set check_query %}
        SELECT COUNT(*) AS c
        FROM sys.tables t
        JOIN sys.schemas s ON s.schema_id = t.schema_id
        WHERE s.name = 'sec' AND t.name = 'sec_special_user_privilege'
    {% endset %}
    {% set sec_exists = run_query(check_query).columns[0][0] > 0 %}
{% endif %}

{% if sec_exists %}
SELECT
    N'dbt-Service-User-Exemption (no_sec=1) fehlt fuer Login: ' + ORIGINAL_LOGIN() AS problem
WHERE NOT EXISTS (
    SELECT 1
    FROM sec.sec_special_user_privilege
    WHERE user_name = ORIGINAL_LOGIN()
      AND no_sec = 1
)
{% else %}
-- sec-Schema noch nicht deployed -> Test uebersprungen (No-op)
SELECT CAST(NULL AS NVARCHAR(255)) AS problem WHERE 1 = 0
{% endif %}
