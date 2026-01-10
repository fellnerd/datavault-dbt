# MDS Funktions-Testplan

Umfassender End-to-End Testplan für Master Data Services mit vollständigem Cleanup, CRUD-Operationen für alle Objekttypen, Workflow-Tests (Commit/Deploy), View-Management und UI-Validierung über Playwright-Automatisierung.

## Voraussetzungen

- Azure SQL Datenbank: `sql-datavault-weu-001.database.windows.net`, DB: `Vault`
- Connection ID: `97a571f1-1319-466d-98e4-7b813fe20cda`
- Next.js App läuft auf `http://localhost:3000`
- Playwright Browser verfügbar

---

## Phase 1: Cleanup der MDS-Datenbank

Alle Tabellen in den Schemas `mds_meta`, `mds_stage`, `mds_load`, `mds_audit` komplett löschen (in korrekter Reihenfolge wegen FK-Constraints).

### Schritt 1.1: Audit-Tabellen löschen
```sql
DELETE FROM mds_audit.activity_log;
DELETE FROM mds_audit.change_log;
```

### Schritt 1.2: Load-Tabellen löschen
```sql
DELETE FROM mds_load.master_record;
DELETE FROM mds_load.deployment_log;
```

### Schritt 1.3: Stage-Tabellen löschen
```sql
DELETE FROM mds_stage.validation_result;
DELETE FROM mds_stage.staged_record;
DELETE FROM mds_stage.[commit];
```

### Schritt 1.4: Meta-Tabellen leeren (Reihenfolge beachten!)
```sql
DELETE FROM mds_meta.entity_view;
DELETE FROM mds_meta.validation_rule;
DELETE FROM mds_meta.attribute;
DELETE FROM mds_meta.entity;
DELETE FROM mds_meta.model;
DELETE FROM mds_meta.user_role;
DELETE FROM mds_meta.job;
DELETE FROM mds_meta.configuration;
```

### Schritt 1.5: Sequenzen zurücksetzen (falls verwendet)
dbt bootstrap nutzen und tabellen neu erstellen.
Prüfen ob tabellen wieder hergestellt sind.

### Schritt 1.5: Verifizierung
- Alle Tabellen haben 0 Zeilen
- Dashboard zeigt: Models=0, Entities=0, Records=0

---

## Phase 2: Model CRUD Tests

### Test 2.1: Model erstellen (UI)
**Schritte:**
1. Navigiere zu `/models`
2. Klicke "New Model"
3. Eingabe: Code=`CUSTOMER_MDM`, Name=`Customer Master Data`, Description=`Kundenstammdaten`
4. Klicke "Create"

**Erwartung:**
- Model erscheint in Liste mit Status "draft"
- API GET `/api/models` liefert 1 Model
- DB: `mds_meta.model` hat 1 Eintrag

### Test 2.2: Model bearbeiten (UI)
**Schritte:**
1. Klicke "More" → "Edit" auf CUSTOMER_MDM
2. Ändere Name zu `Kundenstammdaten MDM`
3. Speichern

**Erwartung:**
- Name in Liste aktualisiert
- DB: `updated_at` aktualisiert

### Test 2.3: Model aktivieren (UI)
**Schritte:**
1. Klicke "Activate" Button auf Model-Card

**Erwartung:**
- Status ändert sich von "draft" zu "active"
- Button wechselt zu "Deploy"
- DB: `status = 'active'`

### Test 2.4: Zweites Model erstellen und löschen
**Schritte:**
1. Erstelle Model: Code=`TEST_DELETE`, Name=`Test für Löschen`
2. Klicke "More" → "Delete"
3. Bestätige Löschung

**Erwartung:**
- Model verschwindet aus Liste
- API GET liefert nur noch 1 Model
- DB: Nur CUSTOMER_MDM existiert

### Test 2.5: Model mit Entities löschen (Negativ-Test)
**Schritte:**
1. (Nach Phase 3) Versuche CUSTOMER_MDM zu löschen

**Erwartung:**
- Fehlermeldung: "Cannot delete model with existing entities"
- Model bleibt erhalten

