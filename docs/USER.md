# Data Vault 2.1 - Benutzer-Dokumentation

> **Projekt:** Virtual Data Vault 2.1 auf Azure  
> **Version:** 2.0.0  
> **Stand:** 2025-12-27

---

## Einführung: Was ist Data Vault?

### Für wen ist diese Dokumentation?

Diese Dokumentation richtet sich an **alle Benutzer** des Data Vault Systems - von Analysten, die Daten abfragen möchten, bis zu Entwicklern, die neue Datenquellen einbinden.

### Was macht unser Data Warehouse?

Stellen Sie sich das Data Vault wie ein **intelligentes Archiv** vor:

```
🏢 Ihre Quellsysteme        →    📊 Data Vault         →    📈 Ihre Berichte
(PostgreSQL, SAP, etc.)          (Azure SQL)               (Power BI, Excel)
```

**Das Data Vault sammelt Daten aus verschiedenen Systemen und:**
- ✅ Speichert **alles** - nichts geht verloren
- ✅ Merkt sich **wann** sich etwas geändert hat
- ✅ Weiß **woher** jede Information stammt
- ✅ Kann **rückwirkend** zeigen, wie Daten aussahen

### Warum Data Vault 2.1?

| Traditionell | Data Vault 2.1 |
|--------------|----------------|
| Daten werden überschrieben | Alle Änderungen werden aufbewahrt |
| "Wie war der Stand vor 3 Monaten?" - Keine Antwort | Vollständige Zeitreise möglich |
| Änderungen am Schema = Datenverlust | Schema-Änderungen jederzeit möglich |
| Eine Quelle = Ein System | Beliebig viele Quellen kombinierbar |

---

## Grundkonzepte (einfach erklärt)

### Die Bausteine des Data Vault

Unser Data Warehouse besteht aus verschiedenen Bausteinen. Hier eine einfache Erklärung:

#### 🔑 **Hubs** - "Die Visitenkarten"

Ein Hub ist wie eine **Visitenkarte** für jedes wichtige Geschäftsobjekt.

```
┌─────────────────────────────────────┐
│           hub_company               │
├─────────────────────────────────────┤
│  ID: ABC123                         │  ← Eindeutige Kennung
│  Erfasst am: 15.03.2024            │  ← Wann zum ersten Mal gesehen
│  Quelle: Werkportal                │  ← Woher die Info stammt
└─────────────────────────────────────┘
```

**Beispiele in unserem System:**
- `hub_company` - Alle Unternehmen (Kunden, Lieferanten, Auftragnehmer)
- `hub_country` - Alle Länder

#### 📊 **Satellites** - "Die Aktenordner"

Ein Satellite ist wie ein **Aktenordner**, der alle Details und deren Änderungshistorie enthält.

```
┌─────────────────────────────────────┐
│         sat_company                 │
├─────────────────────────────────────┤
│  Firma ABC:                         │
│  ├── Version 1 (01.01.2024)        │
│  │   Name: "ABC GmbH"              │
│  │   Adresse: "Musterstr. 1"       │
│  │   Status: Aktuell ✓             │
│  ├── Version 2 (15.06.2024)        │
│  │   Name: "ABC AG"        ← Umfirmierung!
│  │   Adresse: "Musterstr. 1"       │
│  │   Status: Aktuell ✓             │
└─────────────────────────────────────┘
```

**Wichtige Satellites:**
- `sat_company` - Alle Firmendetails (Name, Adresse, Kontakt, ...)
- `sat_country` - Länderdetails (Name)
- `sat_company_client_ext` - Spezielle Kundendaten (Freistellungsbescheinigung)

#### 🔗 **Links** - "Die Verbindungen"

Ein Link verbindet Hubs miteinander - wie ein **Organisationsdiagramm**.

```
        hub_company                    hub_country
             │                              │
             └──────── link_company_country ┘
                  "ABC GmbH sitzt in Deutschland"
```

