# Data Vault Security-Architektur: OLS, RLS, CLS & CLE auf Azure SQL

> Security-Konzept für `datavault-dbt` (Data Vault 2.1, Azure SQL Database, dbt Core).
> Strukturvorlage: [datavault-security-architecture-sample.md](datavault-security-architecture-sample.md) (Legacy-Datahub) — dieses Konzept ersetzt dessen On-Prem-Mechanismen (klassische AD-Gruppen, `USER_NAME()`-Matching) durch Azure-native Pendants (Entra ID, `ORIGINAL_LOGIN()`, `IS_MEMBER()`).

---

## 1. Architektur-Überblick

Vier Schichten plus Mandantentrennung, vollständig auf SQL-Server-nativen Mechanismen und dbt-Macros:

| Schicht | Zweck | Mechanismus |
|---|---|---|
| **Mandantentrennung** | Isolation zwischen Kunden/Tenants | **Datenbank pro Tenant** (`datavault` = ewb, `Vault_Jira` = jira) + Mandanten-Segment im `dss_sec_value_key` |
| **OLS** – Object Level Security | Zugriff auf DB-Objekte | Entra-ID-Gruppen + `GRANT SELECT ON SCHEMA::mart*` (manuell via SSMS, versionierte Skripte) |
| **RLS** – Row Level Security | Zeilen-Filterung (Mandant/Kontext) | `sec.fn_check_rls` — in Views via dbt-Macro `rls_filter`, auf physischen Tabellen via `SECURITY POLICY` |
| **CLS** – Column Level Security | Spalten-Maskierung (PII) | View-Logik via dbt-Macro `cls_mask` + `sec.fn_check_cls` |
| **CLE** – Column Level Encryption | Schutz hochsensibler Spalten | Tiering: Tier-1-Spalten nie im Mart; TDE + verschlüsselte Verbindungen als Baseline (Always Encrypted geprüft und verworfen, Kap. 7) |

**Leitprinzip — Enforcement an der Mart-Grenze:**
Business-User greifen ausschließlich auf `mart*`-Schemas zu (publizierte `_v`-Views + physische Fakt-Caches). `stg`, `vault*` und `sec` erhalten **keinerlei** Business-Grants. Die Mart-Views lesen den Vault trotzdem — via Ownership Chaining (alle Objekte gehören `dbo`). Auf Vault-Tabellen liegen **bewusst keine** Security Policies: sie würden die dbt-Inkrementalläufe (HWM-Seek, Dedupe) still filtern → Datenverlust ohne Fehlermeldung.

---

## 2. Mandantenmodell

### Ist-Zustand: Datenbank pro Tenant

| dbt-Target | Datenbank | Tenant / `tenant_key` |
|---|---|---|
| `ewb`, `ewb-dev`, `ewb-test` | `datavault`, `datavault-dev`, `datavault-test` | `ewb` |
| `jira` | `Vault_Jira` | `jira` |
| `dev` (lokal) | `Vault` | `ewb` (Default, via Var übersteuerbar) |

Die DB-Grenze ist die stärkste Isolation und bleibt bestehen. **Zusätzlich** trägt jede RLS-gesicherte Zeile den Mandanten im `dss_sec_value_key` — die Mandantentrennung ist damit bereits im aktuellen Aufbau aktiv (Mandantenname für EWB: schlicht `ewb`).

### RLS-Schlüssel `dss_sec_value_key`

Format: `<tenant_key>` oder `<tenant_key>||<kontextwert>`, erzeugt über das dbt-Macro `sec_value_key()`:

```sql
-- im Model-SQL (SELECT-Liste):
{{ sec_value_key() }}                                AS dss_sec_value_key  -- 'ewb'
{{ sec_value_key("CAST(kst AS NVARCHAR(50))") }}     AS dss_sec_value_key  -- 'ewb||<kst>'
```

Der `tenant_key` wird pro dbt-Target abgeleitet (Macro `tenant_key()` in `macros/security/tenant_key.sql`). Die Prüffunktion matcht **hierarchisch**: ein Recht auf `ewb` berechtigt automatisch auch für `ewb||0100`, `ewb||...` (Prefix-Logik).