---

## Phase 3: Entity CRUD Tests

### Test 3.1: Entity "Customer" erstellen (UI)
**Schritte:**
1. Navigiere zu `/entities`
2. Klicke "New Entity"
3. Eingabe: Code=`CUSTOMER`, Name=`Kunde`, Model=`CUSTOMER_MDM`, SCD2=aktiviert
4. Klicke "Create"

**Erwartung:**
- Entity erscheint in Tabelle mit Status "draft"
- History-Icon zeigt SCD2 aktiv
- Attributes=0
- DB: `mds_meta.entity` hat 1 Eintrag mit `is_versioned=1`

### Test 3.2: Entity bearbeiten (UI)
**Schritte:**
1. Klicke "Edit" Button
2. Ändere Name zu `Kundenstamm`
3. Speichern

**Erwartung:**
- Name in Tabelle aktualisiert
- DB: `updated_at` aktualisiert

### Test 3.3: Entity Status aktivieren
**Schritte:**
1. API PUT `/api/entities/1` mit `{ "status": "active" }`

**Erwartung:**
- Status-Tag zeigt "active" (grün)
- DB: `status = 'active'`

### Test 3.4: Zweite Entity "Contact" erstellen
**Schritte:**
1. Erstelle Entity: Code=`CONTACT`, Name=`Ansprechpartner`, Model=`CUSTOMER_MDM`

**Erwartung:**
- 2 Entities in Liste
- Filter "CUSTOMER_MDM" zeigt beide

### Test 3.5: Entity ohne Daten löschen
**Schritte:**
1. Erstelle Test-Entity: Code=`TEST_DELETE`
2. Lösche diese Entity

**Erwartung:**
- Entity verschwindet
- Nur CUSTOMER und CONTACT bleiben

### Test 3.6: Entity mit Staged Records löschen (Negativ-Test)
**Schritte:**
1. (Nach Phase 5) Versuche CUSTOMER zu löschen

**Erwartung:**
- Fehlermeldung: "Cannot delete entity with staged records"

---

## Phase 4: Attribute CRUD Tests

### Test 4.1: Business Key Attribut erstellen
**Schritte:**
1. Navigiere zu `/attributes` oder über Entity → "Attributes" Button
2. Klicke "Add Attribute"
3. Eingabe: Entity=`CUSTOMER`, Code=`customer_id`, Name=`Kundennummer`, Type=`string`, Max Length=20, Is Business Key=✓, Is Required=✓

**Erwartung:**
- Attribut erscheint mit Business Key Icon
- Entity zeigt Attributes=1
- DB: `is_business_key=1`, `is_required=1`

### Test 4.2: String Attribut erstellen
**Schritte:**
1. Code=`name`, Name=`Kundenname`, Type=`string`, Max Length=255, Is Required=✓

### Test 4.3: Integer Attribut erstellen
**Schritte:**
1. Code=`employee_count`, Name=`Mitarbeiteranzahl`, Type=`integer`

### Test 4.4: Decimal Attribut erstellen
**Schritte:**
1. Code=`revenue`, Name=`Jahresumsatz`, Type=`decimal`, Precision=18, Scale=2

### Test 4.5: Date Attribut erstellen
**Schritte:**
1. Code=`founded_date`, Name=`Gründungsdatum`, Type=`date`

### Test 4.6: Boolean Attribut erstellen
**Schritte:**
1. Code=`is_active`, Name=`Aktiv`, Type=`boolean`, Default=`true`

### Test 4.7: Reference Attribut erstellen
**Schritte:**
1. Entity=`CONTACT`, Code=`customer_id`, Name=`Kunde`, Type=`reference`, Reference Entity=`CUSTOMER`

**Erwartung:**
- Attribut zeigt Reference-Icon
- DB: `reference_entity_id = <CUSTOMER entity id>`

### Test 4.8: Attribut bearbeiten
**Schritte:**
1. Bearbeite `name` Attribut
2. Setze `is_unique = true`

**Erwartung:**
- Unique-Icon erscheint
- DB: `is_unique=1`