**Wichtige Links:**
- `link_company_role` - Welche Rolle hat ein Unternehmen? (Kunde/Lieferant/Auftragnehmer)
- `link_company_country` - In welchem Land sitzt das Unternehmen?

#### ⏱️ **PIT-Tabellen** - "Der Zeitnavigator"

PIT (Point-in-Time) Tabellen sind wie ein **Kalender mit Lesezeichen** - sie helfen, schnell den Stand zu einem beliebigen Datum zu finden.

```
"Zeige mir alle Firmendaten, wie sie am 01.06.2024 waren"
     ↓
PIT-Tabelle findet sofort die richtigen Versionen
```

#### 👻 **Ghost Records** - "Die Platzhalter"

Manchmal fehlen Daten (z.B. ein Unternehmen ohne bekanntes Land). Ghost Records sind **Platzhalter** dafür:

- **Zero-Key** (000...000): "Diese Information ist unbekannt"
- **Error-Key** (FFF...FFF): "Hier ist ein Fehler aufgetreten"

---

## Wichtige Spalten verstehen

### Metadata-Spalten (dss_...)

Jede Tabelle hat spezielle Spalten, die mit `dss_` beginnen:

| Spalte | Bedeutung | Beispiel |
|--------|-----------|----------|
| `dss_load_date` | Wann wurde dieser Eintrag geladen? | `2024-12-27 14:30:00` |
| `dss_record_source` | Woher stammt die Information? | `werkportal.wp_company_client` |
| `dss_is_current` | Ist das der aktuelle Stand? | `Y` = Ja, `N` = Historisch |
| `dss_end_date` | Bis wann war dieser Stand gültig? | `2024-06-15` oder `NULL` (=noch gültig) |

### Hash-Spalten (hk_..., hd_...)

| Spalte | Bedeutung | Wozu? |
|--------|-----------|-------|
| `hk_company` | Eindeutige ID für Firma | Verknüpfung zwischen Tabellen |
| `hd_company` | "Fingerabdruck" aller Attribute | Erkennt Änderungen automatisch |

---

## 1. Erste Schritte

### 1.1 Voraussetzungen

- Linux VM mit Netzwerkzugang zu Azure SQL
- Python 3.10+ mit venv
- Azure CLI (`az`) installiert und eingeloggt
- SSH-Zugang zur VM (10.0.0.25)

### 1.2 Projekt Setup

```bash
# Zur VM verbinden
ssh user@10.0.0.25

# Projektverzeichnis
cd ~/projects/datavault-dbt

# Virtual Environment aktivieren
source .venv/bin/activate

# Azure CLI Login prüfen
az account show
```

### 1.3 dbt Verbindung testen

```bash
dbt debug
```

Erwartete Ausgabe:
```
  Connection:
    server: sql-datavault-weu-001.database.windows.net
    database: Vault
    schema: dv
    authentication: cli
  All checks passed!
```

---

## 2. Tägliche Operationen

### 2.1 Development (Shared Dev)

```bash
# Alle Models bauen (Target: dev → Vault DB)
dbt run

# Einzelnes Model bauen
dbt run --select stg_company_client
dbt run --select hub_company_client
dbt run --select sat_company_client

# Model mit allen Abhängigkeiten
dbt run --select +hub_company_client+

# Tests ausführen
dbt test

# SQL generieren ohne Ausführung
dbt compile
```

### 2.2 Produktion (Mandanten-spezifisch)

```bash
# Werkportal Produktion
dbt run --target werkportal

# EWB Produktion (wenn eingerichtet)
dbt run --target ewb
```

### 2.3 External Tables aktualisieren

```bash
# Development
dbt run-operation stage_external_sources

# Produktion
dbt run-operation stage_external_sources --target werkportal
```

---

## 3. Verfügbare Targets

| Target | Datenbank | Befehl |
|--------|-----------|--------|
| `dev` (Standard) | Vault | `dbt run` |
| `werkportal` | Vault_Werkportal | `dbt run --target werkportal` |
| `ewb` | Vault_EWB | `dbt run --target ewb` |

