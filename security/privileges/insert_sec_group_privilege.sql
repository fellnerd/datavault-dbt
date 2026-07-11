/*
 * Gruppenberechtigungen vergeben: sec.sec_group_privilege
 *
 * Empfohlener Standardweg fuer RLS: die Row definiert, WAS die Gruppe
 * sehen darf; WER dazugehoert, wird in Entra ID gepflegt (IS_MEMBER-
 * Pruefung in fn_check_rls). On-/Offboarding = Gruppenmitgliedschaft
 * aendern, keine SQL-Aenderung noetig.
 *
 * group_name muss dem Entra-Gruppennamen exakt entsprechen und die
 * Gruppe muss als DB-User existieren (security/ols/users/...).
 */

-- ============================================================
-- Beispiel: Finance-Gruppe sieht den gesamten Mandanten ewb
-- ============================================================
-- INSERT INTO sec.sec_group_privilege (group_name, security_context, sec_value_key, description)
-- VALUES (N'sg-datavault-finance-ro', N'finance', N'ewb', N'Standard: Finance RO = ganzer Mandant ewb');

-- ============================================================
-- Beispiel: eigene Gruppe nur fuer einen Teilbereich
-- ============================================================
-- INSERT INTO sec.sec_group_privilege (group_name, security_context, sec_value_key, description)
-- VALUES (N'sg-datavault-finance-0100-ro', N'finance', N'ewb||0100', N'Finance RO eingeschraenkt auf BK 0100');

-- Kontrolle
SELECT * FROM sec.sec_group_privilege ORDER BY group_name, security_context;
GO
