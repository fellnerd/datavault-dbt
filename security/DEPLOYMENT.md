# Security-Deployment — Runbook

> Schritt-für-Schritt-Anleitung für den Erst-Rollout von OLS/RLS/CLS.
> Reihenfolge der Umgebungen: **`datavault-dev` → `datavault-test` → `datavault` (Prod)**.
> Architektur & Begründungen: [docs/ext-features/datavault-security-architecture.md](../docs/ext-features/datavault-security-architecture.md)

## ⚠️ Kritische Reihenfolge

Die dbt-Models `fakt_buchungen`, `fakt_buchungen_v` und `dim_person_v` referenzieren `sec.fn_check_rls` / `sec.fn_check_cls`.
**Erst die DB-Skripte (Schritte 1–4), dann `dbt run`** — sonst schlägt der Run mit „Invalid object name 'sec.fn_check_rls'" fehl.

---

## Vorbereitung (einmalig, vor dev)

- [ ] **Entra-Gruppen beantragen** (IT/Entra-Admin): `sg-datavault-finance-ro`, `sg-datavault-project-ro`, `sg-datavault-telecom-ro` — plus mindestens einen Test-User pro Gruppe als Mitglied
- [ ] **Directory Readers**: Server-Identität des logischen SQL-Servers erhält die Entra-Rolle „Directory Readers" (für zuverlässiges `IS_MEMBER`)
- [ ] **dbt-Service-Login ermitteln**: als dbt-Service-User verbinden und `SELECT ORIGINAL_LOGIN();` ausführen — der Wert kommt in Schritt 2 in die Exemption
- [ ] Aktuellen Branch mergen/auschecken, sodass `macros/security/`, die Model-Änderungen und `tests/security/` im Deploy-Stand sind

---

## Deployment pro Datenbank (dev zuerst!)

### 1. sec-Fundament (SSMS, DB-Admin, beliebige Auth)

```
security/ddl/01_schema_sec.sql      -- Schema sec + 3 Berechtigungstabellen
security/ddl/02_fn_check_rls.sql    -- RLS-Prüffunktion
security/ddl/03_fn_check_cls.sql    -- CLS-Prüffunktion
```

### 2. Service-User-Exemption (SSMS) — **vor allem anderen Berechtigen!**

`security/privileges/insert_sec_special_user_privilege.sql` — den Platzhalter `<dbt-service-login>` durch den in der Vorbereitung ermittelten Login ersetzen.

Kontrolle:
```sql
SELECT * FROM sec.sec_special_user_privilege WHERE no_sec = 1;
```

### 3. Entra-Gruppen als DB-User (SSMS, **Entra-authentifizierter Admin!**)

`security/ols/users/create_user_entra_groups.sql`

### 4. OLS-Grants + Gruppenrechte (SSMS, DB-Admin)

```
security/ols/ols_sg-datavault-finance-ro.sql
security/ols/ols_sg-datavault-project-ro.sql
security/ols/ols_sg-datavault-telecom-ro.sql
security/privileges/insert_sec_group_privilege.sql   -- z.B. finance-Gruppe -> Kontext 'finance' -> 'ewb'
```

### 5. dbt-Deployment (Terminal / CI)

```bash
# Betroffene Models bauen (Policy-Hooks + RLS/CLS-Views)
dbt run -s fakt_buchungen fakt_buchungen_v dim_person_v --target <ziel>

# Security- und Model-Tests
dbt test -s fakt_buchungen_v dim_person_v test_type:singular --target <ziel>
```

Erwartung: `fakt_buchungen` baut inkl. `dss_sec_value_key` neu (Tabelle wird ohnehin bei jedem Run ersetzt — keine Migration nötig), danach existiert `sec.policy_fakt_buchungen`.

### 6. Verifikation

**a) Policy aktiv?**
```sql
SELECT sp.name, o.name AS table_name, sp.is_enabled
FROM sys.security_policies sp
JOIN sys.security_predicates p ON p.object_id = sp.object_id
JOIN sys.objects o ON o.object_id = p.target_object_id;
-- Erwartung: policy_fakt_buchungen | fakt_buchungen | 1
```

**b) RLS wirkt?** In SSMS **als Test-User** (Entra-Login, Mitglied `sg-datavault-finance-ro`) anmelden:
```sql
SELECT COUNT(*) FROM mart_finance.fakt_buchungen_v;  -- > 0 (Gruppe hat 'ewb')
SELECT TOP 5 * FROM mart_finance.dim_konto_v;        -- OK (OLS)
SELECT TOP 5 * FROM stg.stg_hauptbuch;               -- FEHLER erwartet (kein Grant)
```
Danach die Gruppen-Row in `sec_group_privilege` testweise löschen → `COUNT(*)` muss `0` liefern (RLS!), Objektzugriff bleibt (OLS). Row wieder einfügen.

**c) CLS wirkt?** Als Test-User **ohne** `person_pii`-Recht:
```sql
SELECT TOP 5 person_code, person_name FROM mart_project.dim_person_v;
-- Erwartung: person_name = '***', person_code sichtbar
```
Dann Einzelrecht vergeben (`insert_sec_user_privilege.sql`, Kontext `person_pii`, `sec_value_key='*'`) → Name sichtbar.

**d) dbt sieht alles?** (Exemption greift)
```sql
-- als dbt-Service-User:
SELECT COUNT(*) FROM mart_finance.fakt_buchungen;   -- ungefilterte Gesamtzahl
```

### 7. Power BI (nur test/prod)

- [ ] Auf der Datenquelle (Gateway/Cloud-Verbindung) **Entra-SSO-Passthrough** für DirectQuery aktivieren
- [ ] Report mit **zwei** Test-Usern unterschiedlicher Rechte öffnen — Zeilenzahlen müssen sich unterscheiden

---

## Rollback

1. `dbt run -s fakt_buchungen fakt_buchungen_v dim_person_v` auf dem **vorherigen Git-Stand** (Views ohne Filter, Tabelle ohne Hooks — der pre_hook des alten Stands existiert nicht, daher vorher manuell:)
2. `DROP SECURITY POLICY sec.policy_fakt_buchungen;` (SSMS)
3. Optional OLS zurück: `REVOKE SELECT ON SCHEMA::mart_finance FROM [sg-datavault-finance-ro];` usw.
4. `sec`-Schema kann liegen bleiben (inert ohne Policies/Filter)

## Bekannte Stolpersteine

| Symptom | Ursache | Fix |
|---|---|---|
| `dbt run` bricht: „Invalid object name 'sec.fn_check_rls'" | DDL (Schritt 1) nicht deployed | Schritte 1–2 ausführen, Run wiederholen |
| `dbt run` bricht: Tabelle kann nicht gedroppt werden | Policy existiert, pre_hook fehlte/entfernt | Policy manuell droppen, Hook-Paar prüfen |
| Marts plötzlich leer (dbt/Tests) | Service-User-Exemption fehlt | Schritt 2; Test `assert_dbt_service_user_exemption` schlägt dann an |
| User sieht 0 Zeilen trotz Gruppenmitgliedschaft | Gruppen-Row fehlt in `sec_group_privilege` oder `IS_MEMBER` löst nicht auf | Row prüfen; Directory Readers prüfen; User neu anmelden lassen |
| Alle PBI-User sehen dieselben Daten | SSO-Passthrough nicht aktiv | Schritt 7 |