### Zukunftsoption: Row-Level-Mandanten

Sollten Tenants später eine Datenbank teilen, funktioniert das Modell unverändert: Berechtigungen werden dann pro Mandant vergeben (`sec_value_key = 'ewb'` vs. `'kunde2'`), die Prüffunktion und das Schlüsselformat bleiben identisch. Kein Umbau nötig.

---

## 3. Datenbank-Schema `sec`

**Skripte:** `security/ddl/01_schema_sec.sql` bis `03_fn_check_cls.sql` (idempotent, pro Tenant-DB einmalig ausführen).

### `sec.sec_user_privilege` — Einzelberechtigungen (RLS + CLS)

| Spalte | Bedeutung |
|---|---|
| `user_name` | **Entra-UPN** (`vorname.nachname@domain.tld`) bzw. SQL-Login-Name — Matching via `ORIGINAL_LOGIN()` |
| `security_context` | Fachlicher Kontext, z.B. `finance`, `person_pii` |
| `sec_value_key` | RLS-Filterwert, hierarchisch: `ewb`, `ewb||0100`; für CLS-Kontexte Konvention `*` |
| `valid_from` / `valid_to` | Optionaler Gültigkeitszeitraum (UTC) — befristete Rechte |
| `description` | Freigabe-Referenz (Jira-Ticket) |
| `created_at` / `created_by` | Audit (automatisch befüllt) |

### `sec.sec_special_user_privilege` — Sonderrechte

| `no_sec` | Wirkung |
|---|---|
| `1` | **Global-Admin / Service-User**: kompletter RLS/CLS-Bypass. Nur für dbt-Service-User und Security-Admins! |
| `2` | **Kontext-Admin**: Bypass nur innerhalb des angegebenen `security_context` |

### `sec.sec_group_privilege` — Gruppenberechtigungen (Standardweg)

Definiert, **was** eine Entra-Gruppe sehen darf (`group_name` + `security_context` + `sec_value_key`). **Wer** dazugehört, wird ausschließlich in Entra ID gepflegt — die Prüfung läuft über `IS_MEMBER()`. On-/Offboarding = Gruppenmitgliedschaft ändern, keine SQL-Änderung.

### Prüffunktionen

`sec.fn_check_rls(@sec_value_key, @security_context)` — Inline-TVF mit `SCHEMABINDING`, vier OR-Zweige:

1. Global-Admin/Service-User (`no_sec = 1`) → Bypass
2. Kontext-Admin (`no_sec = 2` + Kontext) → Bypass im Kontext
3. Einzelrecht via UPN (`ORIGINAL_LOGIN()`), Prefix-Hierarchie, Gültigkeitszeitraum
4. Gruppenrecht via `IS_MEMBER(group_name) = 1`

`sec.fn_check_cls(@security_context)` — identische Quellen, aber binär (Spalte sichtbar ja/nein), ohne `sec_value_key`.

Beide Tabellen sind auf `(user_name, security_context)` bzw. `(security_context)` indiziert — die Funktion wird pro Zeile ausgewertet und muss billig sein.

---

## 4. OLS – Object Level Security

### Mechanismus

- Datenzugriff für Business-User **ausschließlich via `mart*`-Schemas**.
- Entra-ID-Gruppen werden als DB-User angelegt und erhalten **Schema-Grants** — vergeben manuell in SSMS über versionierte Skripte (`security/ols/`).

```sql
CREATE USER [sg-datavault-finance-ro] FROM EXTERNAL PROVIDER;
GRANT SELECT ON SCHEMA::mart_finance TO [sg-datavault-finance-ro];
GRANT SELECT ON SCHEMA::mart         TO [sg-datavault-finance-ro];  -- dim_date etc.
```

### Warum Schema-Grants statt Objekt-Grants?

dbt erstellt Views und Tabellen **bei jedem Run neu** — Objekt-Grants (`GRANT SELECT ON view`) gehen dabei verloren. Schema-Grants überleben das Rebuild. Konsequenz: auch physische Tabellen im Mart-Schema (z.B. `fakt_buchungen`) sind direkt lesbar → dort greift eine native Security Policy (Kap. 5), und es gilt die Designregel:

