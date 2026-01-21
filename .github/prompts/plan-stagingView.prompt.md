## Plan: Data Vault Staging View Funktionalität

Basierend auf meiner Recherche zu Data Vault 2.1 Best Practices und der aktuellen Projektstruktur habe ich einen Implementierungsplan erstellt.

### TL;DR
Die Staging-Layer berechnet **einmalig** alle Hash Keys, Hash Diffs und Metadaten für die nachfolgenden Raw Vault Objekte. Die VS Code Extension soll einen Wizard bieten, der aus einer External Table eine vollständige Staging View mit korrekter DV-Compliance generiert.

### Steps

1. **`createStaging` Command implementieren** in `src/commands/staging.ts` – Wizard startet aus Kontextmenü auf External Table im Load-Tree

2. **Column Picker UI erstellen** in `src/webviewPanel.ts` – Interaktive Spaltenauswahl für Business Key, Payload und FK-Mapping

3. **Staging Template Generator** in `src/services/stagingGenerator.ts` – SQL/Jinja-Generierung mit Hash-Berechnungen nach aktuellem Pattern aus `models/staging/adventureworks_customer.sql`

4. **Schema YAML Generator** integrieren – Automatische `_staging__models.yml` Erweiterung mit Spaltendokumentation

5. **Validation Rules** hinzufügen in `src/services/stagingValidator.ts` – DV-Compliance-Prüfung (BK required, Hash Format, Naming)

### Staging Transformationen (nach DV 2.1 Best Practice)

| Berechnung | Zweck | Pattern |
|------------|-------|---------|
| **Hash Key (`hk_*`)** | Surrogate PK für Hubs/Links | `SHA2_256(CONCAT_WS('^^', bk_cols))` |
| **Hash Diff (`hd_*`)** | Change Detection für Satellites | `SHA2_256(CONCAT_WS('||', payload_cols))` – alpha-sortiert |
| **FK Hash Keys** | Referenz zu anderen Hubs | `hk_<target_entity>` berechnet aus FK-Spalte |
| **Record Source** | Audit Trail | `COALESCE(dss_record_source, '<default>')` |
| **Load Date** | Temporal Tracking | `COALESCE(dss_load_date, GETDATE())` |

### Wizard Flow

```
External Table auswählen
         ↓
Entity-Name & Concept bestätigen (auto-suggest)
         ↓
Business Key Spalten auswählen (multi-select, composite möglich)
         ↓
Payload Spalten für Hash Diff wählen (Checklist mit "Alle außer Metadata")
         ↓
Foreign Keys definieren (optional: FK-Spalte → Target Entity)
         ↓
Preview & Generate → SQL File + YAML Schema
```

### Design Decisions

| Entscheidung | Lösung |
|--------------|--------|
| **Composite Business Key** | `'^^'` als DV-Standard-Separator, konfigurierbar über Settings |
| **FK Auto-Detection** | Ja – Pattern `*_id` → `hub_*` mit manueller Korrekturmöglichkeit im Wizard |
| **Update Staging** | Von Anfang an implementieren – `createStaging` + `updateStaging` Commands |

---

### Commands

| Command | Trigger | Beschreibung |
|---------|---------|--------------|
| `datavault.createStaging` | Kontextmenü auf External Table | Neues Staging Model erstellen |
| `datavault.updateStaging` | Kontextmenü auf Staging Model | Spalten hinzufügen, Hash Diff aktualisieren |
| `datavault.validateStaging` | Kontextmenü auf Staging Model | DV-Compliance prüfen |

---

### Configuration (settings.json)

```json
{
  "datavault.staging.businessKeySeparator": "^^",
  "datavault.staging.hashDiffSeparator": "||",
  "datavault.staging.nullPlaceholder": "",
  "datavault.staging.autoDetectForeignKeys": true,
  "datavault.staging.fkPattern": "^(.+)_id$"
}
```

---

### Update Staging Flow

```
Staging Model auswählen
         ↓
Änderungen erkennen (neue Spalten in External Table?)
         ↓
Optionen anzeigen:
  [ ] Neue Spalten zu Payload hinzufügen
  [ ] Hash Diff neu generieren
  [ ] FK-Mappings aktualisieren
         ↓
Änderungen anwenden → SQL File + YAML aktualisieren
```

---

### FK Auto-Detection Pattern

```typescript
// Pattern: column_id → hub_column
function detectForeignKey(columnName: string): string | null {
  const match = columnName.match(/^(.+)_id$/i);
  if (match) {
    return `hub_${match[1].toLowerCase()}`;
  }
  return null;
}

// Beispiele:
// country_id    → hub_country
// customer_id   → hub_customer  
// parent_company_id → hub_parent_company
```

---

### File Structure

```
src/
├── commands/
│   └── staging.ts          # createStaging, updateStaging, validateStaging
├── services/
│   ├── stagingGenerator.ts # SQL/Jinja Template Generation
│   ├── stagingValidator.ts # DV-Compliance Validation
│   └── schemaGenerator.ts  # YAML Schema Generation
└── webviewPanel.ts         # Column Picker UI (erweitert)
```

---

### Interfaces

```typescript
interface StagingConfig {
  // Entity
  concept: string;              // 'adventureworks', 'werkportal'
  entityName: string;           // 'customer', 'company'
  
  // Source
  externalTable: string;        // 'ext_adventureworks_customer'
  
  // Business Key
  businessKeyColumns: string[];
  businessKeySeparator: string; // Default: '^^'
  
  // Payload
  payloadColumns: string[];
  hashDiffSeparator: string;    // Default: '||'
  
  // Foreign Keys (auto-detected + manual)
  foreignKeys: ForeignKeyMapping[];
  
  // Metadata
  recordSourceDefault: string;
  includeRunId: boolean;
}

interface ForeignKeyMapping {
  sourceColumn: string;    // 'country_id'
  targetEntity: string;    // 'country'
  targetHub: string;       // 'hub_country'
  autoDetected: boolean;   // true if from pattern match
}

interface StagingUpdateOptions {
  addNewColumns: boolean;
  regenerateHashDiff: boolean;
  updateForeignKeys: boolean;
}
```
