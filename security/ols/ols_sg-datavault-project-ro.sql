/*
 * OLS: sg-datavault-project-ro
 *
 * Read-Only-Zugriff auf den Project-Mart (Schema-Grants, siehe
 * ols_sg-datavault-finance-ro.sql fuer die Begruendung).
 */

GRANT SELECT ON SCHEMA::mart_project TO [sg-datavault-project-ro];
GO

-- Gemeinsame Dimensionen (dim_date etc.)
GRANT SELECT ON SCHEMA::mart TO [sg-datavault-project-ro];
GO