> **CLS-pflichtige Spalten dürfen nie in physischen Mart-Tabellen liegen — nur in Views (maskiert) oder gar nicht im Mart.**

### Entra-Gruppen nach Content-Bereich

| Content-Bereich | Entra-Gruppe | Schemas |
|---|---|---|
| Finance (Hauptbuch, Zebra BI) | `sg-datavault-finance-ro` | `mart_finance`, `mart` |
| Project | `sg-datavault-project-ro` | `mart_project`, `mart` |
| Telecom (CDR) | `sg-datavault-telecom-ro` | `mart_telecom`, `mart` |

Namenskonvention: `sg-datavault-<bereich>-ro`. Neue Bereiche (z.B. `mart_jira`) bekommen je eine neue Gruppe + ein neues OLS-Skript.

### Betriebsvoraussetzungen (Entra)

- `CREATE USER … FROM EXTERNAL PROVIDER` muss von einem **Entra-authentifizierten Admin** ausgeführt werden (nicht mit dem SQL-Auth-Service-User).
- Die Server-Identität des logischen SQL-Servers sollte die Entra-Rolle **Directory Readers** haben (zuverlässige Gruppenauflösung für `IS_MEMBER`).

---

## 5. RLS – Row Level Security

### Identität unter Entra ID — die entscheidende Falle

Meldet sich ein User über **Gruppenmitgliedschaft** an (die Gruppe ist der DB-Principal, der User hat keinen eigenen DB-User), verhalten sich die T-SQL-Identitätsfunktionen unterschiedlich:

| Funktion | Rückgabe bei Gruppen-Login | Verwendbar? |
|---|---|---|
| `USER_NAME()` | **Gruppenname** (DB-Principal) | ❌ für Einzelrechte unbrauchbar |
| `ORIGINAL_LOGIN()` | **UPN des Users** (`vorname.nachname@domain.tld`), stabil unter `EXECUTE AS` | ✅ Standard in allen Prädikaten |
| `SUSER_SNAME()` (ohne Argument) | UPN des Users | ✅ (Argument-Formen wie `SUSER_SNAME(sid)` liefern bei Entra-Principals `NULL` — nicht verwenden) |
| `IS_MEMBER('<gruppe>')` | `1` bei Entra-Gruppenmitgliedschaft | ✅ für Gruppenrechte (Ausnahme: die Entra-Admin-Gruppe des Servers selbst) |

### Zwei Durchsetzungswege (hybrid)

**a) `_v`-Views (Standardfall):** Der Filter wird via dbt-Macro direkt ins View-SQL eingebettet — native Security Policies können nicht an Views binden, und der eingebettete Filter ist für den Optimizer transparent (Predicate Pushdown für Power BI DirectQuery):

```sql
-- models/mart/finance/fakt_buchungen_v.sql
SELECT * FROM {{ ref('fakt_buchungen') }}
WHERE {{ rls_filter('finance') }}
-- kompiliert zu:
-- WHERE EXISTS (SELECT 1 FROM sec.fn_check_rls(dss_sec_value_key, 'finance'))
```

**b) Physische Mart-Tabellen** (`fakt_buchungen` u.a. — wegen Schema-Grant direkt lesbar): native `SECURITY POLICY` mit FILTER-Prädikat, verwaltet über ein **Hook-Paar**:

```sql
{{ config(
    materialized='table',
    pre_hook=["{{ drop_security_policy() }}"],
    post_hook=["{{ apply_security_policy('finance') }}"]
) }}
```

> ⚠️ Das Hook-Paar ist **Pflicht**: Eine Tabelle mit gebundener Policy kann nicht gedroppt werden — ohne `pre_hook` schlägt jeder `dbt run` fehl; ohne `post_hook` bleibt die Tabelle nach dem Run ungeschützt. Policy-Name: `sec.policy_<modelname>`.

Es werden nur FILTER-Prädikate verwendet (keine BLOCK-Prädikate) — die Konsumenten sind read-only.

### Security-Kontexte je Domäne

