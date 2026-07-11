/*
 * OLS Schritt 1: Entra-Gruppen als Datenbank-User anlegen
 *
 * WICHTIG: Dieses Skript MUSS von einem Entra-authentifizierten Admin
 * ausgefuehrt werden (Azure AD-Login in SSMS) - NICHT mit dem
 * SQL-Auth-Service-User! CREATE USER ... FROM EXTERNAL PROVIDER
 * validiert die Gruppe gegen Entra ID.
 *
 * Voraussetzungen:
 *   - Entra-Gruppen existieren im Tenant (Namenskonvention:
 *     sg-datavault-<bereich>-ro)
 *   - Empfohlen: Server-Identitaet des logischen SQL-Servers hat die
 *     Entra-Rolle "Directory Readers" (zuverlaessige Gruppenaufloesung
 *     fuer IS_MEMBER)
 *
 * Ausfuehrung: einmalig pro Tenant-Datenbank.
 */

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'sg-datavault-finance-ro')
    CREATE USER [sg-datavault-finance-ro] FROM EXTERNAL PROVIDER;
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'sg-datavault-project-ro')
    CREATE USER [sg-datavault-project-ro] FROM EXTERNAL PROVIDER;
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'sg-datavault-telecom-ro')
    CREATE USER [sg-datavault-telecom-ro] FROM EXTERNAL PROVIDER;
GO

-- Kontrolle: angelegte externe Principals
SELECT name, type_desc, authentication_type_desc, create_date
FROM sys.database_principals
WHERE type IN ('E', 'X')  -- E = External User, X = External Group
ORDER BY name;
GO
