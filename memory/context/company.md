# Context — company, tools, processes

## Organizations
- **ppmc** (ppmcag.com) — Daniel commits as `daniel.fellner@ppmcag.com`.
- **dimetrics.io** — Daniel commits as support@/admin@/d.fellner@dimetrics.io.
- Relationship between the two not yet confirmed — ask if it matters.

## Customers / tenants
- **EWB** — production tenant (DB `datavault`); payroll ("Lohn") data in scope. The project lives under a `ppmc/ewb/` path.
- **Tenant 1** — production, DB `Vault_Jira` (target `jira`).

## Stack
- **Modeling**: Data Vault 2.1 via dbt Core + automate_dv
- **Warehouse**: Azure SQL (SQL Server dialect, ODBC Driver 18)
- **Ingestion**: PostgreSQL → Azure Synapse pipelines → ADLS Gen2 Parquet → External Tables
- **BI**: Power BI (DirectQuery), Zebra BI visuals
- **Languages/tools**: Python 3.10+ (.venv), dbt-core + dbt-sqlserver, Git

## Process / conventions
- Working language: **German** (docs, commit messages, comments).
- Commit style: conventional commits (`feat:`, `fix:`, `perf:`, `refactor:`, `docs:`).
- CI: GitLab CI + GitHub Actions.
- Tasks tracked in **Jira** (connector not yet linked).

## People
- **Daniel Fellner** — sole visible committer. See `memory/people/daniel-fellner.md`.
- No other collaborators surfaced (comprehensive scan declined). Add teammates as they come up.
