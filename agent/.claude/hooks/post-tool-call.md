---
description: Hook nach Tool-Ausführung
trigger: PostToolCall
tools: [datavault-agent]
---

# Post-Tool-Call Hook

Dieser Hook wird nach jeder Tool-Ausführung aufgerufen.

## Ergebnis-Formatierung

### dbt run Ergebnisse

Nach `run_command` mit dbt:

```
═══════════════════════════════════════
dbt run - Zusammenfassung
═══════════════════════════════════════

{{FORMATTED_OUTPUT}}

📊 Nächste Schritte:
  1. Tests ausführen: dbt test --select {{MODEL}}
  2. Daten prüfen: /db-preview {{MODEL}}
  3. Dokumentation aktualisieren
```

### Query-Ergebnisse

Nach `run_query`:

```
═══════════════════════════════════════
Query-Ergebnis
═══════════════════════════════════════
{{ROW_COUNT}} Zeilen in {{DURATION}}s

{{FORMATTED_TABLE}}

💡 Tipps:
  - Ergebnis exportieren: [Als CSV] [Als JSON]
  - Query speichern: [Als Snippet]
```

## Fehlerbehandlung

### Bei Fehlern

```
❌ Fehler bei: {{TOOL_NAME}}

{{ERROR_MESSAGE}}

🔍 Mögliche Ursachen:
{{SUGGESTED_CAUSES}}

🛠️ Lösungsvorschläge:
{{SUGGESTED_FIXES}}

📚 Dokumentation:
  - [Troubleshooting](docs/DEVELOPER.md#troubleshooting)
  - [LESSONS_LEARNED.md](LESSONS_LEARNED.md)
```

### Bekannte Fehler erkennen

| Fehlermuster | Ursache | Lösung |
|--------------|---------|--------|
| `Invalid column name` | Spalte fehlt in Quelle | Staging aktualisieren |
| `Cannot insert duplicate key` | PK-Verletzung | Hash-Berechnung prüfen |
| `Login failed` | Auth-Problem | `az login` ausführen |
| `Request rate too large` | Throttling | Warten und wiederholen |

## Nächste Schritte vorschlagen

### Nach Hub-Erstellung

```
✅ hub_{{ENTITY_NAME}} erstellt!

📋 Empfohlene nächste Schritte:
  1. → /create-satellite {{ENTITY_NAME}}
  2. → /add-tests hub_{{ENTITY_NAME}}
  3. → dbt run --select hub_{{ENTITY_NAME}}
```

### Nach Satellite-Erstellung

```
✅ sat_{{ENTITY_NAME}} erstellt!

📋 Empfohlene nächste Schritte:
  1. → /create-link (falls FKs vorhanden)
  2. → /create-pit {{ENTITY_NAME}} (für optimierte Abfragen)
  3. → /create-mart {{ENTITY_NAME}}_current_v
```

### Nach vollständiger Entity

```
✅ Entity {{ENTITY_NAME}} vollständig!

📋 Deployment:
  dbt run --select stg_{{ENTITY_NAME}} hub_{{ENTITY_NAME}} sat_{{ENTITY_NAME}}

📋 Produktion:
  dbt run --target werkportal --select +{{ENTITY_NAME}}+
```

## Logging

Jeder Tool-Call wird geloggt:

```
[2024-01-15 14:30:00] TOOL: create_hub
[2024-01-15 14:30:00] ARGS: {"entityName": "company", ...}
[2024-01-15 14:30:02] RESULT: SUCCESS
[2024-01-15 14:30:02] OUTPUT: Created hub_company.sql
```

Log-Datei: `logs/claude_tool_calls.log`

## Implementierung

```javascript
// Pseudo-Code für Hook-Logik
function postToolCall(toolName, args, result) {
  // Erfolg loggen
  log(`[${timestamp()}] TOOL: ${toolName} - ${result.success ? 'SUCCESS' : 'FAILED'}`);
  
  // Fehler analysieren
  if (!result.success) {
    const suggestions = analyzeError(result.error);
    return {
      formattedOutput: formatError(result.error, suggestions),
      nextSteps: suggestions.fixes
    };
  }
  
  // Nächste Schritte basierend auf Tool
  const nextSteps = getNextSteps(toolName, args);
  
  return {
    formattedOutput: formatOutput(result),
    nextSteps: nextSteps
  };
}

function getNextSteps(toolName, args) {
  const steps = {
    'create_hub': [
      `/create-satellite ${args.entityName}`,
      `/add-tests hub_${args.entityName}`
    ],
    'create_satellite': [
      `/create-link (falls FKs)`,
      `/create-pit ${args.entityName}`
    ],
    // ...
  };
  return steps[toolName] || [];
}
```
