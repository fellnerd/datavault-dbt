/*
 * Sonderrechte vergeben: sec.sec_special_user_privilege
 *
 * no_sec = 1: Global-Admin / Service-User -> kompletter RLS/CLS-Bypass
 * no_sec = 2: Kontext-Admin -> Bypass nur im angegebenen security_context
 *
 * !! BASELINE - ZWINGEND VOR DER ERSTEN SECURITY POLICY AUSFUEHREN !!
 * Der dbt-Service-User braucht no_sec = 1, sonst filtert RLS die
 * dbt-eigenen Lesezugriffe (Tests, downstream-Models auf Mart-Objekten)
 * -> leere Ergebnisse ohne Fehlermeldung.
 */

-- ============================================================
-- BASELINE: dbt-Service-User (SQL-Login-Name des CI/Loader-Users)
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sec.sec_special_user_privilege
               WHERE user_name = N'<dbt-service-login>' AND no_sec = 1)
    INSERT INTO sec.sec_special_user_privilege (user_name, security_context, no_sec, description)
    VALUES (N'<dbt-service-login>', NULL, 1, N'dbt Service User - RLS/CLS-Bypass (Loader/CI)');
GO

-- ============================================================
-- Beispiel: Security-Admin (Entra-UPN)
-- ============================================================
-- INSERT INTO sec.sec_special_user_privilege (user_name, security_context, no_sec, description)
-- VALUES (N'vorname.nachname@domain.tld', NULL, 1, N'Security Admin (global)');

-- ============================================================
-- Beispiel: Kontext-Admin fuer Finance (sieht alle Finance-Zeilen,
-- unabhaengig von sec_value_key)
-- ============================================================
-- INSERT INTO sec.sec_special_user_privilege (user_name, security_context, no_sec, description)
-- VALUES (N'vorname.nachname@domain.tld', N'finance', 2, N'Kontext-Admin Finance');

-- Kontrolle
SELECT * FROM sec.sec_special_user_privilege ORDER BY no_sec, user_name;
GO
