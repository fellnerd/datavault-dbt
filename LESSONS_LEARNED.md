# Lessons Learned - Data Vault 2.1 mit dbt auf Azure

## Projektkontext
PoC für eine virtualisierte Data Vault 2.1 Architektur als wiederverwendbares SaaS-Template.

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
1. External Table als Source (`stg.ext_*`)
2. Staging View berechnet alle Hash Keys (`stg.stg_*`)
3. Hash Key = Business Key Hash
4. Hash Diff = Alle Attribute Hash (für Change Detection)

### Satellite Change Detection
```sql
LEFT JOIN ON hk AND NOT EXISTS (sat mit gleichem hd)
```
Statt: Timestamp-basierter Vergleich

---

## Nächste Schritte

1. **Link-Tables** - Verbindung company_client zu countries
2. **Incremental Test** - Delta-Load validieren
3. **CI/CD** - Azure DevOps Pipeline für dbt run
4. **Weitere Entities** - contractor, supplier
5. **Business Vault** - PIT und Bridge Views

---

## Technische Referenz

### Verbindungsdaten
- **Server:** sql-datavault-weu-001.database.windows.net
- **Database:** DataVault
- **Auth:** Azure CLI (az login)

### VM Zugang
```bash
ssh dimetrics-local-dev  # Alias in ~/.ssh/config
cd ~/projects/datavault-dbt
source .venv/bin/activate
```

### Aktueller Stand ($(date +%Y-%m-%d))
- ✅ Hub: vault.hub_company_client (7.501 Records)
- ✅ Satellite: vault.sat_company_client (7.501 Records)
- 🔄 Link: Noch zu erstellen