| Kontext | Objekte (Beispiele) | `sec_value_key`-Basis |
|---|---|---|
| `finance` | `fakt_buchungen` (Policy), `fakt_buchungen_v`, `fakt_belege_v`, `fakt_budget_v` (rls_filter) | `ewb` bzw. `ewb\|\|<buchungskreis/kst>` |
| `project` | `mart_project`-Views | `ewb\|\|<projekt>` |
| `telecom` | `mart_telecom`-Fakten | `ewb\|\|<vertrag/kontext>` |
| `person_pii` | CLS-Kontext (Kap. 6), kein Zeilenfilter | `*` |

### Power BI — Betriebsvoraussetzung SSO

Per-User-RLS wirkt in Power BI DirectQuery **nur mit aktiviertem Entra-SSO-Passthrough** auf der Datenquelle. Ohne SSO verbindet sich der PBI-Service mit einem festen Principal — alle Report-User sehen dann dieselben Zeilen (die des Verbindungs-Users). SSO-Konfiguration ist Teil der Rollout-Checkliste (Kap. 10).

---

## 6. CLS – Column Level Security

### Mechanismus

Keine native SQL-Server-CLS. Umsetzung via **View-Logik**: sensible Spalten werden maskiert, wenn der User keinen Eintrag für den Security-Kontext hat — implementiert über das dbt-Macro `cls_mask`:

```sql
-- in der SELECT-Liste eines Views:
{{ cls_mask('nachname', 'person_pii') }}              AS nachname,
{{ cls_mask('geburtsdatum', 'person_pii', 'NULL') }}  AS geburtsdatum
-- kompiliert zu:
-- CASE WHEN EXISTS (SELECT 1 FROM sec.fn_check_cls('person_pii'))
--      THEN nachname ELSE '***' END
```

Für Nicht-String-Spalten wird ein typkompatibler `mask_value` angegeben (`'NULL'`, `0`, …).

### CLS-Kontexte und geschützte Spalten

| Kontext | View (geplant) | Gesicherte Spalten |
|---|---|---|
| `person_pii` | `dim_person_v` | `vorname`, `nachname`, `geburtsdatum`, `geburtsort`, `nationalitaet`, `geschlecht` |

### Freigabe-Prozess

1. Anforderung via Jira-Ticket
2. Freigabe durch den **fachlichen Data Owner** (im Ticket dokumentiert)
3. Erst nach schriftlicher Freigabe: Insert in `sec.sec_user_privilege` (`security_context = 'person_pii'`, `sec_value_key = '*'`) — Ticket-Nr. in `description`

### Optional: Dynamic Data Masking (Defense-in-Depth)

DDM kann zusätzlich auf Vault-PII-Spalten gelegt werden (`ALTER TABLE … ALTER COLUMN … ADD MASKED`). Einschränkungen bewusst dokumentiert: per Inferenz umgehbar (`WHERE`-Filter auf maskierte Spalten), `UNMASK`-Grant wirkt global, und bei `--full-refresh` inkrementeller Sats geht die Maskierung verloren (Re-Apply-Hook nach Muster von `create_hash_index` nötig). DDM ersetzt **keine** Zugriffskontrolle — es ist nur eine zweite Verteidigungslinie hinter OLS.

---

## 7. CLE – Verschlüsselung & Schutz-Tiering

### Tiering

| Tier | Spalten (aus `vault.sat_person__abacus` u.a.) | Schutz |
|---|---|---|
| **1 — streng vertraulich** | `SOC_INSURANCE_NR` (AHV-Nr.), `ZEMIS_NR`, `BADGE_ID` | Tauchen in **keinem Mart-Objekt** auf. Liegen nur im `vault`-Schema (null Business-Grants). Optional DDM. Absicherung per dbt-Test (Kap. 9). |
| **2 — vertraulich (PII)** | `vorname`, `nachname`, `geburtsdatum`, `geburtsort`, `nationalitaet`, `geschlecht` | CLS-Maskierung in Views (Kontext `person_pii`) |
| **3 — intern** | Beträge (`betrag`, `mwstbetr`), `dkkundennummer` | RLS-Kontexte (`finance` etc.) |

### Baseline-Verschlüsselung

