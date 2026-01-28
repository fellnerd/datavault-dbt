# Mart Designer - Testanleitung

Diese Anleitung beschreibt Schritt für Schritt, wie der Mart Designer mit dem bestehenden **Jira Vault** getestet werden kann.

## Voraussetzungen

- VS Code Extension ist kompiliert (`npm run build:all`)
- Extension im Debug-Modus gestartet (F5)
- Jira Raw Vault existiert mit:
  - `hub_project` + `sat_project`
  - `hub_vorgang` + `sat_vorgang`
  - `link_vorgang_project`
  - `ref_vorgang_status`

---

## Test 1: Mart Designer öffnen

### Schritte:
1. **Mart Tree View** in der Sidebar öffnen (Data Vault Icon)
2. Auf das **"Open Mart Designer"** Icon in der Toolbar des Mart-Views klicken
3. Alternativ: Command Palette (`Ctrl+Shift+P`) → "Open Mart Designer"

### Erwartetes Ergebnis:
- Neues Editor-Tab öffnet sich mit leerem Canvas
- Toolbar zeigt "New Mart (no concept)"
- Empty State wird angezeigt: "Drag entities from the Raw Vault tree..."

---

## Test 2: Dimension aus Hub erstellen (dim_project)

### Schritte:
1. **Raw Vault Tree View** öffnen
2. Navigieren zu: `jira` → `hubs` → `hub_project`
3. **Rechtsklick** auf `hub_project`
4. Im Kontextmenü: **"Add as Dimension"** wählen

### Erwartetes Ergebnis:
- Neue Dimension-Node erscheint auf dem Canvas
- Node-Header: "dim_project" (blau)
- Angezeigt werden:
  - SK: `sk_project` (gelb, Primary Key)
  - BK: `project_id` (blau, Business Key)
  - HK: `hk_project` (optional)
- Footer: "Source: hub_project"
- Validation Warning: "No attributes" (gelbes Badge in Toolbar)

---

## Test 3: Attribute aus Satellite hinzufügen

### Schritte:
1. **dim_project Node auswählen** (klicken)
2. Im Raw Vault Tree: `jira` → `satellites` → `sat_project`
3. **Rechtsklick** auf `sat_project`
4. **"Add Attributes to Node"** wählen

### Erwartetes Ergebnis:
- Dialog erscheint mit Spalten-Auswahl:
  - `project_key`
  - `name`
  - `url`
  - `description`
  - `category`
  - `type`
  - `is_private`
  - `lead_account_id`
  - `total_issue_count`
  - `last_issue_update_time`
  - `is_deleted`
- Nach Auswahl und Bestätigung:
  - Attribute erscheinen in der Dimension-Node
  - Properties Panel zeigt die neuen Attribute
  - Validation Warning verschwindet (wenn Attribute vorhanden)

---

## Test 4: Zweite Dimension erstellen (dim_vorgang)

### Schritte:
1. Rechtsklick auf `hub_vorgang` → **"Add as Dimension"**
2. dim_vorgang Node wird erstellt
3. Rechtsklick auf `sat_vorgang` → **"Add Attributes to Node"**
4. Attribute auswählen (z.B. `issue_key`, `summary`, `priority`, `resolution`)

### Erwartetes Ergebnis:
- Zwei Dimension-Nodes auf dem Canvas
- Beide zeigen ihre jeweiligen Attribute
- Validation: Beide Dimensionen sind "valid" (grün)

---

## Test 5: Fact aus Link erstellen (fact_vorgang_project)

### Schritte:
1. Im Raw Vault Tree: `jira` → `links` → `link_vorgang_project`
2. **Rechtsklick** auf `link_vorgang_project`
3. **"Add as Fact"** wählen

### Erwartetes Ergebnis:
- Neue Fact-Node erscheint (orange Header)
- Node-Header: "fact_vorgang_project"
- Angezeigt werden:
  - FK: `fk_vorgang` (orange)
  - FK: `fk_project` (orange)
- Footer: "Source: link_vorgang_project"
- Validation Error: "No dimension references" (rot)

---

## Test 6: Fact mit Dimensions verbinden

### Schritte:
1. **Edge ziehen**: Vom FK-Handle der Fact-Node zum SK-Handle der Dimension-Node
   - `fact_vorgang_project.fk_vorgang` → `dim_vorgang.sk_vorgang`
   - `fact_vorgang_project.fk_project` → `dim_project.sk_project`

### Erwartetes Ergebnis:
- Zwei Edges verbinden Fact mit Dimensions
- Fact-Node zeigt Dimension References im Properties Panel
- Validation Error verschwindet (grünes Badge)

---

## Test 7: Properties Panel - Dimension bearbeiten

### Schritte:
1. **dim_project auswählen**
2. Im Properties Panel rechts:
   - **SCD Type** ändern: `Type 1` → `Type 2`
   - **Materialization** ändern: `view` → `table`
   - **Surrogate Key Strategy** ändern: `row_number` → `identity`

### Erwartetes Ergebnis:
- Node zeigt Badge "SCD2"
- Properties werden im State gespeichert
- Bei `identity` + `table`: Kein Fehler
- Bei `identity` + `view`: Validation Error erscheint

---

## Test 8: Properties Panel - Fact bearbeiten

### Schritte:
1. **fact_vorgang_project auswählen**
2. Im Properties Panel:
   - Measures überprüfen (leer)
   - Dimension Refs überprüfen (2 Einträge)
   - Aggregation für Measures setzen

