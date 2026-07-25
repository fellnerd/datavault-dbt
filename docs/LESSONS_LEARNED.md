# Lessons Learned - Data Vault 2.1 mit dbt auf Azure

> **Letzte Aktualisierung:** 2026-07-25
> **DV 2.1 Compliance:** ~85% (nach Optimierung)

## Projektkontext
PoC für eine virtualisierte Data Vault 2.1 Architektur als wiederverwendbares SaaS-Template. Das Projekt wurde durch eine umfassende DV 2.1 Analyse optimiert.

---

# Juli 2026 — Power-BI-Performance & Zebra-BI-Rebuild (Erfolgsrechnung CSM_Abacus)

> Technisches Know-how aus der DB-Performance-Untersuchung und dem Power-BI-Rebuild der
> Erfolgsrechnung (EWB Finance-Domain, `mart_finance`). Anderer Domänenfokus als der Rest
> dieses Dokuments (dort: company/country-Hub aus einer früheren Projektphase) — bitte
> trotzdem lesen, viele Punkte sind domänenübergreifend relevant.

## 1. dbt-Modellierung / Materialisierung

### Nicht-materialisierte View-Ketten sind ein Performance- UND Stabilitätsrisiko

`dim_konto_v` war eine VIEW mit 3× UNION ALL + TRY_CAST/HASHBYTES — wurde bei **jedem**
Power-BI-DirectQuery-Aufruf komplett neu berechnet (~2.3–2.6s Zusatzkosten bei nur 449 Zeilen).
Fix: Logik nach `dim_konto` (TABLE) auslagern, `dim_konto_v` wird dünner Wrapper
(`SELECT * FROM {{ ref('dim_konto') }}`) — analog zum bestehenden `fakt_buchungen`/
`fakt_buchungen_v`-Muster in diesem Projekt. **Diese Aufteilung (Tabelle + Wrapper-View) ist
das Standardmuster hier, wende es proaktiv an, sobald eine mart-View mehr als triviale
Joins/Berechnungen enthält und von Power BI DirectQuery konsumiert wird.**

### Noch fragiler: View-Ketten, die bis zu einer External Table (Parquet) reichen