- **TDE** (Transparent Data Encryption): auf Azure SQL Database standardmäßig aktiv — Verschlüsselung at rest.
- **Verschlüsselte Verbindungen**: `encrypt=true` ist in allen dbt-Profilen bereits gesetzt; gilt ebenso für PBI/SSMS.
- **Upstream**: Die Klartextdaten liegen ohnehin in ADLS-Parquet — dortige Zugriffskontrolle (RBAC/ACLs) + Storage-Encryption ist der eigentliche Schutz der Ladestrecke und wird hier als Voraussetzung festgehalten.

### Always Encrypted — geprüft und verworfen

| Grund | Detail |
|---|---|
| **Power BI inkompatibel** | Power Query (Import **und** DirectQuery) kann Always-Encrypted-Spalten nicht lesen — jede Abfrage mit AE-Spalte bricht. |
| **dbt-Load bricht** | AE verschlüsselt clientseitig; serverseitige `INSERT … SELECT`-Transformationen (Staging → Sat) können AE-Spalten nicht befüllen. |
| **Kein echter Gewinn** | Der Klartext existiert upstream in ADLS-Parquet — AE nur in SQL wäre Scheinsicherheit. |

Fazit: Tier-1-Daten werden durch **Nicht-Exposition** (kein Mart-Objekt, keine Grants) geschützt — das ist einfacher und in diesem Setup wirksamer als spaltenweise Verschlüsselung.

---

## 8. Berechtigungsvergabe

### Drei Wege, klare Rangfolge

| Weg | Tabelle / Mechanismus | Wann |
|---|---|---|
| **1. Gruppenrecht (Standard)** | Entra-Gruppenmitgliedschaft + Row in `sec_group_privilege` | Regelfall — On-/Offboarding läuft komplett über Entra ID |
| **2. Einzelrecht** | Row in `sec_user_privilege` (UPN) | Ausnahmen, befristete Rechte (`valid_to`), CLS-Freigaben |
| **3. Sonderrecht** | Row in `sec_special_user_privilege` (`no_sec` 1/2) | Nur Security-Admins, Kontext-Admins, dbt-Service-User |

### Skripte (`security/privileges/`)

```
insert_sec_special_user_privilege.sql   -- Baseline: dbt-Service-User no_sec=1 (PFLICHT vor erster Policy!)
insert_sec_group_privilege.sql          -- Standard: Gruppe -> Kontext -> sec_value_key
insert_sec_user_privilege.sql           -- Einzelrechte, nur nach Jira-Freigabe
```

> **Hinweis dbt-Service-User:** Ohne die `no_sec=1`-Row liefert jede Security Policy auf einer Mart-Tabelle für dbt selbst **leere Ergebnisse ohne Fehlermeldung** (dbt-Tests, Downstream-Reads). Die Exemption ist deshalb Teil der DDL-Baseline und wird per dbt-Test überwacht (Kap. 9).

---

## 9. dbt-Integration

### Macros (`macros/security/`)

| Macro | Zweck | Einsatz |
|---|---|---|
| `tenant_key()` | Mandanten-Schlüssel aus dbt-Target (`ewb*` → `ewb`, `jira` → `jira`, sonst `var('tenant_key','ewb')`) | in `sec_value_key()` |
| `sec_value_key(context_expr)` | SQL-Ausdruck für `dss_sec_value_key` (`'ewb'` bzw. `CONCAT_WS('\|\|','ewb',<expr>)`) | SELECT-Liste von Fakt-Models |
| `rls_filter(context, key_expr)` | `EXISTS`-Prädikat gegen `fn_check_rls` | `WHERE` in `_v`-Views |
| `cls_mask(column, context, mask_value)` | `CASE`-Maskierung gegen `fn_check_cls` | SELECT-Liste in Views |
| `drop_security_policy()` / `apply_security_policy(context)` | Policy-Verwaltung für physische Tabellen | `pre_hook` / `post_hook` (immer paarweise!) |

### Zuständigkeiten

