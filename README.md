# Data Vault 2.1 - dbt Project

> Multi-tenant Data Vault 2.1 auf Azure SQL mit dbt Core

## 📋 Übersicht

Dieses Projekt implementiert eine virtualisierte Data Vault 2.1 Architektur für Azure SQL. Die Daten fließen von PostgreSQL über Azure Synapse Pipelines als Parquet-Dateien in ADLS Gen2 und werden via External Tables in dbt transformiert.

### Architektur

```
PostgreSQL → Synapse Pipeline → ADLS Parquet → External Table → Staging View → Hub/Sat/Link
                                                 (stg.ext_*)     (stg.stg_*)    (vault.*)
```

### Multi-Tenant Struktur

| Target | Datenbank | Verwendung |
|--------|-----------|------------|
| `dev` | Vault | Entwicklung |
| `werkportal` | Vault_Werkportal | Produktion (Tenant 1) |
| `ewb` | Vault_EWB | Produktion (Tenant 2, geplant) |

---

## 🚀 Installation

### Voraussetzungen

- **Python 3.10+**
- **ODBC Driver 18 for SQL Server**
- **Azure CLI** (optional, für CLI-Authentifizierung)
- **Git**

### 1. Repository klonen

```bash
# Nur dbt-Projekt (ohne Agent)
git clone https://github.com/fellnerd/datavault-dbt.git

# Mit Agent-Submodule (optional)
git clone --recurse-submodules https://github.com/fellnerd/datavault-dbt.git
```

### 2. Python Virtual Environment erstellen

```bash
cd datavault-dbt
python3 -m venv .venv
source .venv/bin/activate
```

### 3. dbt und Abhängigkeiten installieren

```bash
pip install --upgrade pip
pip install dbt-core dbt-sqlserver
```

### 4. dbt Packages installieren

```bash
dbt deps
```

---

## 🔐 Datenbankverbindung konfigurieren

Die dbt-Verbindung wird über `~/.dbt/profiles.yml` konfiguriert (nicht im Repository!).

### profiles.yml erstellen

```bash
mkdir -p ~/.dbt
nano ~/.dbt/profiles.yml
```

### Konfiguration mit SQL-Authentifizierung

```yaml
datavault:
  target: dev
  outputs:
    dev:
      type: sqlserver
      driver: 'ODBC Driver 18 for SQL Server'
      server: sql-datavault-weu-001.database.windows.net
      port: 1433
      database: Vault
      schema: dv
      authentication: sql
      user: <SQL_USER>
      password: "<SQL_PASSWORD>"
      encrypt: true
      trust_cert: false
    
```

### Alternative: Azure CLI-Authentifizierung (empfohlen)

```yaml
datavault:
  target: dev
  outputs:
    dev:
      type: sqlserver
      driver: 'ODBC Driver 18 for SQL Server'
      server: sql-datavault-weu-001.database.windows.net
      port: 1433
      database: Vault
      schema: dv
      authentication: cli
      encrypt: true
      trust_cert: false
```

Vorher einloggen:
```bash
az login
```

### Benötigte Informationen

| Parameter | Beschreibung | Beispiel |
|-----------|--------------|----------|
| `server` | Azure SQL Server FQDN | `sql-datavault-weu-001.database.windows.net` |
| `database` | Zieldatenbank | `Vault` |
| `user` | SQL Admin Benutzer | `sqladmin` |
| `password` | SQL Passwort | (vom Admin erfragen) |

### Verbindung testen

```bash
source .venv/bin/activate
dbt debug
```

Erwartete Ausgabe:
```
Connection test: [OK connection ok]
```

---

## 📖 Verwendung

### Grundbefehle

```bash
# Umgebung aktivieren
source .venv/bin/activate

# Alle Models bauen (Development)
dbt run

# Einzelnes Model
dbt run --select hub_company_client

# Model mit Abhängigkeiten
dbt run --select +sat_company_client+

# Produktion (Werkportal)
dbt run --target werkportal

# Tests ausführen
dbt test

# External Tables aktualisieren
dbt run-operation stage_external_sources

# SQL kompilieren (ohne Ausführung)
dbt compile --select model_name
```

### Neues Full-Refresh

```bash
# Alle Models neu bauen
dbt run --full-refresh

# External Tables neu erstellen
dbt run-operation stage_external_sources --vars '{"ext_full_refresh": true}'
```

---

## 📁 Projektstruktur

```
datavault-dbt/
├── dbt_project.yml          # Projektkonfiguration
├── packages.yml             # dbt Packages (automate_dv, etc.)
├── models/
│   ├── staging/             # External Tables & Staging Views
│   │   ├── sources.yml      # External Table Definitionen
│   │   └── stg_*.sql        # Staging Views mit Hash-Berechnung
│   └── raw_vault/
│       ├── hubs/            # Hub Tables
│       └── satellites/      # Satellite Tables
├── macros/                  # Custom Macros
├── seeds/                   # Reference Data (CSV)
├── scripts/                 # Utility SQL Scripts
└── docs/                    # Dokumentation
```

---

## 📚 Dokumentation

| Dokument | Beschreibung |
|----------|--------------|
| [docs/DEVELOPER.md](docs/DEVELOPER.md) | Ausführlicher Entwickler-Guide |
| [docs/CLAUDE.md](docs/CLAUDE.md) | KI-Assistent Kontext |
| [LESSONS_LEARNED.md](LESSONS_LEARNED.md) | Troubleshooting & Entscheidungen |

---

## ⚠️ Wichtige Hinweise

### Azure SQL Basic Tier Limitierungen

- **Kein Columnstore Index** → Immer `as_columnstore: false` setzen
- **Incremental Strategy:** `append` verwenden

### Hash-Berechnung

Verwende SQL Server native Funktionen (nicht automate_dv Macros):

```sql
CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
    ISNULL(CAST(column AS NVARCHAR(MAX)), '')
), 2)
```

### Häufige Fehler

| Problem | Lösung |
|---------|--------|
| Schema wird als `dv_stg` statt `stg` erstellt | `generate_schema_name` Macro prüfen |
| External Table Fehler | `dbt run-operation stage_external_sources` ausführen |
| Cross-Database Fehler | `{{ target.database }}` statt hardcoded DB verwenden |

---

## 🔗 Links

- **GitHub:** [fellnerd/datavault-dbt](https://github.com/fellnerd/datavault-dbt)
- **Agent Repo:** [fellnerd/datavault-agent](https://github.com/fellnerd/datavault-agent)
- **dbt Docs:** [docs.getdbt.com](https://docs.getdbt.com)
- **automate_dv:** [automate-dv.readthedocs.io](https://automate-dv.readthedocs.io)

---

## 📄 Lizenz

Privates Projekt - Alle Rechte vorbehalten.