---

## 4. Neue Entity hinzufügen

### Schritt 1: External Table definieren

Bearbeite `models/staging/sources.yml`:

```yaml
- name: ext_neue_entity
  external:
    location: "werkportal/postgres/public.wp_neue_entity.parquet"
    file_format: ParquetFormat
  columns:
    - name: id
      data_type: BIGINT
    - name: name
      data_type: NVARCHAR(255)
    # ... weitere Spalten
```

### Schritt 2: Staging View erstellen

Erstelle `models/staging/stg_neue_entity.sql`:

```sql
{{- config(
    materialized='view'
) -}}

{%- set yaml_metadata -%}
source_model:
    werkportal_data: 'ext_neue_entity'
derived_columns:
    dss_record_source: "!werkportal.wp_neue_entity"
    dss_load_date: "GETDATE()"
hashed_columns:
    hk_neue_entity: 'id'
    hd_neue_entity:
        is_hashdiff: true
        columns:
            - name
            - description
{%- endset -%}

{% set metadata = fromyaml(yaml_metadata) %}

{{ automate_dv.stage(
    include_source_columns=true,
    source_model=metadata['source_model'],
    derived_columns=metadata['derived_columns'],
    hashed_columns=metadata['hashed_columns']
) }}
```

### Schritt 3: Hub erstellen

Erstelle `models/raw_vault/hubs/hub_neue_entity.sql`:

```sql
{{- config(
    materialized='incremental',
    incremental_strategy='append',
    as_columnstore=false
) -}}

{%- set source_model = "stg_neue_entity" -%}
{%- set src_pk = "hk_neue_entity" -%}
{%- set src_nk = "id" -%}
{%- set src_ldts = "dss_load_date" -%}
{%- set src_source = "dss_record_source" -%}

{{ automate_dv.hub(
    src_pk=src_pk, 
    src_nk=src_nk, 
    src_ldts=src_ldts, 
    src_source=src_source, 
    source_model=source_model
) }}
```

### Schritt 4: Satellite erstellen

Erstelle `models/raw_vault/satellites/sat_neue_entity.sql`:

```sql
{{- config(
    materialized='incremental',
    incremental_strategy='append',
    as_columnstore=false
) -}}

{%- set source_model = "stg_neue_entity" -%}
{%- set src_pk = "hk_neue_entity" -%}
{%- set src_hashdiff = "hd_neue_entity" -%}
{%- set src_ldts = "dss_load_date" -%}
{%- set src_source = "dss_record_source" -%}
{%- set src_payload = ["name", "description"] -%}

{{ automate_dv.sat(
    src_pk=src_pk, 
    src_hashdiff=src_hashdiff,
    src_payload=src_payload,
    src_ldts=src_ldts, 
    src_source=src_source, 
    source_model=source_model
) }}
```

### Schritt 5: Deployment

```bash
# External Table erstellen
dbt run-operation stage_external_sources

# Models bauen (Development)
dbt run --select stg_neue_entity hub_neue_entity sat_neue_entity

# Produktion
dbt run-operation stage_external_sources --target werkportal
dbt run --select stg_neue_entity hub_neue_entity sat_neue_entity --target werkportal
```

---

## 5. Useful dbt Commands

### 5.1 Basis-Befehle

| Befehl | Beschreibung |
|--------|--------------|
| `dbt debug` | Verbindung testen |
| `dbt deps` | Packages installieren/updaten |
| `dbt compile` | SQL generieren ohne Ausführung |
| `dbt run` | Alle Models bauen |
| `dbt test` | Tests ausführen |
| `dbt docs generate` | Dokumentation generieren |
| `dbt docs serve` | Dokumentation im Browser anzeigen |

### 5.2 Selektion

| Befehl | Beschreibung |
|--------|--------------|
| `dbt run --select model_name` | Einzelnes Model |
| `dbt run --select +model_name` | Model + Upstream |
| `dbt run --select model_name+` | Model + Downstream |
| `dbt run --select +model_name+` | Alles |
| `dbt run --select staging.*` | Alle Staging Models |
| `dbt run --select tag:hub` | Models mit Tag |

