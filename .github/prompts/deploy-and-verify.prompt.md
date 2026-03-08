---
mode: agent
description: "Deployed dbt-Modelle auf Azure SQL, führt Tests aus und verifiziert die Ergebnisse in der Datenbank"
---

# Deploy & Verify

Deploye die angegebenen dbt-Modelle und verifiziere die Ergebnisse.

## Input
Modelle: `{{models}}`
Target: `{{target:ewb-dev}}`

## Workflow

### 1. Environment Setup
```bash
cd /Users/daniel/source/projects/ppmc/ewb/datavault-dbt
source .venv/bin/activate
set -a && source .env && set +a
```

### 2. External Tables aktualisieren (bei Staging-Änderungen)
```bash
dbt run-operation stage_external_sources --target {{target}}
```

### 3. Deploy
```bash
dbt run --select "{{models}}" --target {{target}}
```

### 4. Tests
```bash
dbt test --select "{{models}}" --target {{target}}
```

### 5. DB-Verifikation
Verbinde zu `sql-analytics-ewb-001.database.windows.net` und prüfe:
- Objekt existiert in der Datenbank
- Zeilenanzahl > 0
- Keine NULL Business Keys
- Keine doppelten Hash Keys
- Bei Satellites: `dss_is_current` Verteilung prüfen

### 6. Fehlerbehandlung
Bei Fehlern:
- **Compilation Error:** Reserved Keywords? SQL-Syntax?
- **Database Error:** Schema vorhanden? Connection OK?
- **Test Failures:** NULL-Werte? Duplikate? Hash-Berechnung prüfen
