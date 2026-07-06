# Datahub Security-Architektur: RLS, OLS & CLS

---

## 1. Architektur-Überblick

Die Datahub Security setzt auf drei Schichten auf, die vollständig auf SQL Server-nativen Mechanismen basieren:

| Schicht | Zweck | Mechanismus |
|---|---|---|
| **OLS** – Object Level Security | Zugriff auf DB-Objekte (Views, Tabellen) | AD-Gruppen + GRANT auf Views |
| **RLS** – Row Level Security | Zeilen-Filterung (tenant/org-abhängig) | SQL Server Security Policy + Prädikatsfunktion |
| **CLS** – Column Level Security | Spalten-Maskierung (projekt-/feldabhängig) | View-Logik + Security Policy + sec_user_privilege |

---

## 2. Datenbank-Schema SEC

**Datenbanken:** `VAULT` (primär) und `DATAHUB`  
**Schema:** `sec`

### Kerntabellen

```sql
-- Allgemeine Benutzerrechte (RLS + CLS pro Security-Kontext)
vault.sec.sec_user_privilege

-- Spezial-/Admin-Rechte (globale Admins, Service User)
vault.sec.sec_special_user_privilege
```

### Struktur `sec.sec_user_privilege`

| Spalte | Bedeutung |
|---|---|
| `user_name` | AD-User z.B. `DKELAG\FISCHE1` |
| `security_context` | Kontext z.B. `jira`, `jira_projekt`, `em`, `co_transferprice` |
| `sec_value_key` | Filterwert für RLS z.B. Org-Einheit, Mandant, Jira-Projekt |
| `no_sec` | `1` = keine Einschränkung; `2` = Kontext-Admin |

### Struktur `sec.sec_special_user_privilege` (Legacy / BI DesGuide)

Ursprüngliches Modell via `SEC.T_M_SECURITY_PRIVILEGES`:

| Feld | Bedeutung |
|---|---|
| `NO_SEC = 1` | Keinerlei OLS/RLS-Einschränkung |
| `TABLE_NAME` (nur) | → OLS: Zugriff auf Objekt, keine Zeilenfilterung |
| `TABLE_NAME` + `ATTRIBUTE_NAME` + `VALUE` | → RLS: Zugriff auf Tabelle + gefilterte Zeilen |
| `ATTRIBUTE_NAME2` + `VALUE2` | Optionaler zweiter Filterattribut (2-Wert-RLS) |

---

## 3. OLS – Object Level Security

### Mechanismus
- Datenzugriff für Business-User **ausschließlich via Views** auf der `DATAHUB`-Datenbank
- AD-Gruppen erhalten `SELECT`-Rechte auf benötigte Views via GRANT-Scripts
- Scripts liegen auf GitHub: `DB/20_Security/OLS/OLS_<GRUPPE>.sql`

### AD-Gruppen nach Content-Bereich

| Content Bereich | AD-Gruppe(n) |
|---|---|
| Jira | `SQL_DATAHUB_JIRA_RO` |
| Jira PPM | `SQL_DATAHUB_JIRA_PPM_RO` |
| Jira LWL | `SQL_DATAHUB_JIRA_LWL_RO` |
| CO (Controlling) | `SQL_DATAHUB_CO_RO`, `SQL_DATAHUB_CO_TRANSFERPRICE_RO` |
| Energy Management | `SQL_DATAHUB_KNG_DATAPLATFORM_RO` |
| Wirkungsgradbericht | `SQL_DATAHUB_WIRKUNGSGRADBERICHT_RO` |
| LV Insights | `SQL_DATAHUB_LV_INSIGHTS_RO` |

---

## 4. RLS – Row Level Security

### Mechanismus
SQL Server **Security Policies** mit Prädikatsfunktionen filtern Zeilen automatisch beim SELECT.

```sql
-- Prädikatsfunktionen (Schema SEC, Legacy-Modell)
SEC.CheckTableUserOLS                  -- nur OLS-Check
SEC.CheckTableUserOLS_RLS_2Values      -- OLS + RLS mit bis zu 2 Attributen

-- Neue Funktion (VAULT-Modell)
sec.user_check_rls
```

### RLS-Schlüssel: `dss_sec_value_key`

Jede abgesicherte Tabelle/View trägt den `dss_sec_value_key`. Der Wert wird beim Laden aus den DSS-Metadaten (`dss_tenant_key`, ggf. kombiniert mit Activity/Buchungskreis) gebildet.

### Security Policies pro Content-Bereich

