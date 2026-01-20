---
description: Hook vor Tool-Ausführung
trigger: PreToolCall
tools: [datavault-agent]
---

# Pre-Tool-Call Hook

Dieser Hook wird vor jeder Tool-Ausführung aufgerufen.

## Destruktive Aktionen erkennen

### DELETE / DROP Operationen

Wenn der Tool-Call einen dieser Patterns enthält:
- `DELETE FROM`
- `DROP TABLE`
- `DROP VIEW`
- `TRUNCATE`
- `--full-refresh`

**→ Warnung anzeigen:**

```
⚠️ ACHTUNG: Destruktive Operation erkannt!

Du bist dabei folgende Aktion auszuführen:
  {{ACTION_DESCRIPTION}}

Betroffene Objekte:
  - {{OBJECT_NAME}}

Diese Aktion kann nicht rückgängig gemacht werden.

[Ja, ausführen] [Abbrechen]
```

## Produktionsschutz

Wenn `target` = `werkportal` oder `ewb`:

```
🔒 PRODUKTION: {{TARGET}}

Du arbeitest in einer Produktionsumgebung.
Bitte bestätige, dass diese Änderung:

☐ Getestet wurde in DEV
☐ Keine Breaking Changes enthält
☐ Dokumentiert ist

[Fortfahren] [Abbrechen]
```

## Query-Validierung

Vor `run_query`:

1. **Kein LIMIT/TOP bei SELECT:**
   ```
   ⚠️ Query ohne LIMIT erkannt.
   Bei großen Tabellen kann dies zu Timeouts führen.
   
   Empfehlung: SELECT TOP 1000 ...
   
   [Trotzdem ausführen] [LIMIT hinzufügen]
   ```

2. **UPDATE/DELETE ohne WHERE:**
   ```
   🚫 BLOCKIERT: UPDATE/DELETE ohne WHERE-Klausel
   
   Dies würde ALLE Zeilen betreffen.
   Bitte füge eine WHERE-Bedingung hinzu.
   ```

## Model-Erstellung validieren

Vor `create_hub`, `create_satellite`, `create_link`:

1. Prüfe ob Entity-Name den Konventionen entspricht
2. Prüfe ob Staging-View existiert
3. Prüfe auf Namenskonflikte

```
✓ Entity-Name: {{ENTITY_NAME}} - OK
✓ Staging-View: stg_{{ENTITY_NAME}} - gefunden
✓ Kein Namenskonflikt

Fortfahren mit Erstellung...
```

## Implementierung

```javascript
// Pseudo-Code für Hook-Logik
function preToolCall(toolName, args) {
  // Destruktive Patterns
  const destructivePatterns = [
    /DELETE\s+FROM/i,
    /DROP\s+(TABLE|VIEW)/i,
    /TRUNCATE/i,
    /--full-refresh/
  ];
  
  // Query prüfen
  if (args.query) {
    for (const pattern of destructivePatterns) {
      if (pattern.test(args.query)) {
        return { 
          blocked: false,
          warning: "Destruktive Operation erkannt",
          requireConfirmation: true 
        };
      }
    }
  }
  
  // Produktion prüfen
  if (args.target && ['werkportal', 'ewb'].includes(args.target)) {
    return {
      blocked: false,
      warning: "Produktionsumgebung",
      requireConfirmation: true
    };
  }
  
  return { blocked: false };
}
```