### Test 4.9: Unbenutzes Attribut löschen
**Schritte:**
1. Erstelle Test-Attribut: Code=`test_delete`
2. Lösche es

**Erwartung:**
- Attribut verschwindet
- 6 CUSTOMER Attribute bleiben

### Test 4.10: Attribut mit Daten löschen (Negativ-Test)
**Schritte:**
1. (Nach Phase 5) Versuche `customer_id` zu löschen

**Erwartung:**
- Fehlermeldung oder Warnung

---

## Phase 5: Data Entry Tests

### Test 5.1: Record erstellen (INSERT)
**Schritte:**
1. Navigiere zu `/data`
2. Wähle Entity `Kunde`
3. Klicke "Add Record"
4. Eingabe:
   - customer_id: `K001`
   - name: `Mustermann GmbH`
   - employee_count: `50`
   - revenue: `5000000.00`
   - founded_date: `2010-01-15`
   - is_active: `true`
5. Speichern

**Erwartung:**
- Record erscheint in Liste mit Status "pending"
- Validation Status = "valid"
- DB: `mds_stage.staged_record` hat 1 Eintrag mit `operation='INSERT'`

### Test 5.2: Zweiten Record erstellen
**Schritte:**
1. Erstelle Record: customer_id=`K002`, name=`Beispiel AG`, employee_count=`200`

### Test 5.3: Record bearbeiten (UPDATE)
**Schritte:**
1. Klicke auf Record K001
2. Ändere employee_count zu `55`
3. Speichern

**Erwartung:**
- Record zeigt "Modified" Indikator
- DB: `previous_data` enthält alten Wert

### Test 5.4: Validierung - Required Feld leer (Negativ-Test)
**Schritte:**
1. Erstelle Record ohne `name` (Required Feld)

**Erwartung:**
- Validation Status = "invalid"
- Fehlermeldung: "name is required"
- Record kann nicht committed werden

### Test 5.5: Validierung - Unique Verletzung (Negativ-Test)
**Schritte:**
1. Erstelle Record mit customer_id=`K001` (bereits vorhanden)

**Erwartung:**
- Validation Status = "invalid"
- Fehlermeldung: "Duplicate business key"

### Test 5.6: Record löschen
**Schritte:**
1. Erstelle Test-Record: customer_id=`K999`
2. Lösche diesen Record

**Erwartung:**
- Record verschwindet aus Liste
- DB: `staged_record` gelöscht oder `operation='DELETE'`

---

## Phase 6: Commit Workflow Tests

### Test 6.1: Commit erstellen
**Schritte:**
1. Navigiere zu `/commits` oder `/data`
2. Wähle Records K001 und K002 aus
3. Klicke "Commit Selected"
4. Eingabe Commit-Nachricht: "Initiale Kundendaten"
5. Bestätigen

**Erwartung:**
- Commit erscheint in Liste mit Status "pending"
- Record Count = 2
- DB: `mds_stage.commit` hat 1 Eintrag
- Staged Records haben `commit_id` gesetzt

### Test 6.2: Commit genehmigen (Approve)
**Schritte:**
1. Navigiere zu `/commits`
2. Finde Commit mit Status "pending"
3. Klicke "Approve"

**Erwartung:**
- Status ändert sich zu "approved"
- approved_at und approved_by gesetzt
- DB: `status = 'approved'`

### Test 6.3: Neuen Commit ablehnen (Reject)
**Schritte:**
1. Erstelle neuen Record K003
2. Erstelle Commit
3. Klicke "Reject"
4. Eingabe Grund: "Unvollständige Daten"

**Erwartung:**
- Status = "rejected"
- Rejection Reason angezeigt
- DB: `rejected_at`, `rejected_by`, `rejection_reason` gesetzt

### Test 6.4: Re-Commit nach Ablehnung
**Schritte:**
1. Bearbeite Record K003 (ergänze fehlende Daten)
2. Erstelle neuen Commit

**Erwartung:**
- Neuer Commit mit Status "pending"
- Alter rejected Commit bleibt in Historie