| Artefakt | Owner | Deployment |
|---|---|---|
| `sec`-Schema, Tabellen, Funktionen, Grants, User | DB-Admin | manuell in SSMS (`security/`, versioniert) |
| Berechtigungs-**Inhalte** (Rows in `sec_*`) | Data Owner + DB-Admin | Insert-Skripte nach Freigabeprozess |
| Macros, `dss_sec_value_key`-Spalten, Hooks | dbt-Projekt | `dbt run` |

Die `sec`-Tabellen sind **bewusst keine dbt-Models oder Seeds** — Seeds würden produktive Berechtigungs-Rows bei jedem Run überschreiben.

### dbt-Tests unter RLS

- dbt läuft als Service-User mit `no_sec=1` → Tests sehen ungefilterte Daten (dokumentierte Annahme).
- **Exemption-Test**: Singular-Test, der prüft, dass die `no_sec=1`-Row für den Service-User existiert.
- **Tier-1-Test**: Singular-Test gegen `INFORMATION_SCHEMA.COLUMNS`, der fehlschlägt, wenn `SOC_INSURANCE_NR`, `ZEMIS_NR` oder `BADGE_ID` in einem `mart%`-Schema auftauchen.

---

## 10. Implementierungs-Checkliste (Rollout in 4 Phasen)

Die DB-seitigen Skripte unter `security/` sind die **kanonische DDL** (idempotent, Azure-SQL-kompatibel); Reihenfolge siehe [security/README.md](../../security/README.md).

### Phase 1 — OLS (sofort wirksam, keine dbt-Änderung)

- [ ] Entra-Gruppen `sg-datavault-<bereich>-ro` im Tenant anlegen (IT/Entra-Admin)
- [ ] `security/ols/users/create_user_entra_groups.sql` — als **Entra-Admin** in SSMS
- [ ] `security/ols/ols_sg-datavault-*.sql` — Schema-Grants
- [ ] Audit: keinerlei Business-Grants auf `stg`/`vault*`/`sec` (Query in Kap. 12)

### Phase 2 — sec-Fundament + RLS Finance

- [ ] `security/ddl/01_schema_sec.sql` → `02_fn_check_rls.sql` → `03_fn_check_cls.sql`
- [ ] `insert_sec_special_user_privilege.sql`: **dbt-Service-User `no_sec=1`** (vor der ersten Policy!)
- [ ] `insert_sec_group_privilege.sql`: z.B. `sg-datavault-finance-ro` → `finance` → `ewb`
- [ ] dbt: `dss_sec_value_key` via `{{ sec_value_key(...) }}` in `fakt_buchungen` ergänzen
- [ ] dbt: Hook-Paar auf `fakt_buchungen`, `{{ rls_filter('finance') }}` in `fakt_buchungen_v`
- [ ] Power BI: Entra-SSO-Passthrough auf der Datenquelle aktivieren und mit zwei Test-Usern verifizieren
- [ ] Verifikation in SSMS: `EXECUTE AS`-frei mit Test-User anmelden, Zeilenzahlen vergleichen

### Phase 3 — CLS Person

- [ ] `dim_person_v` mit `{{ cls_mask(...) }}` für Tier-2-Spalten (Kontext `person_pii`)
- [ ] Freigabeprozess (Jira-Ticket → Data Owner → Insert) im Team kommunizieren

### Phase 4 — Breite + Härtung

- [ ] RLS-Kontexte `project`, `telecom` analog Finance
- [ ] dbt-Tests: Exemption-Test + Tier-1-Test (Kap. 9)
- [ ] Optional: DDM auf `vault.sat_person__abacus` (mit Re-Apply-Hook)

### Beispiel-DDL Security Policy (wird vom Macro generiert)

```sql
CREATE SECURITY POLICY sec.[policy_fakt_buchungen]
ADD FILTER PREDICATE sec.fn_check_rls([dss_sec_value_key], 'finance')
ON mart_finance.fakt_buchungen
WITH (STATE = ON);
```

---

## 11. Repository-Struktur

