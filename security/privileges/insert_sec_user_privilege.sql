/*
 * Einzelberechtigungen vergeben: sec.sec_user_privilege
 *
 * user_name:        Entra-UPN (vorname.nachname@domain.tld) - Matching
 *                   erfolgt via ORIGINAL_LOGIN(), NICHT ueber den DB-User.
 * security_context: fachlicher Kontext ('finance', 'person_pii', ...)
 * sec_value_key:    hierarchischer Filterwert:
 *                     'ewb'        -> gesamter Mandant ewb
 *                     'ewb||0100'  -> nur Kontextwert 0100 innerhalb ewb
 *                   CLS-Kontexte (binaer): Konvention '*'
 * valid_from/to:    optional, UTC - fuer befristete Rechte (Praktikanten,
 *                   Projektfreigaben)
 *
 * Prozess: Vergabe erst nach dokumentierter Freigabe (Jira-Ticket) durch
 * den fachlichen Data Owner des Kontexts.
 */

-- ============================================================
-- Beispiel RLS: User sieht alle Finance-Zeilen des Mandanten ewb
-- ============================================================
-- INSERT INTO sec.sec_user_privilege (user_name, security_context, sec_value_key, description)
-- VALUES (N'vorname.nachname@domain.tld', N'finance', N'ewb', N'JIRA-1234: Finance Reporting');

-- ============================================================
-- Beispiel RLS eingeschraenkt: nur Kostenstelle/Buchungskreis 0100
-- ============================================================
-- INSERT INTO sec.sec_user_privilege (user_name, security_context, sec_value_key, description)
-- VALUES (N'vorname.nachname@domain.tld', N'finance', N'ewb||0100', N'JIRA-1234: nur BK 0100');

-- ============================================================
-- Beispiel CLS: User darf PII-Spalten (Name, Geburtsdatum) sehen
-- ============================================================
-- INSERT INTO sec.sec_user_privilege (user_name, security_context, sec_value_key, description)
-- VALUES (N'vorname.nachname@domain.tld', N'person_pii', N'*', N'JIRA-1234: HR-Auswertung, Freigabe Data Owner');

-- ============================================================
-- Beispiel befristet: Zugriff bis Jahresende
-- ============================================================
-- INSERT INTO sec.sec_user_privilege (user_name, security_context, sec_value_key, valid_to, description)
-- VALUES (N'vorname.nachname@domain.tld', N'finance', N'ewb', '2026-12-31 23:59:59', N'JIRA-1234: befristet');

-- Kontrolle
SELECT * FROM sec.sec_user_privilege ORDER BY user_name, security_context;
GO