`dim_person_v` → `ewb_publ_adr_main` (Staging-VIEW) → `stg.ext_ewb_publ_adr_main`
(External Table auf rohe ADLS-Parquet-Datei) — alle drei Ebenen nicht materialisiert.
Jede Power-BI-Abfrage liest dadurch live die Parquet-Datei, was bei gleichzeitigem
Synapse-Ladejob transient fehlschlagen kann ("location does not exist or is used by
another process"). **Bei jeder Kette, die auf eine External Table zurückführt: prüfen,
ob mindestens die Staging-Ebene materialisiert werden sollte.**

### Fehlende Vault-Attribute führen zu Mart-Layer-Workarounds, die die Vault umgehen

`dim_person_v` liest für den "aktive Mitarbeiter"-Filter (`LOHNJN`, `GESPERRT`) direkt aus
der rohen Staging-View statt aus einer Satellite — weil `sat_person_adresse__abacus` diese
Spalten nie im Payload hatte (dokumentierte Lücke: `docs/synapse-validation-report.md`,
Gap **M1**). **Wenn ein Mart-Modell `{{ ref('<staging_model>') }}` statt eines Hub/Sat/Link
referenziert, ist das ein Signal für eine unvollständige Raw-Vault-Modellierung — nicht
nur ein Stilproblem, sondern ein Performance-/Stabilitätsrisiko (reicht bis zur Quelle
durch).**

### CTEs können nicht in einer anderen CTE oder einer Subquery genestet werden (T-SQL)

`automate_dv.ref_table()` erzeugt selbst ein `WITH source_data AS (...) SELECT ...`.
Eigenes `WITH base AS ({{ automate_dv.ref_table(...) }})` scheitert mit
*"Incorrect syntax near 'with'"* — T-SQL erlaubt keine CTE-Definition, deren Körper mit
`WITH` beginnt, auch nicht in einer Subquery/Derived Table. **Wenn eine zusätzliche
Spalte auf ein `ref_table()`-Ergebnis nötig ist: Macro nicht wrappen, sondern die
äquivalente Logik direkt inline schreiben** (siehe `ref_actual_forecast_v.sql`).

### Quellformat-Annahmen empirisch prüfen, nicht dem Kommentar vertrauen

`ref_actual_forecast_v` dokumentierte `Y_Month` als Format `'YYYY-MM'` — real lieferte
Sharepoint `'YYYYMMM'` (z.B. `'2022M05'`). Der Join `dim_date.year_month = Y_Month` matchte
dadurch **strukturell nie** (0 Zeilen) — vermutlich seit Einführung wirkungslos, ohne dass
es auffiel (kein Fehler, nur leere Ergebnisse). **Bei Join-Keys zwischen Quellen: immer
`SELECT DISTINCT <spalte>` gegenchecken, nicht nur den Header-Kommentar lesen.**

## 2. Row-Level Security (native Security Policy)

### RLS wertet pro Basiszeile aus, auch für global exemptierte User

`sec.fn_check_rls` hat 4 OR-Branches; Branch 1+2 (Admin-Bypass) hängen **nicht** von der
pro-Zeile wechselnden Spalte `@sec_value_key` ab. Trotzdem: gemessen **~2.03 logische Reads
pro Zeile** (163.015 Reads bei 80.247 Zeilen test-DB; 1.850.944 bei 911.394 Zeilen dev-DB —
exakt dasselbe Verhältnis) statt der erwarteten ~1 Read/Zeile, obwohl `sqladmin` per
`no_sec=1` global exemptiert ist.

### Versuchter Fix (CTE-Isolation) hat NICHT funktioniert — nicht wiederholen

Idee: Branch 1+2 in eine eigene `WITH bypass AS (...)` CTE isolieren, damit der Optimizer sie
einmalig statt pro Zeile auswertet. **Ergebnis nach Deploy + Messung: identisches
Read-Verhältnis wie vorher, keine Verbesserung.** Grund: benannte CTEs sind in SQL Server
keine Materialisierungs-Grenze — sie werden beim Kompilieren genauso "entfaltet" wie inline
geschriebene Bedingungen. Zusätzlich ist `fn_check_rls` eine **Inline-TVF** (bestätigt
`is_inlineable=True`), die beim Planbau komplett in die äußere Query expandiert wird — es
gibt zum Optimierungszeitpunkt keine "Funktionsgrenze" mehr, an der eine CTE-Isolation
greifen könnte. **Falls RLS-Overhead später wieder zum Flaschenhals wird: einen
fundamental anderen Ansatz probieren (z.B. echte Materialisierung des Bypass-Checks über
eine Session-gecachte Tabelle), nicht diese Variante wiederholen.**

Änderung wurde nach Test zurückgebaut (kein Netto-Nutzen, aber unnötige Komplexität).

### Security-DDL wird bewusst NICHT über dbt deployed

`security/ddl/*.sql` (inkl. `fn_check_rls`) wird laut `security/DEPLOYMENT.md` **manuell in
SSMS** deployed, dev→test→prod, mit eigenem Verifikationsprotokoll. Ein automatisierter
Sicherheitsfilter (Auto-Mode-Classifier) blockiert `DROP SECURITY POLICY`/ähnliche DDL auch
bei explizitem User-Chat-Approval, unabhängig vom verwendeten Shell-Tool (Bash und
PowerShell gleichermaßen betroffen) — das ist eine bewusste, werkzeugübergreifende Grenze,
kein Bug. **Solche Schritte muss der User selbst ausführen; nicht versuchen zu umgehen.**

## 3. DAX-Fallstricke

### `BLANK() <= N` ist in DAX `TRUE`

Ein Calculation-Group-Item mit `'tabelle'[spalte] <= 1` schließt Zeilen mit `BLANK()` in
`spalte` fälschlich ein (DAX behandelt `BLANK()` in numerischen Vergleichen wie `0`). Bei
uns: `konto_pl_zuordnung_v[ab_stufe]` ist für "x Hilfskonten" `NULL` — wurde durch
`ab_stufe <= N` für **jede** Stufe fälschlich mitgezählt. **Fix: immer explizit
`&& NOT ISBLANK(spalte)` ergänzen, wenn die Spalte NULL enthalten kann.**

### Bare Column-Prädikat in CALCULATE() != explizites FILTER(Tabelle, ...)

`CALCULATE(M, KEEPFILTERS('t'[spalte] <= 1))` lieferte empirisch ein **anderes** Ergebnis als
`CALCULATE(M, KEEPFILTERS(FILTER('t', 't'[spalte] <= 1)))` — obwohl beide auf den ersten Blick
äquivalent aussehen. Nur mit expliziter `FILTER()`-Formulierung stimmte das Ergebnis mit der
manuell nachgerechneten Referenz überein. **Bei Zweifeln an einer DAX-Filterlogik: gegen
eine unabhängig berechnete Referenz messen, nicht der Doku/Intuition vertrauen.**

### Sobald EINE Calculation Group im Modell existiert, werden implizite Measures überall deaktiviert

Nicht nur für die Spalten, die die Calculation Group direkt betrifft — **modellweit**.
Rohe Spalten können dann in KEINEM Bucket mehr direkt verwendet werden (Card-Werte,
Tabellen-Values, Zebra-BI-"Category Class" etc.) — es wird überall ein explizites Measure
verlangt (z.B. `SELECTEDVALUE('tabelle'[spalte])`). Fehlermeldung dabei ist wenig sprechend
("Dieses Feld kann hier nicht verwendet werden... implizite Measureseigenschaft ist
aktiviert"). **Beim Debuggen von "Feld nicht verwendbar"-Fehlern zuerst prüfen, ob eine
Calculation Group im Modell existiert.**

## 4. Zebra BI Tables

### Calculation Groups lassen sich NICHT mit einer Category-Hierarchie kombinieren

Wird ein Calculation-Group-Feld ("Summary Lines") zusätzlich zur echten Dimensions-Hierarchie
(z.B. Konto_L2→L1→Konto) in denselben **Category**-Bucket gezogen, entsteht ein Kreuzprodukt:
jeder echte Blattknoten zeigt zusätzlich alle Calc-Group-Items als Pseudo-Kinder, jeweils mit
dem Wert des Blattknotens selbst (nicht der eigentlich gewünschten Zwischensumme).

### Der korrekte Mechanismus für interleaved P&L-Summenzeilen: "Category Class"

Zebra BI Tables hat einen eigenen Bucket **"Category class"** mit den Symbolen
`=` (Result/Zwischensumme), `-` (Invert), `/` (Skip, aus Summen ausschließen, bleibt aber
sichtbar). Umsetzung bei uns: Spalte `dim_konto.zeilentyp` (`NULL`=Detail, `=`=Summary-Plug,
`/`=x Hilfskonten), gebunden über ein Measure `SELECTEDVALUE('dim_konto'[zeilentyp])`
(Grund: implizite Measures sind deaktiviert, siehe oben). **Voraussetzung, die leicht
übersehen wird: Category darf dabei NUR die flache Ebene sein, auf der die Plug-/
Summary-Zeilen liegen** (bei uns `konto_l2`) — eine mehrstufige Hierarchie funktioniert laut
Zebra-BI-Doku zwar grundsätzlich auch, aber das muss man bewusst konfigurieren, nicht
einfach die volle Hierarchie plus Calc-Group-Feld kombinieren (siehe Punkt oben).

Result-Zeilen-Berechnung ist **abhängig von der visuellen Zeilenreihenfolge** — die
Sortierung (`Sortieren nach Spalte` → `konto_sort`) muss stimmen, sonst bleiben
Result-Zeilen leer, weil Zebra BI nicht bestimmen kann, welche Detailzeilen dazugehören.

### Modell-Objektnamen kollidieren case-insensitiv

Eine physische SQL-Spalte `zeilentyp` (klein) kollidierte beim Power-BI-Refresh mit einer
bereits im Modell **manuell angelegten DAX-berechneten Spalte** `Zeilentyp` (groß) —
Power-BI-Objektnamen sind für Eindeutigkeit case-insensitiv. Fehlermeldung nennt dabei
verwirrenderweise **jede** Tabelle im Modell als Kollisionsquelle (Batch-Refresh-Artefakt),
obwohl nur eine einzige Tabelle betroffen ist. **Vor dem Anlegen einer Spalte/eines Measures
mit naheliegendem Namen: prüfen, ob im Modell bereits ein gleichnamiges (auch anders
großgeschriebenes) Objekt existiert — insbesondere wenn der Name schon in älterer
Projektdokumentation als "geplant" auftaucht.**

## 5. Diagnose-Werkzeuge / Vorgehen

- **`dbt show --inline`** wrappt Queries intern mit eigenem `TOP`/`OFFSET` — Konflikte mit
  eigenem `ORDER BY`, `SELECT DISTINCT` + `ORDER BY`, und mehrfachen Statements
  (`SET SHOWPLAN_XML`, `CREATE/ALTER FUNCTION` + folgendes `SELECT`). Workarounds: `ORDER BY`
  weglassen (stattdessen `GROUP BY` für Uniqueness), DDL wie `CREATE OR ALTER FUNCTION` als
  alleiniges Statement ohne Folge-SELECT senden.
- **Vor Annahme "Serverless Cold-Start ist Schuld"**: `sys.dm_db_resource_stats` (CPU/IO/
  Memory-Auslastung) und `sys.dm_os_sys_info.sqlserver_start_time` prüfen. Bei uns lag CPU
  durchgehend unter 27% — Ressourcenengpass war nicht die Ursache, obwohl die Instanz erst
  43 Minuten lief.
- **Gemessene Zahl schlägt Spekulation** — mehrfach in dieser Session bestätigt: eigene
  erste Vermutungen (LIKE-Join als Kostentreiber, RLS-CTE-Fix würde helfen, Sortierung war
  Ursache für leere Result-Zeilen) waren jeweils durch Nachmessen widerlegt oder bestätigt
  worden — nie durch reines Nachdenken allein entschieden.

## 6. Business-Vault-Architektur (kurz)

- Business-Vault-Objekte, die **direkt von einem BI-Tool konsumiert werden**, gehören ins
  Mart-Schema (`mart_finance` etc.), nicht ins `vault`-Schema — Endnutzer sollen langfristig
  nur `mart`/`mart_<domain>` sehen können. Rein intern von anderen dbt-Modellen konsumierte
  Business-Vault-Objekte könnten weiterhin in `vault` liegen, das war hier aber nicht der Fall.
- Eine Business-Vault-Referenztabelle sollte **nur** die echte, quellsystemlose Business-Regel
  enthalten (Sortierung, Zuordnung, Plug-Keys) — **nicht** Labels/Namen, die bereits aus einer
  echten Quelle (Sharepoint etc.) kommen. Sonst entsteht dieselbe Duplizierungs-Problematik,
  die man eigentlich beheben wollte, nur an anderer Stelle.

---

## Entscheidungen & Begründungen

### 1. dbt statt Stored Procedures
**Entscheidung:** dbt Core mit automate-dv Package statt T-SQL Stored Procedures

**Begründung:**
- Versionskontrolle (Git) nativ integriert
- Wiederverwendbare Macros für verschiedene Kunden
- Lineage und Dokumentation automatisch
- Community-Support und Best Practices (automate-dv)

### 2. Hybrid: Raw Vault physisch, Business Vault virtuell
**Entscheidung:** Raw Vault als echte Tabellen, Business Vault als Views

**Begründung:**
- Raw Vault benötigt Insert-Only Performance
- Business Vault ist nur berechnete Sichten
- Kosteneinsparung bei Azure SQL

### 3. SHA2_256 als Hash-Algorithmus
**Entscheidung:** SHA2_256 → CHAR(64) für alle Hash Keys

**Begründung:**
- Industriestandard für Data Vault
- Native Unterstützung in SQL Server (HASHBYTES)
- Keine Kollisionsgefahr bei erwarteten Datenmengen
- 64 Zeichen als feste Länge gut handhabbar

### 4. Linux VM für dbt
**Entscheidung:** dbt auf Linux VM statt Mac/Windows

**Begründung:**
- ODBC-Treiber stabiler unter Linux
- Einfachere Deployment-Vorbereitung für Container
- VS Code Remote SSH ermöglicht komfortable Entwicklung

### 5. Unified Hub Pattern statt 3 separate Hubs
**Entscheidung:** Ein `hub_company` mit `link_company_role` statt `hub_company_client`, `hub_company_contractor`, `hub_company_supplier`

**Begründung:**
- Identische Attribute in allen 3 Quellen (>90% Überlappung)
- Weniger Redundanz, einfachere Wartung
- Role als Link ermöglicht zukünftige Multi-Role-Unternehmen
- `object_id` ist NICHT global unique → Composite Key `object_id + source_table`

### 6. Hash-Separator '^^' statt '||'
**Entscheidung:** `'^^'` als Trennzeichen für Composite Hash Keys

**Begründung:**
- DV 2.1 Best Practice (selten in natürlichen Daten)
- `'||'` kann in SQL-Strings vorkommen (Oracle Concat-Operator)
- Konsistenz mit Scalefree Standards

### 7. dss_is_current + dss_end_date in Satellites
**Entscheidung:** Current-Flag und End-Dating in allen Satellites

**Begründung:**
- Effiziente Abfrage des aktuellen Stands ohne ROW_NUMBER()
- dss_end_date ermöglicht historische Point-in-Time Abfragen
- Post-Hook Macro hält Flag automatisch aktuell

---

## Probleme & Lösungen

### Problem 1: automate-dv Hash Macros inkompatibel
**Symptom:** Fehler bei Verwendung von automate-dv hash() Macro

**Ursache:** automate-dv optimiert für Snowflake/BigQuery, SQL Server anders

**Lösung:** Eigene Hash-Logik im Staging Model:
```sql
CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
    ISNULL(CAST(column AS NVARCHAR(MAX)), '')
), 2) AS hk_entity
```

### Problem 2: Columnstore Index nicht verfügbar
**Symptom:** `CREATE TABLE failed because the following SET options have incorrect settings: 'ANSI_NULLS'`

**Ursache:** Azure SQL Basic Tier unterstützt keine Columnstore Indexes

**Lösung:** In dbt_project.yml und Model-Config:
```yaml
+as_columnstore: false
```

### Problem 3: Schema-Prefix unerwünscht
**Symptom:** Schemas wurden als `dv_stg` statt `stg` erstellt

**Ursache:** dbt-sqlserver fügt Target-Schema als Prefix hinzu

**Lösung:** Custom Macro in `macros/generate_schema_name.sql`:
```sql
{% macro generate_schema_name(custom_schema_name, node) %}
    {{ custom_schema_name | trim }}
{% endmacro %}
```

### Problem 4: profiles.yml im Repo
**Symptom:** Sicherheitsrisiko durch Credentials im Git

**Lösung:** 
- profiles.yml in ~/.dbt/ (außerhalb Repo)
- .gitignore mit `profiles.yml`
- Azure CLI Authentication (keine Passwörter)

### Problem 5: ROW_NUMBER() Performance bei is_current
**Symptom:** Langsame Abfragen bei großen Satellites mit ROW_NUMBER() für Current-Ermittlung

**Lösung:** 
- Physisches `dss_is_current` Flag (CHAR(1): 'Y'/'N')
- Post-Hook Macro `update_satellite_current_flag()` setzt alte Records auf 'N'
- `dss_end_date` für historische Abfragen ohne Window Functions

### Problem 6: object_id nicht global unique
**Symptom:** Duplikate in `hub_company` wenn nur `object_id` als Business Key

**Ursache:** `object_id` ist nur innerhalb einer Quelltabelle unique, nicht systemübergreifend

**Lösung:** Composite Key aus `object_id + source_table`:
```sql
HASHBYTES('SHA2_256', CONCAT(object_id, '^^', source_table))
```

### Problem 7: Schema-Änderungen bei Incremental Models
**Symptom:** Neue Spalten im Model erscheinen nicht in der DB-Tabelle

**Ursache:** dbt fügt bei `incremental` Models standardmäßig **keine neuen Spalten** hinzu

**Lösung:** In `dbt_project.yml`:
```yaml
models:
  datavault:
    raw_vault:
      satellites:
        +on_schema_change: append_new_columns
```

**Wichtig:** 
- `append_new_columns` fügt neue Spalten hinzu (bestehende Zeilen haben NULL)
- `sync_all_columns` würde auch Spalten entfernen (gefährlich!)
- `fail` (default) bricht ab, wenn Schema abweicht
- **Nie** `--full-refresh` bei historisierten Data Vault Tabellen!

### Problem 8: MCP Agent schreibt auf Datenbank
**Symptom:** Agent versucht ALTER TABLE direkt auf DB auszuführen

**Ursache:** Fehlende Read-Only Beschränkung im MCP-Server

**Lösung:**
1. Alle DB-Tools auf READ-ONLY beschränken (nur SELECT erlaubt)
2. Schreiboperationen **nur** über dbt Commands (`run_command: dbt run ...`)
3. isReadOnlyQuery() Funktion blockiert INSERT, UPDATE, DELETE, DROP, etc.

```typescript
// agent/tools/database/dbConnection.ts
const FORBIDDEN_KEYWORDS = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
  'TRUNCATE', 'EXEC', 'EXECUTE', 'MERGE', 'GRANT', 'REVOKE'
];
```

### Problem 9: Deploy-Dialog auf Commits-Seite fehlte
**Symptom:** "Deploy to Data Vault" Button auf Commits-Seite machte nur Seiten-Refresh, kein Dialog

**Ursache:** Zwei verschiedene Deploy-Implementierungen:
- `/deploy` Seite: Hatte korrekten Dialog mit SSE-Streaming
- `/commits` Seite: Direkter API-Call ohne Dialog

**Lösung:**
1. Dialog mit Modus-Auswahl zur Commits-Seite hinzugefügt
2. SSE-Streaming (EventSource) für Live-Logs implementiert
3. Deploy-Modi: "Load + Master" (full) und "Nur Load" (load)

### Problem 10: Doppelte mds_load Tabellen (load_product vs product)
**Symptom:** `mds_load.load_product` und `mds_load.product` existieren beide

**Ursache:** API-Route `ensureLoadTable()` erstellte Tabelle mit `load_` Prefix, aber dbt-Model nutzt nur Entity-Code als Alias

**Lösung:**
```typescript
// VORHER (falsch):
const tableName = `load_${entity.code.toLowerCase()}`

// NACHHER (korrekt):
const tableName = entity.code.toLowerCase()
```

**Wichtig:** dbt Models haben `alias='product'` (ohne Prefix), daher muss die API konsistent sein!

---

## Best Practices (gelernt)

### dbt Projektstruktur
```
models/
  staging/           # Views mit Hash-Berechnung
  raw_vault/
    hubs/            # Business Key + Metadata
    satellites/      # Attribute + Hash Diff
    links/           # Beziehungen
  business_vault/    # PITs, Bridges (virtuell)
```

### Staging Pattern
1. External Table als Source (`stg.ext_<concept>_<entity>`)
2. Staging View berechnet alle Hash Keys (`stg.<concept>_<entity>`)
3. Hash Key = Business Key Hash
4. Hash Diff = Alle Attribute Hash (für Change Detection)

### Satellite Change Detection
```sql
LEFT JOIN ON hk AND NOT EXISTS (sat mit gleichem hd)
```
Statt: Timestamp-basierter Vergleich

### Data Vault 2.1 Compliance Checkliste

| Feature | Status | Implementierung |
|---------|--------|----------------|
| Hash Keys (SHA2_256) | ✅ | `HASHBYTES()` mit CHAR(64) |
| Hash Diff für Change Detection | ✅ | `hd_*` Spalten in Satellites |
| Hash Separator '^^' | ✅ | Composite Keys in jira_company |
| dss_load_date Metadata | ✅ | Alle Vault-Objekte |
| dss_record_source | ✅ | Quellsystem-Tracking |
| dss_is_current Flag | ✅ | Satellites mit Post-Hook |
| dss_end_date | ✅ | Validity Periods |
| Ghost Records | ✅ | Macro erstellt (manuell ausführen) |
| PIT Tables | ✅ | pit_company für History |
| Effectivity Satellites | ✅ | eff_sat_company_country |
| Zero Key (0x00...) | ✅ | Macro vorhanden |
| Error Key (0xFF...) | ✅ | Macro vorhanden |

### Wiederverwendbare Macros

| Macro | Datei | Zweck |
|-------|-------|-------|
| `generate_schema_name` | macros/generate_schema_name.sql | Schema ohne Prefix |
| `update_satellite_current_flag` | macros/satellite_current_flag.sql | dss_is_current Post-Hook |
| `update_effectivity_end_dates` | macros/satellite_current_flag.sql | Effectivity Sat End-Dating |
| `zero_key` | macros/ghost_records.sql | 64x '0' für NULL BKs |
| `error_key` | macros/ghost_records.sql | 64x 'F' für Fehler |
| `insert_ghost_records` | macros/ghost_records.sql | Ghost Records in Hubs |

---

## Nächste Schritte

1. ✅ ~~**Link-Tables** - Verbindung company zu countries~~ → `link_company_country`, `link_company_role`
2. ⏳ **Incremental Test** - Delta-Load mit Synapse Pipeline validieren
3. ✅ ~~**CI/CD** - Azure DevOps Pipeline für dbt run~~ → GitHub Actions implementiert
4. ✅ ~~**Weitere Entities** - contractor, supplier~~ → Unified in `hub_company`
5. ✅ ~~**Business Vault** - PIT Views~~ → `pit_company` erstellt
6. ⏳ **Bridge Tables** - Für komplexe Mart-Queries (wenn Performance-Bedarf)
7. ⏳ **Package Migration** - automate_dv → datavault4dbt evaluieren
8. ✅ ~~**Ghost Records einfügen**~~ - `dbt run-operation insert_ghost_records` ✓

---

## CI/CD Pipeline (GitHub Actions)

### Implementierte Workflows (2025-12-27)

| Workflow | Datei | Trigger | Funktion |
|----------|-------|---------|----------|
| **CI** | `.github/workflows/ci.yml` | PR nach main/dev + Path Filter | dbt compile + dbt test |
| **Deploy Dev** | `.github/workflows/deploy-dev.yml` | Push auf main + manual | dbt run → Vault DB |
| **Deploy Prod** | `.github/workflows/deploy-prod.yml` | Tag v* + manual + Approval | dbt run → Vault_Jira |
| **Docs** | `.github/workflows/docs.yml` | Push auf main + manual | dbt docs → GitHub Pages |

### Path Filter Konfiguration
Workflows werden **nur** bei Änderungen an folgenden Pfaden getriggert:
- `models/**`, `macros/**`, `seeds/**`, `snapshots/**`, `tests/**`
- `dbt_project.yml`, `packages.yml`

**Kein Trigger bei:** `docs/**`, `*.md`, `.github/instructions/**`, `.github/prompts/**`

### Wichtige Ressourcen

| Ressource | Wert |
|-----------|------|
| **Service Principal** | `sp-github-datavault-dbt` |
| **Self-hosted Runner** | `dbt-runner-vm` auf VM 10.0.0.25 |
| **GitHub Secrets** | `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID` |
| **GitHub Pages** | https://fellnerd.github.io/datavault-dbt/ |
| **Environments** | `development`, `production` (mit Approval) |

### CI/CD Lessons Learned

1. **Profile-Name muss übereinstimmen:** `profiles.yml` Profile-Name muss mit `dbt_project.yml` → `profile:` übereinstimmen (`datavault`, nicht `datavault_jira`)

2. **DBT_PROFILES_DIR beachten:** Wenn `DBT_PROFILES_DIR` gesetzt ist, muss `profiles.yml` dort erstellt werden, nicht in `~/.dbt/`

3. **GitHub Pages vorher aktivieren:** Docs-Workflow schlägt fehl, wenn GitHub Pages nicht aktiviert ist

4. **Seeds in Prod:** `ref_role` Seed existiert nur in Dev - bei Prod-Deployment müssen Seeds mit `dbt seed --target jira` geladen werden

5. **Runner Version:** Aktuelle Runner-Version dynamisch ermitteln statt hardcoden

---

## Technische Referenz

### Verbindungsdaten
- **Server:** sql-datavault-weu-001.database.windows.net
- **Database:** DataVault
- **Auth:** Azure CLI (az login)

### VM Zugang
```bash
ssh EWB-local-dev  # Alias in ~/.ssh/config
cd ~/projects/datavault-dbt
source .venv/bin/activate
```

### GitHub Actions Runner
```bash
# Runner Service Status prüfen
sudo systemctl status actions.runner.fellnerd-datavault-dbt.dbt-runner-vm

# Runner neu starten
sudo systemctl restart actions.runner.fellnerd-datavault-dbt.dbt-runner-vm

# Runner Logs
journalctl -u actions.runner.fellnerd-datavault-dbt.dbt-runner-vm -f
```

### Aktueller Stand (2026-01-11)

**MDS Deployment-Updates (2026-01-11):**
- ✅ Deploy-Dialog auf Commits-Seite mit Modus-Auswahl (Load + Master / Nur Load)
- ✅ SSE-Streaming für Live-Logs während Deploy
- ✅ Korrektur: mds_load Tabellen heißen `<entity>` (nicht `load_<entity>`)
- ✅ API-Route korrigiert für konsistente Tabellennamen

**Data Vault Objekte:**
| Objekt | Records | Status |
|--------|---------|--------|
| `hub_company` | 22.457 | ✅ |
| `hub_country` | 242 | ✅ |
| `sat_company` | 22.457 | ✅ |
| `sat_country` | 242 | ✅ |
| `sat_company_client_ext` | ~7.500 | ✅ |
| `link_company_role` | 22.457 | ✅ |
| `link_company_country` | 22.457 | ✅ |
| `eff_sat_company_country` | 22.457 | ✅ |
| `pit_company` | ~900k | ✅ |
| `ref_role` | 3 | ✅ |

**Tests:** 39/39 bestanden

**DV 2.1 Optimierungen (2025-12-27):**
- ✅ Ghost Records Macro erstellt
- ✅ dss_is_current + dss_end_date in allen Satellites
- ✅ PIT-Tabelle für sat_company
- ✅ Effectivity Satellite für link_company_country
- ✅ Hash-Separator auf '^^' standardisiert