```
datavault-dbt/
├── security/                          # manuell in SSMS ausgeführt, versioniert
│   ├── README.md                      # Ausführungsreihenfolge + Grundregeln
│   ├── ddl/
│   │   ├── 01_schema_sec.sql          # Schema sec + 3 Berechtigungstabellen
│   │   ├── 02_fn_check_rls.sql        # RLS-Prüffunktion (4 OR-Zweige)
│   │   └── 03_fn_check_cls.sql        # CLS-Prüffunktion (binär)
│   ├── ols/
│   │   ├── users/create_user_entra_groups.sql
│   │   ├── ols_sg-datavault-finance-ro.sql
│   │   ├── ols_sg-datavault-project-ro.sql
│   │   └── ols_sg-datavault-telecom-ro.sql
│   └── privileges/
│       ├── insert_sec_special_user_privilege.sql
│       ├── insert_sec_user_privilege.sql
│       └── insert_sec_group_privilege.sql
├── macros/security/
│   ├── tenant_key.sql                 # tenant_key() + sec_value_key()
│   ├── rls_filter.sql
│   ├── cls_mask.sql
│   └── security_policy.sql            # drop_/apply_security_policy()
└── docs/ext-features/
    ├── datavault-security-architecture.md          # dieses Dokument
    └── datavault-security-architecture-sample.md   # Legacy-Datahub-Referenz
```

---

## 12. Risiken & Betrieb

### Pitfall-Liste

| # | Risiko | Gegenmaßnahme |
|---|---|---|
| 1 | Tabelle mit Security Policy kann nicht gedroppt werden → jeder `dbt run` schlägt fehl | Hook-Paar `drop_/apply_security_policy` ist Pflicht, nie einzeln verwenden |
| 2 | Objekt-Grants überleben kein dbt-Rebuild | Nur Schema-Grants (`GRANT … ON SCHEMA::`) |
| 3 | Schema-Grant macht physische Fakt-Tabellen direkt lesbar | Native Policy auf jeder physischen Mart-Tabelle + Regel „keine CLS-Spalten in Tabellen" |
| 4 | PBI DirectQuery ohne Entra-SSO: alle User sehen die Zeilen des Verbindungs-Principals | SSO-Passthrough als dokumentierte Betriebsvoraussetzung, Test mit zwei Usern |
| 5 | `USER_NAME()` liefert bei Gruppen-Login den Gruppennamen | Prädikate matchen ausschließlich auf `ORIGINAL_LOGIN()` |
| 6 | Verlorene Service-User-Exemption → leere Marts ohne Fehler; Policy auf Vault → stiller Datenverlust bei Inkrementalläufen | Exemption in DDL-Baseline + dbt-Test; per Design keine Policies auf `vault*` |
| 7 | `IS_MEMBER()` versagt für die Entra-Admin-Gruppe des Servers; Gruppenauflösung braucht Directory Readers | Admin-Gruppe nie als Berechtigungsgruppe verwenden; Directory-Readers-Rolle für Server-Identität |
| 8 | `--full-refresh` wirft DDM/Indizes auf inkrementellen Sats weg | Re-Apply-Hooks (Muster `create_hash_index` existiert) |
| 9 | RLS-Performance: `fn_check_rls` wird pro Zeile ausgewertet | Inline-TVF + `SCHEMABINDING`, indizierte `sec`-Tabellen, keine Typkonvertierungen im Prädikat; Zebra-BI-Aggregationen nach Phase 2 messen |

### Grant-Audit (regelmäßig ausführen)

```sql
-- Wer hat was? Erwartung: nur sg-datavault-*-Gruppen, nur mart*-Schemas
SELECT pr.name AS principal, pr.type_desc,
       pe.permission_name, pe.state_desc,
       s.name AS schema_name
FROM sys.database_permissions pe
JOIN sys.database_principals pr ON pr.principal_id = pe.grantee_principal_id
LEFT JOIN sys.schemas s ON pe.class = 3 AND s.schema_id = pe.major_id
WHERE pr.name NOT IN ('public', 'dbo', 'guest')
ORDER BY pr.name, s.name;

-- Aktive Security Policies
SELECT sp.name AS policy_name, o.name AS table_name, sp.is_enabled
FROM sys.security_policies sp
JOIN sys.security_predicates p ON p.object_id = sp.object_id
JOIN sys.objects o ON o.object_id = p.target_object_id;
```