| Content Bereich | Policy Name | Security Kontext | Filterbasis |
|---|---|---|---|
| Jira Zeitbuchung | `policy_jira` | `jira` | Org-Hierarchie (täglich generiert) |
| CO Transferpreise | `policy_co_transferprice` | `co_transferprice` | `dss_tenant_key \|\| Activity` |
| Energy Management | `policy_em` | `em` | `dss_tenant_key` (Mandant) |
| HCM | `policy_hcm` | *(implizit via dim_mitarbeiter_v)* | – |

### RLS-Werte Energy Management

| sec_value_key | Zugriff |
|---|---|
| `200` | KELAG + KNG (alle Mandant-200-Daten) |
| `200\|\|0100` | KELAG + KNG, eingeschränkt auf Buchungskreis 0100 |
| `200\|\|KNG` | Nur KNG (Grid ID: N07000 oder GN900079) |
| `200\|\|NE` | Serviceart = NE |
| `200\|\|NE_G` | Serviceart = NE_G |
| `300` | KEW |
| `200\|\|KELAG_KW` | KNG, Serviceart NE, spez. Geschäftspartner + aktiver Vertrag + Lastprofilzähler |

### Jira RLS – UNION ALL Pattern (Sonderfall Mitarbeiter)

Die `jira.fakt_jira_zeitbuchung_v` kombiniert zwei Datenpfade:

```sql
-- Teil 1: FREMDE Zeitbuchungen (RLS-gesichert)
SELECT ... FROM fakt_jira_zeitbuchung_secured_v
WHERE CONCAT('dkelag\', LOWER(d_u.user_code)) <> LOWER(USER_NAME())
-- → unterliegt vault.sec.sec_user_privilege (Kontext: jira)

UNION ALL

-- Teil 2: EIGENE Zeitbuchungen (direkter Zugriff, kein RLS-Filter)
SELECT ... FROM fakt_jira_zeitbuchung  -- Basis-Tabelle
WHERE CONCAT('dkelag\', LOWER(user_code)) = LOWER(USER_NAME())
-- → kein Security-Filter, direkter Record-Abgleich via dim_zeitbuchender_user_key
```

**Identity Resolution:** `CONCAT('dkelag\', LOWER(user_code)) = LOWER(USER_NAME())`

### Direkt vs. indirekt gesicherte Views (Jira)

| View | RLS-Art |
|---|---|
| `jira.fakt_jira_zeitbuchung_secured_v` | **Direkt** – Security Policy `policy_jira` |
| `jira_vorgang_status_zeitbuchung_v` | Indirekt via JOIN auf `dim_organisation_v` |
| `jira.fakt_jira_zeitbuchung_v` | Indirekt via `fakt_jira_zeitbuchung_secured_v` |

### CO RLS – Gesicherte Objekte

| Objekt | Absicherung |
|---|---|
| `dim_transferprice_valuation_v` | Direkt: `policy_co_transferprice` |
| `fakt_transferprice_valuation` | Indirekt via INNER JOIN auf `dim_transferprice_valuation_v` |

### EM RLS – Gesicherte Views (Auswahl)

`em.dim_anschlussobjekt_v`, `em.dim_werk_v`, `em.dim_geraeteplatz_v`, `em.dim_verbrauchsstelle_v`, `em.dim_anlage_v`, `em.dim_anlage_hist_v`, `em.dim_geschaeftspartner_v`, `em.dim_zaehler_v`, `em.dim_zaehlpunkt_v`, `em.fakt_ablesebeleg_v`, `em.fakt_lpz_profile_value_15m_v` u.v.m. (40+ Views, vollständige Liste: Confluence EM Security)

---

## 5. CLS – Column Level Security

### Mechanismus
Keine native SQL-Server-CLS. Umsetzung via **View-Logik**: sensible Spalten werden durch Ersatzwerte ersetzt, wenn der User keinen Eintrag in `sec_user_privilege` mit passendem `security_context = 'jira_projekt'` hat.

### Freigabe-Prozess
1. Anforderung via Jira-Ticket
2. Freigabe durch **Jira Projekt Owner** (im Ticket dokumentiert)
3. Erst nach schriftlicher Freigabe → Berechtigung setzen

### CLS-gesicherte Objekte (Jira)

| View | Gesicherte Spalten |
|---|---|
| `jira.dim_jira_vorgang_v` | `jira_vorgang_name`, `description`, `beantragte_foerdersumme_in_eur`, `foerderquote_in_prozent`, `ausgezahlte_foerdersumme_in_eur`, `idim_fortschritt_in_prozent`, `idim_themengebiet`, `idim_reporting` |
| `jira.vorgang_aenderung_v` | `from_string`, `to_string`, `from_col`, `to_col` |
| `jira.vorgang_feld_v` | `field_value` (für `field_id = 'customfield_19901'` → immer `'confidential'`) |

### CLS-Berechtigung vergeben

