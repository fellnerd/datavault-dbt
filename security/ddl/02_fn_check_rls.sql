/*
 * sec.fn_check_rls - zentrale RLS-Pruefefunktion
 *
 * Inline Table-Valued Function (Performance!) mit vier OR-Zweigen:
 *   (1) Global-Admin / dbt-Service-User (no_sec = 1)   -> Bypass
 *   (2) Kontext-Admin (no_sec = 2 + Kontext)           -> Bypass im Kontext
 *   (3) Einzelrecht via UPN (sec_user_privilege)
 *   (4) Gruppenrecht via Entra-Gruppe (IS_MEMBER)
 *
 * Identitaet: ORIGINAL_LOGIN() liefert den UPN des tatsaechlichen Logins.
 *   USER_NAME() ist bei Login via Entra-Gruppenmitgliedschaft der
 *   GRUPPENNAME und darf hier NICHT verwendet werden!
 *
 * Hierarchisches Matching: ein Recht auf 'ewb' berechtigt auch fuer
 *   'ewb||0100', 'ewb||...' (Prefix-Logik mit '||'-Trenner).
 *
 * Verwendung:
 *   - Views:    WHERE EXISTS (SELECT 1 FROM sec.fn_check_rls(dss_sec_value_key, 'finance'))
 *               (via dbt-Macro rls_filter)
 *   - Tabellen: CREATE SECURITY POLICY ... ADD FILTER PREDICATE
 *               sec.fn_check_rls(dss_sec_value_key, 'finance') ON ...
 *               (via dbt-Macro apply_security_policy)
 */

CREATE OR ALTER FUNCTION sec.fn_check_rls
(
    @sec_value_key    NVARCHAR(500),
    @security_context NVARCHAR(100)
)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
SELECT 1 AS is_allowed
WHERE
    -- (1) Global-Admin / Service-User: kompletter Bypass
    EXISTS (
        SELECT 1
        FROM sec.sec_special_user_privilege sp
        WHERE sp.user_name = ORIGINAL_LOGIN()
          AND sp.no_sec = 1
    )
    -- (2) Kontext-Admin: Bypass innerhalb des Security-Kontexts
    OR EXISTS (
        SELECT 1
        FROM sec.sec_special_user_privilege sp
        WHERE sp.user_name = ORIGINAL_LOGIN()
          AND sp.no_sec = 2
          AND sp.security_context = @security_context
    )
    -- (3) Einzelrecht (UPN) mit Prefix-Hierarchie und Gueltigkeitszeitraum
    OR EXISTS (
        SELECT 1
        FROM sec.sec_user_privilege up
        WHERE up.user_name = ORIGINAL_LOGIN()
          AND up.security_context = @security_context
          AND (   @sec_value_key = up.sec_value_key
               OR @sec_value_key LIKE up.sec_value_key + N'||%')
          AND (up.valid_from IS NULL OR up.valid_from <= SYSUTCDATETIME())
          AND (up.valid_to   IS NULL OR up.valid_to   >= SYSUTCDATETIME())
    )
    -- (4) Gruppenrecht via Entra-Gruppenmitgliedschaft
    OR EXISTS (
        SELECT 1
        FROM sec.sec_group_privilege gp
        WHERE gp.security_context = @security_context
          AND (   @sec_value_key = gp.sec_value_key
               OR @sec_value_key LIKE gp.sec_value_key + N'||%')
          AND IS_MEMBER(gp.group_name) = 1
    );
GO
