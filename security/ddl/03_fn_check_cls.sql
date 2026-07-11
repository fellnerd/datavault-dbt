/*
 * sec.fn_check_cls - zentrale CLS-Pruefefunktion
 *
 * Binaere Pruefung pro Security-Kontext (Spalte sichtbar: ja/nein),
 * ohne sec_value_key. Verwendet vom dbt-Macro cls_mask:
 *
 *   CASE WHEN EXISTS (SELECT 1 FROM sec.fn_check_cls('person_pii'))
 *        THEN nachname ELSE '***' END
 *
 * Berechtigungsquellen (analog fn_check_rls):
 *   (1) Global-Admin / Service-User (no_sec = 1)
 *   (2) Kontext-Admin (no_sec = 2 + Kontext)
 *   (3) Einzelrecht: Row in sec_user_privilege mit passendem Kontext
 *       (sec_value_key-Konvention fuer CLS: '*')
 *   (4) Gruppenrecht: Row in sec_group_privilege + IS_MEMBER
 */

CREATE OR ALTER FUNCTION sec.fn_check_cls
(
    @security_context NVARCHAR(100)
)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
SELECT 1 AS is_allowed
WHERE
    -- (1) Global-Admin / Service-User
    EXISTS (
        SELECT 1
        FROM sec.sec_special_user_privilege sp
        WHERE sp.user_name = ORIGINAL_LOGIN()
          AND sp.no_sec = 1
    )
    -- (2) Kontext-Admin
    OR EXISTS (
        SELECT 1
        FROM sec.sec_special_user_privilege sp
        WHERE sp.user_name = ORIGINAL_LOGIN()
          AND sp.no_sec = 2
          AND sp.security_context = @security_context
    )
    -- (3) Einzelrecht (UPN) mit Gueltigkeitszeitraum
    OR EXISTS (
        SELECT 1
        FROM sec.sec_user_privilege up
        WHERE up.user_name = ORIGINAL_LOGIN()
          AND up.security_context = @security_context
          AND (up.valid_from IS NULL OR up.valid_from <= SYSUTCDATETIME())
          AND (up.valid_to   IS NULL OR up.valid_to   >= SYSUTCDATETIME())
    )
    -- (4) Gruppenrecht via Entra-Gruppenmitgliedschaft
    OR EXISTS (
        SELECT 1
        FROM sec.sec_group_privilege gp
        WHERE gp.security_context = @security_context
          AND IS_MEMBER(gp.group_name) = 1
    );
GO
