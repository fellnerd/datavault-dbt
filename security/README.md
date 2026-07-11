# Security-Skripte (manuelle Ausführung in SSMS)

Versionierte DB-Security-Artefakte für die Tenant-Datenbanken (`datavault`, `datavault-dev`, `datavault-test`, `Vault_Jira`, …).
Vollständige Architektur: [docs/ext-features/datavault-security-architecture.md](../docs/ext-features/datavault-security-architecture.md)
**Deployment-Anleitung (Schritt für Schritt): [DEPLOYMENT.md](DEPLOYMENT.md)**

## Ausführungsreihenfolge (pro Tenant-Datenbank)

| # | Skript | Zweck | Ausführender |
|---|---|---|---|
| 1 | `ddl/01_schema_sec.sql` | Schema `sec` + 3 Berechtigungstabellen | DB-Admin (beliebige Auth) |
| 2 | `ddl/02_fn_check_rls.sql` | RLS-Prüffunktion | DB-Admin |
| 3 | `ddl/03_fn_check_cls.sql` | CLS-Prüffunktion | DB-Admin |
| 4 | `privileges/insert_sec_special_user_privilege.sql` | **Baseline: dbt-Service-User `no_sec=1`** — zwingend vor der ersten Security Policy! | DB-Admin |
| 5 | `ols/users/create_user_entra_groups.sql` | Entra-Gruppen als DB-User | **Entra-authentifizierter Admin** (nicht SQL-Auth!) |
| 6 | `ols/ols_sg-datavault-*.sql` | Schema-GRANTs pro Gruppe | DB-Admin |
| 7 | `privileges/insert_sec_group_privilege.sql` | RLS-Werte pro Gruppe | DB-Admin |
| 8 | `privileges/insert_sec_user_privilege.sql` | Einzelrechte (nur nach Freigabe) | DB-Admin |

Alle Skripte sind idempotent (`IF NOT EXISTS` / `CREATE OR ALTER`) und Azure-SQL-kompatibel (kein `USE`, keine Cross-DB-Referenzen).

## Grundregeln

- **Business-Grants nur auf `mart*`-Schemas** — niemals auf `stg`, `vault*` oder `sec`.
- **Schema-Grants statt Objekt-Grants** — dbt erstellt Objekte bei jedem Run neu, Objekt-Grants gehen dabei verloren.
- **dbt-Service-User-Exemption (`no_sec=1`) ist Pflicht-Baseline** — ohne sie liefern dbt-Tests und Downstream-Reads auf Policy-geschützten Tabellen leere Ergebnisse.
- Einzelrechte (`sec_user_privilege`) nur nach dokumentierter Freigabe (Jira-Ticket) durch den Data Owner; Standardweg ist die Gruppenberechtigung (`sec_group_privilege` + Entra-Mitgliedschaft).
