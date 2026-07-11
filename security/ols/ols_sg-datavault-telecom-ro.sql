/*
 * OLS: sg-datavault-telecom-ro
 *
 * Read-Only-Zugriff auf den Telecom-Mart (Schema-Grants, siehe
 * ols_sg-datavault-finance-ro.sql fuer die Begruendung).
 */

GRANT SELECT ON SCHEMA::mart_telecom TO [sg-datavault-telecom-ro];
GO

-- Gemeinsame Dimensionen (dim_date etc.)
GRANT SELECT ON SCHEMA::mart TO [sg-datavault-telecom-ro];
GO