### Test 6.5: Leerer Commit (Negativ-Test)
**Schritte:**
1. Versuche Commit ohne ausgewählte Records

**Erwartung:**
- Fehlermeldung: "No records selected"
- Commit Button disabled

---

## Phase 7: Deploy Workflow Tests

### Test 7.1: Single Commit deployen
**Schritte:**
1. Navigiere zu `/deploy`
2. Wähle approved Commit aus
3. Klicke "Deploy Selected"
4. Bestätige

**Erwartung:**
- Progress Bar zeigt Fortschritt
- Nach Abschluss: Commit Status = "deployed"
- DB: Records in `mds_load.master_record` eingefügt
- DB: `mds_load.deployment_log` Eintrag erstellt

### Test 7.2: Deployment Logs prüfen
**Schritte:**
1. Prüfe Deployment Details

**Erwartung:**
- Timestamp korrekt
- Record Count stimmt
- Deployed By korrekt

### Test 7.3: Deploy ohne approved Commits (Negativ-Test)
**Schritte:**
1. Mit leerem approved Queue, klicke Deploy

**Erwartung:**
- "No approved commits to deploy" Meldung
- Deploy Button disabled

### Test 7.4: Master Records verifizieren
**Schritte:**
1. SQL Query: `SELECT * FROM mds_load.master_record WHERE entity_id = <CUSTOMER id>`

**Erwartung:**
- 2 Records (K001, K002)
- `is_current = 1`
- `valid_from` gesetzt, `valid_to = NULL`
- `data` enthält JSON mit allen Attributen

---

## Phase 8: View CRUD Tests

### Test 8.1: SCD1 View erstellen
**Schritte:**
1. Navigiere zu `/views`
2. Klicke "View erstellen"
3. Eingabe: Entity=`CUSTOMER`, Code=`v_customer_current`, Type=`SCD1`, Is Default=✓
4. Speichern

**Erwartung:**
- View erscheint in Liste
- Type-Badge zeigt "SCD1"
- Status = "pending" (not deployed)

### Test 8.2: SCD2 View erstellen
**Schritte:**
1. Erstelle View: Code=`v_customer_history`, Type=`SCD2`

**Erwartung:**
- View in Liste
- Type-Badge zeigt "SCD2"

### Test 8.3: Custom SQL View erstellen
**Schritte:**
1. Erstelle View: Code=`v_customer_active`, Type=`Custom`
2. SQL: `SELECT * FROM mds_load.master_record WHERE entity_id = @entity_id AND is_current = 1 AND JSON_VALUE(data, '$.is_active') = 'true'`

### Test 8.4: View deployen
**Schritte:**
1. Wähle `v_customer_current` aus
2. Klicke "Deploy"

**Erwartung:**
- View Status = "deployed"
- DB: View `mds_view.v_customer_current` existiert

### Test 8.5: View in Datenbank verifizieren
**Schritte:**
1. SQL: `SELECT * FROM mds_view.v_customer_current`

**Erwartung:**
- Query liefert 2 Kunden-Records
- Spalten entsprechen Attributen

### Test 8.6: View bearbeiten
**Schritte:**
1. Bearbeite Custom View SQL
2. Re-Deploy

**Erwartung:**
- View in DB aktualisiert

### Test 8.7: View löschen
**Schritte:**
1. Lösche `v_customer_history`

**Erwartung:**
- View verschwindet aus Liste
- DB View gelöscht (falls deployed)

---

## Phase 9: Datenbank-Verifizierung

### Test 9.1: Tabellen-Zählung
```sql
SELECT 'model' as tbl, COUNT(*) as cnt FROM mds_meta.model
UNION ALL SELECT 'entity', COUNT(*) FROM mds_meta.entity
UNION ALL SELECT 'attribute', COUNT(*) FROM mds_meta.attribute
UNION ALL SELECT 'entity_view', COUNT(*) FROM mds_meta.entity_view
UNION ALL SELECT 'commit', COUNT(*) FROM mds_stage.[commit]
UNION ALL SELECT 'staged_record', COUNT(*) FROM mds_stage.staged_record
UNION ALL SELECT 'master_record', COUNT(*) FROM mds_load.master_record
```