| Tabelle | no_sec | Wirkung |
|---|---|---|
| `vault.sec.sec_special_user_privilege` | `1` | Security Admin (global, KEIN normaler User!) |
| `vault.sec.sec_special_user_privilege` | `2` | Kontext-Admin für "jira_projekt" → sieht alle Projekte |
| `vault.sec.sec_user_privilege` | – | Pro AD User + Pro Jira Projekt (z.B. `ITSC`) |

---

## 6. Berechtigungsvergabe – Scripts

### Manuelle Vergabe (SharePoint)

```
insert_sec_special_user_privilege.sql   -- für Admins / Spezialrollen
insert_sec_user_privilege.sql           -- für normale User-Rechte
JIRA_RLS_Manual_Insert.sql              -- Jira RLS: kopiert Rechte von Referenz-User
```

> **Hinweis Jira RLS:** Wird täglich automatisiert neu generiert (Org-Hierarchie). Manuelle Inserts haben nur temporären Effekt bis zum nächsten Nachtlauf.

---

## 7. Rekonstruktions-Checkliste

### Schema & Tabellen anlegen (VAULT)

```sql
-- Schema
CREATE SCHEMA sec;

-- Benutzer-Rechte Tabelle
CREATE TABLE sec.sec_user_privilege (
    sec_user_privilege_key  INT IDENTITY PRIMARY KEY,
    user_name               NVARCHAR(255) NOT NULL,  -- z.B. DKELAG\FISCHE1
    security_context        NVARCHAR(100),           -- z.B. 'jira', 'em', 'co_transferprice'
    sec_value_key           NVARCHAR(500),           -- z.B. '200', 'ITSC', 'KELAG||BtB'
    description             NVARCHAR(500) NULL
);

-- Spezial-Rechte Tabelle
CREATE TABLE sec.sec_special_user_privilege (
    sec_special_user_privilege_key  INT IDENTITY PRIMARY KEY,
    user_name                       NVARCHAR(255) NOT NULL,
    security_context                NVARCHAR(100) NULL,
    no_sec                          TINYINT NOT NULL,  -- 1=Admin, 2=Kontext-Admin
    description                     NVARCHAR(500) NULL
);
```

### Prädikatsfunktion anlegen

```sql
-- Generische RLS-Check-Funktion (Schema VAULT)
CREATE FUNCTION sec.user_check_rls (@sec_value_key NVARCHAR(500), @security_context NVARCHAR(100))
RETURNS TABLE WITH SCHEMABINDING AS
RETURN
    SELECT 1 AS result
    WHERE EXISTS (
        SELECT 1 FROM sec.sec_special_user_privilege
        WHERE user_name = USER_NAME() AND no_sec = 1
    )
    OR EXISTS (
        SELECT 1 FROM sec.sec_user_privilege
        WHERE user_name     = USER_NAME()
          AND security_context = @security_context
          AND sec_value_key   = @sec_value_key
    );
```

### Security Policy anlegen (Beispiel Jira)

```sql
CREATE SECURITY POLICY policy_jira
ADD FILTER PREDICATE sec.user_check_rls(dss_sec_value_key, 'jira')
ON DV_RAW.SAT_JIRA_ISSUE_TIME_BOOKING_MAT
WITH (STATE = ON);
```

### OLS – GRANT-Script Struktur (Beispiel Jira)

```sql
-- DB/20_Security/OLS/OLS_SQL_DATAHUB_JIRA_RO.sql
GRANT SELECT ON jira.dim_jira_vorgang_v              TO [SQL_DATAHUB_JIRA_RO];
GRANT SELECT ON jira.fakt_jira_zeitbuchung_v         TO [SQL_DATAHUB_JIRA_RO];
GRANT SELECT ON jira.vorgang_feld_v                  TO [SQL_DATAHUB_JIRA_RO];
-- ... weitere Views
```

---

## 8. GitHub Repository Referenzen

```
DB/20_Security/
├── OLS/
│   ├── OLS_SQL_DATAHUB_JIRA_RO.sql
│   ├── OLS_SQL_DATAHUB_JIRA_PPM_RO.sql
│   ├── OLS_SQL_DATAHUB_JIRA_LWL_RO.sql
│   ├── OLS_SQL_DATAHUB_CO_RO.sql
│   ├── OLS_SQL_DATAHUB_CO_TRANSFERPRICE_RO.sql
│   ├── OLS_SQL_DATAHUB_KNG_DATAPLATFORM_RO.sql
│   ├── OLS_SQL_DATAHUB_WIRKUNGSGRADBERICHT_RO.sql
│   └── OLS_SQL_DATAHUB_LV_INSIGHTS_RO.sql
└── RLS/
    └── (Security Policies + Prädikatsfunktionen)
```