### 5.3 Full Refresh

```bash
# Inkrementelle Models neu bauen (DROP + CREATE)
dbt run --full-refresh
dbt run --full-refresh --select hub_company_client
```

---

## 6. Troubleshooting

### 6.1 Verbindungsprobleme

**Symptom:** `Login failed`
```bash
# Azure CLI Token erneuern
az login
az account set --subscription "<subscription-id>"
dbt debug
```

**Symptom:** `Connection timeout`
```bash
# Firewall prüfen
az sql server firewall-rule list \
  --resource-group synapse-playground \
  --server sql-datavault-weu-001
```

### 6.2 External Table Fehler

**Symptom:** `External table error`
```bash
# External Tables neu erstellen
dbt run-operation stage_external_sources

# Prüfen ob Parquet-Dateien existieren
# (Im Azure Portal: Storage Account → Containers → stage-fs)
```

### 6.3 Model-Fehler

**Symptom:** Kompilierungsfehler
```bash
# SQL anzeigen
dbt compile --select problem_model

# Generiertes SQL prüfen
cat target/compiled/datavault/models/path/to/model.sql
```

**Symptom:** `Columnstore not supported`
```yaml
# In dbt_project.yml oder Model-Config
+as_columnstore: false
```

### 6.4 Logs prüfen

```bash
# dbt Logs
less logs/dbt.log

# Letzte Queries
cat logs/query_log.sql

# Run Results
cat target/run_results.json | jq '.results[] | {model: .unique_id, status: .status}'
```

---

## 7. Daten prüfen

### 7.1 Azure SQL Query

```bash
# Via Azure CLI
az sql query \
  --server sql-datavault-weu-001 \
  --database Vault \
  --query "SELECT TOP 10 * FROM vault.hub_company_client"
```

### 7.2 Datenzählung

```sql
-- External Tables
SELECT COUNT(*) FROM stg.ext_company_client;
SELECT COUNT(*) FROM stg.ext_company_contractor;
SELECT COUNT(*) FROM stg.ext_company_supplier;
SELECT COUNT(*) FROM stg.ext_countries;

-- Data Vault
SELECT COUNT(*) FROM vault.hub_company_client;
SELECT COUNT(*) FROM vault.sat_company_client;
```

---

## 8. Best Practices

### 8.1 Development Workflow

1. **Entwickeln** auf `dev` Target
2. **Testen** mit `dbt test`
3. **Review** der generierten SQL in `target/compiled/`
4. **Commit** nach Git
5. **Deploy** auf Produktion mit `--target werkportal`

### 8.2 Naming Conventions

| Objekt | Pattern | Beispiel |
|--------|---------|----------|
| External Table | `ext_<entity>` | `ext_company_client` |
| Staging View | `stg_<entity>` | `stg_company_client` |
| Hub | `hub_<entity>` | `hub_company_client` |
| Satellite | `sat_<entity>` | `sat_company_client` |
| Link | `link_<e1>_<e2>` | `link_company_country` |
| Hash Key | `hk_<entity>` | `hk_company_client` |
| Hash Diff | `hd_<entity>` | `hd_company_client` |

### 8.3 Änderungen nachvollziehen

```bash
# Letzte Änderungen
git log --oneline -10

# Diff zu letztem Commit
git diff

# Model-History in Vault
SELECT * FROM vault.sat_company_client 
WHERE hk_company_client = '<hash>'
ORDER BY dss_load_date DESC;
```

---

## 9. Kontakt & Support

- **Repository:** `/home/user/projects/datavault-dbt`
- **VM:** 10.0.0.25
- **Azure SQL:** sql-datavault-weu-001.database.windows.net
- **Dokumentation:** `docs/SYSTEM.md`, `docs/USER.md`
- **Lessons Learned:** `LESSONS_LEARNED.md`

---