**Erwartung:**
- model: 1
- entity: 2 (CUSTOMER, CONTACT)
- attribute: ~7-8
- entity_view: 2-3
- commit: ~3
- staged_record: ~3
- master_record: 2

### Test 9.2: Audit Log prüfen
```sql
SELECT * FROM mds_audit.change_log ORDER BY created_at DESC
```

**Erwartung:**
- Einträge für Model/Entity/Attribute Erstellung
- Einträge für Record Änderungen

### Test 9.3: FK Constraints testen
```sql
-- Sollte fehlschlagen:
INSERT INTO mds_meta.entity (model_id, code, name) VALUES (9999, 'TEST', 'Test')
```

**Erwartung:**
- Foreign Key Violation Error

---

## Phase 10: UI Volltest

### Test 10.1: Dashboard
**Prüfpunkte:**
- [ ] KPI Cards laden (Models, Entities, Records, Commits, Validation, Jobs)
- [ ] Zahlen korrekt
- [ ] Recent Activity zeigt letzte Aktionen
- [ ] Quick Actions funktionieren
- [ ] System Status: Database = Connected
- [ ] Navigation zu allen Seiten funktioniert

### Test 10.2: Models Seite
**Prüfpunkte:**
- [ ] Model Cards angezeigt
- [ ] Status Tag korrekt (active/draft)
- [ ] "More" Popover öffnet mit Edit, Duplicate, Export, Delete
- [ ] "Entities" Button navigiert zu `/entities?model_id=X`
- [ ] "Data" Button navigiert zu `/data?model_id=X`
- [ ] "Activate/Deploy" Button funktioniert
- [ ] "New Model" Dialog öffnet und funktioniert

### Test 10.3: Entities Seite
**Prüfpunkte:**
- [ ] Tabelle mit allen Entities
- [ ] Model Filter Dropdown funktioniert
- [ ] Status Tag korrekt (active/draft)
- [ ] History Icon zeigt SCD2 Status
- [ ] Attributes Count korrekt
- [ ] Edit Button zeigt Alert/Dialog
- [ ] Attributes Button navigiert zu `/attributes?entity_id=X`
- [ ] Data Button navigiert zu `/data?entity_id=X`
- [ ] "New Entity" Dialog funktioniert

### Test 10.4: Attributes Seite
**Prüfpunkte:**
- [ ] Alle Attribute aufgelistet
- [ ] Entity Filter funktioniert
- [ ] Type Filter funktioniert
- [ ] Business Key Icon angezeigt
- [ ] Reference Icon angezeigt
- [ ] Required Badge angezeigt
- [ ] "Add Attribute" Dialog funktioniert
- [ ] Delete funktioniert

### Test 10.5: Data Entry Seite
**Prüfpunkte:**
- [ ] Entity Dropdown funktioniert
- [ ] Status Filter funktioniert
- [ ] Records Tabelle mit allen Spalten
- [ ] Validation Status angezeigt
- [ ] "Add Record" Dialog mit dynamischen Feldern
- [ ] Inline Edit funktioniert
- [ ] Checkbox Selection funktioniert
- [ ] "Commit Selected" Button funktioniert
- [ ] Export Button funktioniert

### Test 10.6: Commits Seite
**Prüfpunkte:**
- [ ] Tabs: Pending, Approved, Deployed, Rejected
- [ ] Commit List mit Details
- [ ] Record Count angezeigt
- [ ] Approve Button funktioniert
- [ ] Reject Button mit Grund-Eingabe
- [ ] Commit Details expandierbar

### Test 10.7: Deploy Seite
**Prüfpunkte:**
- [ ] KPIs: Pending, Deploying, Completed, Failed
- [ ] Approved Commits Queue
- [ ] Checkbox Selection
- [ ] Deploy Button funktioniert
- [ ] Progress angezeigt
- [ ] Recent Deployments Liste