### Erwartetes Ergebnis:
- Dimension Refs zeigen:
  - `dim_vorgang` mit FK `fk_vorgang`
  - `dim_project` mit FK `fk_project`
- Measure-Aggregation ist editierbar (SUM, COUNT, AVG, etc.)

---

## Test 9: Validation testen

### Schritte:
1. **Validation Button** in der Toolbar klicken (zeigt Fehler/Warnings)
2. Validation Panel öffnet sich unten links

### Test-Szenarien:
| Szenario | Erwartung |
|----------|-----------|
| Dimension ohne Source | ERROR: "has no source defined" |
| Dimension ohne Attributes | WARNING: "has no attributes" |
| Fact ohne Dimension Refs | ERROR: "has no dimension references" |
| Fact ohne Measures | WARNING: "has no measures (factless fact)" |
| SCD2 ohne PIT (multi-sat) | WARNING: "Consider using PIT table" |
| Identity + View | ERROR: "requires table materialization" |

---

## Test 10: Speichern und Laden

### Speichern:
1. **Save Button** klicken (oder `Ctrl+S`)
2. Datei wird gespeichert unter: `.vscode/mart-designer/jira_<martname>.json`

### Laden:
1. Mart Designer schließen
2. Mart Designer erneut öffnen
3. Gespeicherter State wird wiederhergestellt

### Erwartetes Ergebnis:
- Alle Nodes, Edges und Properties bleiben erhalten
- Position der Nodes bleibt gleich

---

## Test 11: Code Generation

### Schritte:
1. Sicherstellen: Keine Validation Errors (grünes Badge)
2. **Generate Button** klicken

### Erwartetes Ergebnis:
Generierte Dateien unter `models/mart/jira/`:

```
models/mart/jira/
├── _base/
│   ├── _base_dim_project.sql      ← Generiert (ephemeral)
│   ├── _base_dim_vorgang.sql      ← Generiert (ephemeral)
│   └── _base_fact_vorgang_project.sql
├── dim_project.sql                 ← Final (nur wenn neu)
├── dim_vorgang.sql                 ← Final (nur wenn neu)
├── fact_vorgang_project.sql        ← Final (nur wenn neu)
└── _jira__models.yml               ← Schema
```

### Base-Model prüfen (`_base_dim_project.sql`):
```sql
{{ config(materialized='ephemeral') }}

WITH base AS (
    SELECT
        hk_project,
        project_id
    FROM {{ ref('hub_project') }}
),

sat_project AS (
    SELECT
        hk_project,
        project_key,
        name,
        ...
    FROM {{ ref('sat_project') }}
    WHERE ...
)

SELECT
    ROW_NUMBER() OVER (ORDER BY base.hk_project) AS sk_project,
    base.project_id,
    sat.project_key,
    sat.name,
    ...
FROM base
LEFT JOIN sat_project sat ON base.hk_project = sat.hk_project
```

---

## Test 12: Attribute entfernen

### Schritte:
1. **dim_project auswählen**
2. Im Properties Panel → Attributes
3. **X-Button** neben einem Attribut klicken (z.B. `is_deleted`)

### Erwartetes Ergebnis:
- Attribut wird aus der Liste entfernt
- Node wird aktualisiert
- Dirty-Indicator (●) erscheint neben Mart-Name

---

## Test 13: Dimension Reference entfernen

### Schritte:
1. **fact_vorgang_project auswählen**
2. Im Properties Panel → Dimension Refs
3. **X-Button** neben einer Dimension Ref klicken

### Erwartetes Ergebnis:
- Dimension Ref wird entfernt
- Edge auf dem Canvas wird entfernt
- Wenn keine Refs mehr: Validation Error erscheint

---

## Test 14: Dirty State & Unsaved Changes

### Schritte:
1. Änderung vornehmen (z.B. Attribut entfernen)
2. Dirty-Indicator (●) sollte erscheinen
3. Versuchen den Tab zu schließen

### Erwartetes Ergebnis:
- Warnung: "You have unsaved changes"
- Option zum Speichern oder Verwerfen

---

## Zusammenfassung der Test-Features

| Feature | Status | Test |
|---------|--------|------|
| Mart Designer öffnen | ✓ | Test 1 |
| Dimension aus Hub | ✓ | Test 2 |
| Attributes aus Satellite | ✓ | Test 3 |
| Fact aus Link | ✓ | Test 5 |
| Edge-Verbindungen | ✓ | Test 6 |
| Properties Panel | ✓ | Test 7, 8 |
| Validation | ✓ | Test 9 |
| Save/Load | ✓ | Test 10 |
| Code Generation | ✓ | Test 11 |
| Attribute entfernen | ✓ | Test 12 |
| Dim Ref entfernen | ✓ | Test 13 |
| Dirty State | ✓ | Test 14 |

---

## Bekannte Einschränkungen

1. **Auto-Layout** noch nicht implementiert
2. **Undo/Redo** noch nicht implementiert
3. **PIT als Source** erfordert manuelles Setzen via "Use as Source"
4. **Role-Playing Dimensions** müssen manuell konfiguriert werden

---

## Fehlerbehebung

### Problem: Kontextmenü zeigt keine Mart-Optionen
**Lösung:** Mart Designer muss geöffnet sein (Context: `datavault.martDesignerOpen`)

### Problem: Generate-Button ist deaktiviert
**Lösung:** Validation Errors beheben (rotes Badge in Toolbar)

### Problem: Nodes erscheinen nicht
**Lösung:** Console öffnen (`Ctrl+Shift+I`) und Fehler prüfen