## 10. Changelog

| Datum | Version | Änderung |
|-------|---------|----------|
| 2025-12-27 | 2.0.0 | DV 2.1 Optimierung: Ghost Records, PIT-Tabellen, Effectivity Satellites |
| 2025-12-27 | 2.0.0 | Kundenfreundliche Dokumentation mit Erklärungen für Endanwender |
| 2025-12-27 | 1.0.0 | Initial Release |

---

## 11. Häufige Fragen (FAQ)

### Für Analysten & Endanwender

**F: Wie finde ich den aktuellen Stand eines Unternehmens?**
```sql
SELECT * FROM vault.sat_company 
WHERE dss_is_current = 'Y'
  AND hk_company = '<hash>';
```

**F: Wie sehe ich alle historischen Änderungen?**
```sql
SELECT * FROM vault.sat_company 
WHERE hk_company = '<hash>'
ORDER BY dss_load_date DESC;
```

**F: Wie war der Stand am 01.06.2024?**
```sql
-- Option 1: Mit PIT-Tabelle (schnell)
SELECT * FROM vault.pit_company p
JOIN vault.sat_company s ON p.hk_company = s.hk_company 
WHERE p.snapshot_date = '2024-06-01';

-- Option 2: Direkt (für einzelne Abfragen)
SELECT * FROM vault.sat_company 
WHERE dss_load_date <= '2024-06-01'
  AND (dss_end_date > '2024-06-01' OR dss_end_date IS NULL);
```

**F: Wie viele Kunden haben wir?**
```sql
SELECT COUNT(*) 
FROM vault.link_company_role 
WHERE role_code = 'CLIENT';
```

**F: Welche Unternehmen sind in Deutschland?**
```sql
SELECT c.name, co.name AS country
FROM vault.sat_company c
JOIN vault.link_company_country lcc ON c.hk_company = lcc.hk_company
JOIN vault.sat_country co ON lcc.hk_country = co.hk_country
WHERE c.dss_is_current = 'Y' 
  AND co.name = 'Deutschland';
```

### Für Entwickler

**F: Warum werden meine Änderungen nicht übernommen?**
- Prüfen Sie mit `dbt run --select <model>` ob das Model läuft
- Bei inkrementellen Models: `dbt run --full-refresh --select <model>`
- Logfiles prüfen: `logs/dbt.log`

**F: Wie füge ich ein neues Feld hinzu?**
1. In `sources.yml` die Spalte zur External Table hinzufügen
2. In `stg_*.sql` die Spalte übernehmen
3. In `sat_*.sql` die Spalte zum Payload hinzufügen
4. `dbt run --full-refresh --select sat_*`

**F: Was bedeutet "Hash Diff has changed"?**
Das bedeutet, dass sich mindestens ein Attribut geändert hat. Der Hash Diff ist ein "Fingerabdruck" aller Attribute - ändert sich einer, ändert sich der Fingerabdruck.

---

## 12. Glossar

| Begriff | Erklärung |
|---------|-----------|
| **Business Key** | Die natürliche, fachliche ID eines Objekts (z.B. Kundennummer) |
| **Hash Key** | Technische ID, berechnet aus dem Business Key (64 Zeichen) |
| **Hash Diff** | "Fingerabdruck" aller Attribute zur Änderungserkennung |
| **Hub** | Speichert Business Keys (wer/was existiert) |
| **Satellite** | Speichert Attribute und deren Historie |
| **Link** | Speichert Beziehungen zwischen Hubs |
| **PIT** | Point-in-Time - Zeigt Datenstände zu bestimmten Zeitpunkten |
| **Effectivity Satellite** | Speichert Gültigkeitszeiträume von Beziehungen |
| **Ghost Record** | Platzhalter für fehlende/fehlerhafte Daten |
| **dbt** | Data Build Tool - Unser Transformations-Werkzeug |
| **Incremental** | Nur neue/geänderte Daten werden geladen |
| **Full Refresh** | Alles wird komplett neu geladen |
