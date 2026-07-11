/*
 * OLS: sg-datavault-finance-ro
 *
 * Read-Only-Zugriff auf den Finance-Mart. SCHEMA-Grants (nicht Objekt-Grants),
 * weil dbt Views/Tabellen bei jedem Run neu erstellt und Objekt-Grants dabei
 * verloren gehen. Schema-Grants ueberleben das Rebuild.
 *
 * Konsequenz: auch physische Tabellen im Schema (fakt_buchungen) sind lesbar
 * -> diese werden durch eine native Security Policy (RLS) geschuetzt und
 * duerfen keine CLS-pflichtigen Spalten enthalten.
 *
 * KEINE Grants auf stg / vault* / sec - die Mart-Views funktionieren
 * ohne Vault-Rechte via Ownership Chaining (alle Objekte gehoeren dbo).
 */

GRANT SELECT ON SCHEMA::mart_finance TO [sg-datavault-finance-ro];
GO

-- Gemeinsame Dimensionen (dim_date etc.)
GRANT SELECT ON SCHEMA::mart TO [sg-datavault-finance-ro];
GO