### Test 10.8: Views Seite
**Prüfpunkte:**
- [ ] KPIs: Views gesamt, Deployed, Pending, Entities
- [ ] Entity Filter funktioniert
- [ ] View Cards/Liste
- [ ] Type Badge (SCD1/SCD2/Custom)
- [ ] Deploy Status angezeigt
- [ ] "View erstellen" Dialog funktioniert
- [ ] Deploy Button funktioniert

### Test 10.9: Validation Seite
**Prüfpunkte:**
- [ ] DQ Score angezeigt
- [ ] Validation Rules Liste
- [ ] Run Validation Button
- [ ] Validation Results angezeigt

### Test 10.10: History Seite
**Prüfpunkte:**
- [ ] Änderungsverlauf angezeigt
- [ ] Filter funktionieren
- [ ] Details expandierbar

### Test 10.11: Jobs Seite
**Prüfpunkte:**
- [ ] Job Queue angezeigt
- [ ] Status (queued/running/completed/failed)
- [ ] Progress Bar bei running
- [ ] Cancel Button funktioniert
- [ ] Logs anzeigbar

### Test 10.12: Settings - Users
**Prüfpunkte:**
- [ ] User Liste angezeigt
- [ ] Role Dropdown funktioniert
- [ ] Add User funktioniert
- [ ] Delete User funktioniert

### Test 10.13: Settings - Configuration
**Prüfpunkte:**
- [ ] System Settings angezeigt
- [ ] Save funktioniert

---

## Zusammenfassung Testmatrix

| Phase | Test | Status |
|-------|------|--------|
| 1 | Cleanup | ⬜ |
| 2.1 | Model erstellen | ⬜ |
| 2.2 | Model bearbeiten | ⬜ |
| 2.3 | Model aktivieren | ⬜ |
| 2.4 | Model löschen | ⬜ |
| 2.5 | Model mit Entities löschen (neg) | ⬜ |
| 3.1 | Entity erstellen | ⬜ |
| 3.2 | Entity bearbeiten | ⬜ |
| 3.3 | Entity aktivieren | ⬜ |
| 3.4 | Zweite Entity | ⬜ |
| 3.5 | Entity löschen | ⬜ |
| 3.6 | Entity mit Daten löschen (neg) | ⬜ |
| 4.1-4.7 | Attribute erstellen (7 Typen) | ⬜ |
| 4.8 | Attribute bearbeiten | ⬜ |
| 4.9 | Attribute löschen | ⬜ |
| 4.10 | Attribute mit Daten löschen (neg) | ⬜ |
| 5.1 | Record erstellen (INSERT) | ⬜ |
| 5.2 | Zweiter Record | ⬜ |
| 5.3 | Record bearbeiten (UPDATE) | ⬜ |
| 5.4 | Validation Required (neg) | ⬜ |
| 5.5 | Validation Unique (neg) | ⬜ |
| 5.6 | Record löschen | ⬜ |
| 6.1 | Commit erstellen | ⬜ |
| 6.2 | Commit genehmigen | ⬜ |
| 6.3 | Commit ablehnen | ⬜ |
| 6.4 | Re-Commit | ⬜ |
| 6.5 | Leerer Commit (neg) | ⬜ |
| 7.1 | Single Deploy | ⬜ |
| 7.2 | Deployment Logs | ⬜ |
| 7.3 | Deploy ohne Commits (neg) | ⬜ |
| 7.4 | Master Records verifizieren | ⬜ |
| 8.1 | SCD1 View erstellen | ⬜ |
| 8.2 | SCD2 View erstellen | ⬜ |
| 8.3 | Custom View erstellen | ⬜ |
| 8.4 | View deployen | ⬜ |
| 8.5 | View in DB verifizieren | ⬜ |
| 8.6 | View bearbeiten | ⬜ |
| 8.7 | View löschen | ⬜ |
| 9.1 | Tabellen-Zählung | ⬜ |
| 9.2 | Audit Log | ⬜ |
| 9.3 | FK Constraints | ⬜ |
| 10.1-10.13 | UI Volltest (13 Seiten) | ⬜ |

**Gesamt: 50+ Testfälle**
