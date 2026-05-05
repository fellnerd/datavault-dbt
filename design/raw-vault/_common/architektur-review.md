# DV2.1 Architektur-Review — Implementierungsplan

**Datum:** 14. März 2026  
**Reviewer:** vault-architect  
**Geprüftes Dokument:** `design/raw-vault/_common/implementierungsplan.md`  
**Referenz-Pattern:** `models/raw_vault/adworks/` (Hubs, Sats, Links)  
**Regelwerk:** `docs/DEVELOPER.md` (DV2.1 Konzept)

---

## Gesamtbewertung

| Kategorie | Bewertung | Findings |
|---|---|---|
| Hubs | 🟢 Gut | 2 Findings (1 kritisch, 1 Hinweis) |
| Satellites | 🟡 Nacharbeit | 4 Findings (1 kritisch, 3 Hinweise) |
| Links | 🟡 Nacharbeit | 3 Findings (1 kritisch, 1 major, 1 Hinweis) |
| Reference Tables | 🟢 Gut | 2 Findings (beide Hinweise) |
| Hash-Konventionen | 🔴 Kritisch | 1 Finding (Namenskonvention) |
| **Gesamt** | **🟡 Umsetzbar mit Korrekturen** | **12 Findings** |

---

## 1. HUBS (11 geplant: 9 regulär + 2 Ghost)

### 1.1 Business Keys — Bewertung

| Hub | Business Key | Stabil? | Unveränderlich? | Bewertung |
|---|---|---|---|---|
| `hub_buchungskopf` | `RECNUM` | ✅ | ✅ System-ID | ✅ OK |
| `hub_hauptbuch` | `DKBELEGNUMMER\|\|KTO` | ✅ | ✅ Composite | ✅ OK — Datenvalidiert (29% multi-KTO) |
| `hub_kreditorenbeleg` | `BELEGNR` | ✅ | ✅ | ✅ OK |
| `hub_zahlung` | `BELEGNR\|\|ZAHLNR` | ✅ | ✅ Composite | ✅ OK |
| `hub_kreditor` | `LIEFNR` | ✅ | ✅ | ✅ OK |
| `hub_adresse` | `INR` | ✅ | ✅ | ✅ OK |
| `hub_projekt` | `PROJNR` | ✅ | ✅ | ✅ OK |
| `hub_zeiterfassung` | `EMPLNR\|\|PROJDAT` | ✅ | ✅ Composite | ✅ OK — 1 Eintrag pro MA/Tag |
| `hub_projektsachkonto` | `PROJNR\|\|CODE\|\|PERIYEAR\|\|PERIMONTH\|\|GB` | ✅ | ✅ 5-teilig | ✅ OK — Granularität korrekt |
| `hub_person` | `EMPL_NR` | ✅ | ✅ | ✅ OK |
| `hub_konto` (Ghost) | `KONTNR` aus GL | ✅ | ✅ | ✅ OK |
| `hub_kostenstelle` (Ghost) | `KOSTNR` aus GL | ✅ | ✅ | ✅ OK |

**Composite Keys:**
- ✅ GL: `DKBELEGNUMMER||KTO` — **Datenanalytisch bestätigt** (Beleg 204188 → 22 Zeilen auf 5 Konten)
- ✅ KVL: `BELEGNR||ZAHLNR` — Korrekt, da mehrere Zahlungen pro Beleg
- ✅ NSA: 5-teilig — Semantisch korrekt als Projektsachkonto pro Periode

### Finding H-1 ✅ GELÖST — Hash-Key-Naming auf entity-basiert umgestellt

**Status (15.3.2026):** Entscheidung **entity-basiert** getroffen und umgesetzt. Alle Hash Keys folgen nun dem Pattern `hk_<hub_name>`:
```
hub_buchungskopf    → hk_buchungskopf
hub_hauptbuch       → hk_hauptbuch
hub_projekt         → hk_projekt
hub_person          → hk_person
hub_adresse         → hk_adresse
hub_kreditor        → hk_kreditor
hub_kreditorenbeleg → hk_kreditorenbeleg
hub_zahlung         → hk_zahlung
hub_zeiterfassung   → hk_zeiterfassung
hub_projektsachkonto→ hk_projektsachkonto
```

Alle betroffenen Dateien aktualisiert: Implementierungsplan, ER-Diagram, Staging-Views, sources.yml, CLAUDE.md, copilot-instructions.md, Skills.

### Finding H-2 ℹ️ HINWEIS — Ghost-Hub-Terminologie

**Beobachtung:** `hub_konto` und `hub_kostenstelle` werden als "Ghost-Hubs" bezeichnet, aber gleichzeitig sollen Sharepoint-Reference-Tables (`ref_konto`, `ref_kostenstelle`) als Stammdaten importiert werden.

Wenn Sharepoint-Daten als Reference Tables importiert werden, sind die Hubs keine Ghost-Hubs mehr — sie haben dann eine echte Stammdatenquelle. Die Terminologie sollte angepasst werden:
- **Option A:** Echte Hubs mit `sat_konto`/`sat_kostenstelle` aus Sharepoint-Ref-Tables (bevorzugt)
- **Option B:** Ghost-Hubs bleiben, Sharepoint-Daten nur als Mart-Level-Lookup

**Empfehlung:** Option A — reguläre Hubs mit Sharepoint als `dss_record_source = 'ewb_sharepoint'`.

---

## 2. SATELLITES (12 geplant)

### 2.1 Satellite-Schnitt — Bewertung

| Satellite | Hub | Quelle | Bewertung |
|---|---|---|---|
| `sat_buchungskopf` | `hub_buchungskopf` | FHE | 🟡 Payload unvollständig? |
| `sat_hauptbuch` | `hub_hauptbuch` | GL | ✅ OK |
| `sat_kreditorenbeleg` | `hub_kreditorenbeleg` | KBL | ✅ OK |
| `sat_zahlung` | `hub_zahlung` | KVL | ✅ OK |
| `sat_kreditor` | `hub_kreditor` | KBS | ✅ OK |
| `sat_projekt` | `hub_projekt` | NPO | ✅ OK |
| `sat_projekt_status` | `hub_projekt` | PST | 🔴 Widerspruch zu ref_projektstatus |
| `sat_zeiterfassung` | `hub_zeiterfassung` | NTC | ✅ OK |
| `sat_projektsachkonto` | `hub_projektsachkonto` | NSA | ✅ OK |
| `sat_person` | `hub_person` | LEN | ✅ OK |
| `sat_person_adresse` | `hub_adresse` | ADR | ✅ OK |
| `sat_projektteil` | `hub_projekt` | PRT | 🟡 Architektur-Frage |

### Finding S-1 🔴 KRITISCH — PST: Doppelnutzung als Satellite UND Reference Table

**Problem:** `PROJ.PST` wird im Plan gleichzeitig genutzt für:
1. `sat_projekt_status` (Satellite auf `hub_projekt`) — Zeile 90
2. `ref_projektstatus` (Reference Table mit 7 Einträgen) — Zeile 278

Das ist widersprüchlich. PST hat nur **7 Statuswerte** (z.B. "Aktiv", "zum Fakturieren"). Es kann nicht beides sein.

**Analyse der Optionen:**

| Frage | Antwort | Konsequenz |
|---|---|---|
| Sind die 7 Werte stabil? | Ja → Lookup | → `ref_projektstatus` (korrekt) |
| Ändert sich der Status eines Projekts über Zeit? | Ja → Historisierung nötig | → Aber das ist `NPO.STATUSNR` auf `sat_projekt`, NICHT ein separater Sat |
| Hat PST eigene zeitliche Dimension? | Nein, reine Code-Tabelle | → Kein Satellite nötig |

**Empfehlung:** 
- ✅ `ref_projektstatus` beibehalten (7 stabile Codes als Lookup)
- ❌ `sat_projekt_status` **streichen** — der aktuelle Status eines Projekts wird über `NPO.STATUSNR` in `sat_projekt` erfasst
- Falls PST tatsächlich Projekt-Status-Historie enthält (Projekt X hatte Status A am Datum D1, dann Status B am Datum D2), dann IST es ein Satellite, aber dann ist es KEINE Reference Table

**Klärungsbedarf:** Was genau steht in PST — eine Code-Tabelle (7 Zeilen) oder eine Historientabelle (N Zeilen mit Projekt+Status+Datum)?

### Finding S-2 ℹ️ HINWEIS — sat_buchungskopf: Payload-Vollständigkeit prüfen

**Beobachtung:** Der Plan listet 5 Payload-Attribute für `sat_buchungskopf`:
```
PLAN, LEVEL, VARIANTE, TYP, REF_ID
```

Die Staging-View `ewb_fibu_fhe_main` hat aber **57 Payload-Attribute** (PLAN, MANDANT, BUTYP, BEZ, KTO, GKTO, BETRAG, SH, MWSTCODE, MWSTBETR, etc.). 

**Frage:** Wo gehen die restlichen ~52 Attribute hin?

**Mögliche Erklärungen:**
- (a) Der Plan listet nur die Haupt-Attribute exemplarisch → **unvollständig dokumentiert**
- (b) Es soll Split-Satellites geben (wie `sat_produkt` + `sat_produkt_preis` im Adworks) → **fehlt im Plan**
- (c) Viele FHE-Spalten gehören eigentlich zu GL (da FHE = Header, GL = Detail) → **Architektur-Klärung nötig**

**Empfehlung:** Payload-Liste für jeden Satellite vollständig auflisten. Bei >20 Attributen Split-Satellites nach Änderungsfrequenz erwägen:
- `sat_buchungskopf` — Stammdaten (PLAN, LEVEL, VARIANTE, TYP, BEZ)
- `sat_buchungskopf_detail` — Buchungsdaten (KTO, GKTO, BETRAG, SH, MWST, etc.)

### Finding S-3 ℹ️ HINWEIS — Audit-Spalten (CREUSER/MUTUSER/MUTDAT)

**Beobachtung:** Abacus-Tabellen enthalten typischerweise Audit-Spalten:
- `CREUSER` / `MUTUSER` — Ersteller/Änderer
- `CREDAT` / `MUTDAT` — Erstell-/Änderungsdatum
- `USER_F` — ähnliches Feld in NTC

Der Plan erwähnt `USER_F` explizit für `sat_zeiterfassung`, aber es gibt keine generelle Strategie für Audit-Spalten.

**DV2.1 Best Practice:** Audit-Spalten aus dem Quellsystem gehören in den Haupt-Satellite als Teil des Payloads. Ein separater Audit-Satellite ist nur sinnvoll, wenn sich Audit-Spalten unabhängig vom Business-Payload ändern (was bei Abacus unwahrscheinlich ist).

**Empfehlung:** Audit-Spalten (CREUSER, MUTUSER, MUTDAT, USER_F) im jeweiligen Haupt-Satellite einschliessen, kein separater Audit-Satellite nötig.

### Finding S-4 ℹ️ HINWEIS — Keine MA-Satellites und keine DC-Satellites identifiziert

**Beobachtung:** Der Plan enthält weder Multi-Active noch Dependent Child Satellites.

**MA-Satellite-Prüfung:**
- LTC wurde korrekt als nicht-MA erkannt (109 Gruppen ≠ gleichzeitig gültige Werte pro Entity)
- Kein Abacus-Feld zeigt ein "mehrere gleichzeitige Werte pro Entity"-Muster
- ✅ **Kein MA-Satellite nötig** — korrekte Entscheidung

**DC-Satellite-Prüfung:**
- Das Adworks-Pattern (`sat_verkauf_detail_dc` auf `link_verkauf_detail`) zeigt DC-Satellites auf Links
- Im EWB-Plan gibt es keine Entity ohne eigenen BK, die auf einem Link sitzt
- `sat_projektteil` auf `hub_projekt` ist KEIN DC-Satellite (PRT hat PROJNR als FK, nicht als DCK)
- ✅ **Kein DC-Satellite nötig** — korrekte Entscheidung

---

## 3. LINKS (11 geplant)

### 3.1 Link-Bewertung

| Link | Hub 1 | Hub 2 | Quelle | Bewertung |
|---|---|---|---|---|
| `link_buchungskopf_kreditorenbeleg` | buchungskopf | kreditorenbeleg | FHE | ✅ OK |
| `link_hauptbuch_buchungskopf` | hauptbuch | buchungskopf | GL | ✅ OK |
| `link_hauptbuch_projekt` | hauptbuch | projekt | GL | ✅ OK |
| `link_hauptbuch_kreditor` | hauptbuch | kreditor | GL | ✅ OK |
| `link_hauptbuch_konto` | hauptbuch | konto | GL | ✅ OK |
| `link_hauptbuch_kostenstelle` | hauptbuch | kostenstelle | GL | ✅ OK |
| `link_kreditorenbeleg_kreditor` | kreditorenbeleg | kreditor | KBL | ✅ OK |
| `link_kreditorenbeleg_zahlung` | kreditorenbeleg | zahlung | KVL | ✅ OK |
| `link_projektsachkonto_projekt` | projektsachkonto | projekt | NSA | ✅ OK |
| `link_zeiterfassung_person` | zeiterfassung | person | NTC | ✅ OK |
| `link_projektteil_projekt` | projekt | projekt (?) | PRT | 🔴 Architektur-Problem |

### Finding L-1 🔴 KRITISCH — link_projektteil_projekt: Architektonisch widersprüchlich

**Problem:** Der Plan definiert:
- `sat_projektteil` auf `hub_projekt` (Satellite mit Status STAT1/STAT2)
- `link_projektteil_projekt` mit `hub_projekt (PRT.PROJNR → NPO.PROJNR)` (Link)

Das ist ein **Widerspruch**: 

1. Der Link verbindet nur **einen** Hub (`hub_projekt`). Ein Standard-Link braucht mindestens 2 Hubs.
2. Wenn `sat_projektteil` bereits auf `hub_projekt` sitzt, drückt der Satellite bereits die Zugehörigkeit zum Projekt aus. Der Link ist **redundant**.
3. Falls PRT ein eigenständiges Konzept ist (z.B. ein Sub-Projekt / Arbeitspaket mit eigener Identität), bräuchte es einen `hub_projektteil` — aber dann gehört `sat_projektteil` auf diesen Hub, nicht auf `hub_projekt`.

**Analyse der PRT-Semantik:**

| Szenario | PRT ist... | Hub | Satellite | Link |
|---|---|---|---|---|
| A — Status-Tracking | Statusänderungen pro Projekt | `hub_projekt` | `sat_projektteil` ✅ | ❌ Kein Link nötig |
| B — Eigenständige Entity | Sub-Projekte/Teilprojekte | `hub_projektteil` (NEU) | `sat_projektteil` auf hub_projektteil | `link_projektteil_projekt` ✅ |
| C — Self-Ref Link | Hierarchie (Projekt → Übergeordnet) | `hub_projekt` | — | `link_projekt_hierarchie` (self-ref) |

**Empfehlung:**
- Wenn **Szenario A** → `link_projektteil_projekt` streichen, `sat_projektteil` auf `hub_projekt` reicht
- Wenn **Szenario B** → `hub_projektteil` einführen mit eigenem BK (z.B. `RECNUM` aus PRT)
- Wenn **Szenario C** → Link umbenennen und als Self-Referencing Link implementieren

**Klärungsbedarf:** Was ist die PRT-Granularität? Hat jedes Projekt mehrere PRT-Einträge (Teile/Phasen) oder nur einen Status-Eintrag?

### Finding L-2 🟠 MAJOR — Fehlender Link: hub_person ↔ hub_adresse

**Problem:** Die Mart-View `Projekt.Personal` (v_personal) jointet:
```sql
FROM [PUBL].[ADR] T1
LEFT OUTER JOIN ... [LOHN].[LEN] T2 
ON T1.[LOHNNR] = T2.[EMPL_NR]
```

Das zeigt eine **natürliche FK-Beziehung**: `ADR.LOHNNR → LEN.EMPL_NR`. Im Data Vault muss diese Beziehung als Link abgebildet werden.

**Aktuell im Plan:**
- `hub_person` (BK: `EMPL_NR` aus LEN) ✅
- `hub_adresse` (BK: `INR` aus ADR) ✅
- `sat_person_adresse` auf `hub_adresse` (Payload: Name, Vorname, etc.) ✅
- **Kein `link_person_adresse`** ❌

**Ohne diesen Link** kann die Mart-View `v_personal` nicht aus dem Vault abgeleitet werden, da die Verknüpfung zwischen Person und Adresse fehlt.

**Empfehlung:** `link_person_adresse` hinzufügen:
```
link_person_adresse:
  Hub 1: hub_person (hk_person)
  Hub 2: hub_adresse (hk_adresse)
  Quelle: ewb_publ_adr_main (ADR.LOHNNR → LEN.EMPL_NR)
  Priorität: P1 (benötigt für Mart v_personal)
```

**Hinweis:** Die FK-Richtung ist ADR → LEN (ADR enthält `LOHNNR`). Der Link wird aus der ADR-Staging-View befüllt, da dort beide Schlüssel (INR + LOHNNR) vorhanden sind.

### Finding L-3 ℹ️ HINWEIS — Link-Benennung konsistent

Die Link-Benennung folgt dem Pattern `link_<entity1>_<entity2>`, was konsistent mit dem Adworks-Pattern ist (`link_verkauf_kunde`, `link_kunde_adresse`). Allerdings werden die EWB-Links alphabetisch geordnet (`link_hauptbuch_buchungskopf`), während Adworks nach Beziehungsrichtung ordnet (`link_verkauf_kunde` = Verkauf hat Kunde).

**Empfehlung:** Konsistente Konvention wählen — alphabetisch oder nach FK-Richtung (Parent → Child).

---

## 4. REFERENCE TABLES (3 geplant)

### 4.1 Bewertung

| Reference Table | Quelle | Zeilen | Stabil? | Bewertung |
|---|---|---|---|---|
| `ref_leistungsart` | NTR | 29 | ✅ Ja | ✅ **Korrekt** — klassischer Lookup |
| `ref_projektstatus` | PST | 7 | ✅ Ja | ✅ **Korrekt** — aber → Finding S-1 |
| `ref_abteilung` | LTC | 2.132 | 🟡 Teils | 🟡 **Grenzfall** |

### Finding R-1 ℹ️ HINWEIS — ref_abteilung: Grenzfall bei 2.132 Einträgen

**Analyse:**
- 2.132 Zeilen ist ungewöhnlich gross für eine Reference Table (typisch: <100 Einträge)
- LTC enthält 109 Gruppen mit `GROUP=1` als Abteilungsfilter (→ ca. 2.027 Abteilungen)
- Mart-View `v_abteilung` filtert `GROUP=1` und verwendet DISTINCT

**Prüfkriterien:**

| Kriterium | Bewertung |
|---|---|
| Änderungsfrequenz? | Niedrig — Abteilungen ändern sich selten |
| Historisierungsbedarf? | Fraglich — werden Abteilungen umbenannt/zusammengelegt? |
| Lookup-Charakter? | Ja — wird nur als JOIN-Quelle in Mart verwendet |

**Empfehlung:** Ref Table ist akzeptabel, **WENN:**
- Keine Historisierung der Abteilungsänderungen nötig ist
- Die 2.132 Einträge über die Zeit stabil bleiben

Falls Abteilungen historisiert werden müssen (z.B. "Abteilung X wurde in Y umbenannt am Datum Z"), dann ist ein `hub_abteilung` + `sat_abteilung` die bessere Wahl.

### Finding R-2 ℹ️ HINWEIS — NTR-zu-NSA-Verknüpfung: Nur 70% Match

**Beobachtung:** `NSA.CODE → NTR.RECNUM` hat nur 70% Match (273 von 388 Codes). Das bedeutet, 30% der NSA-Codes haben keine Entsprechung in NTR.

**Risiko:** Die Mart-View `v_stunden` könnte für 30% der Zeilen keine Leistungsart auflösen können.

**Empfehlung:** Im Mart-View `v_stunden` LEFT JOIN verwenden (nicht INNER JOIN) und NULL-Leistungsarten als "Unbekannt" kennzeichnen.

---

## 5. HASH-KONVENTIONEN

### Finding HC-1 🔴 KRITISCH — Naming-Konvention muss vor Implementierung festgelegt werden

**Zusammenfassung der Hash-Naming-Inkonsistenz:**

| Aspekt | Adworks-Pattern | EWB-Plan | Empfehlung |
|---|---|---|---|
| Hub Hash Key | `hk_<entity>` | `hk_ewb_<modul>_<tabelle>` | `hk_<entity>` |
| Hub Hash Diff | `hd_<entity>` | `hd_ewb_<modul>_<tabelle>` | `hd_<entity>` |
| Link Hash Key | `hk_link_<e1>_<e2>` | nicht explizit definiert | `hk_link_<e1>_<e2>` |
| Separator | `^^` (in automate_dv) | `\|\|` (in Doku-Notation) | `^^` (automate_dv Standard) |

**Status quo:** Die einzige existierende Staging-View (`ewb_fibu_fhe_main`) verwendet `hk_ewb_fibu_fhe`. Wenn die Entscheidung für entity-basierte Benennung fällt, muss diese eine Staging-View vor Wave 1 angepasst werden.

**Separator `||` vs. `^^`:** Der Plan verwendet `||` in der Notation (`BELEGNR||ZAHLNR`). Dies ist Dokumentations-Notation, kein technischer Separator. automate_dv nutzt intern `^^` als Concat-Separator (konfiguriert als `hash: 'SHA'` in `dbt_project.yml`). **Kein technisches Problem**, aber die Doku sollte explizit auf `^^` als tatsächlichen Separator hinweisen.

**Hash Diff Vollständigkeit:** Nicht prüfbar, da noch keine Staging-Views für die meisten Tabellen existieren. **Empfehlung:** Bei jedem Staging-View-Build die Hash-Diff-Spalten gegen den Satellite-Payload abgleichen. Jede Payload-Spalte MUSS im Hash Diff enthalten sein.

---

## 6. WEITERE ÜBERGREIFENDE FINDINGS

### Finding G-1 ℹ️ — Entity-Designer JSON fehlt für EWB

**Beobachtung:** Im `.vscode/entity-designer/`-Verzeichnis existieren **13 AdWorks** JSON-Dateien, aber **keine EWB** JSON-Dateien. Die Entity-Designer JSONs dokumentieren die Spalten-Zuordnung (Hub/Satellite/Metadata) und generierte Objekte.

**Empfehlung:** Für jede EWB Staging-View ein Entity-Designer JSON erstellen, analog zu den AdWorks-Beispielen. Dies beschleunigt die Vault-Generierung und sichert die Dokumentation.

### Finding G-2 ℹ️ — NTB (Budget) ohne klare Zuordnung

**Beobachtung:** `PROJ.NTB` (Budget-Verwaltung: 707.733 Zeilen, 7 Programme) ist in der Staging-Reihenfolge aufgeführt (Rang 17), hat aber keine Vault-Zuordnung ("ggf. Mart-Level"). NTB hat keinen direkten FK zu NTC und ein eigenes Schema (`PRG+BEZ`).

**Empfehlung:** NTB entweder:
- Als `hub_budget` + `sat_budget` modellieren, falls BEZ → NPO.PROJNR-Beziehung bestätigt wird
- Oder aus dem DV-Scope streichen und nur als Mart-Level-Datenquelle nutzen

---

## 7. STATUS-UPDATE — CDR / TELECOM (05.05.2026)

Seit dem Review wurden die ursprünglich offenen Design-/Implementierungspunkte für die CDR-/Telecom-Domain umgesetzt und in den Diagrammen nachvollziehbar dokumentiert:

- ✅ `vault`: `hub_vertrag`, `hub_kunde`, `sat_kunde__compax`, `sat_vertrag_eff__compax`, `sat_vertrag_optionen_ma__compax`, `link_vertrag_kunde`
- ✅ `vault`: `link_kunde_adresse` ergänzt — Verknüpfung `hub_kunde` ↔ `hub_adresse` via `external_customer_id = INR` mit dokumentierter Match-Rate von 61%
- ✅ `vault_telecom`: `hub_sim`, `link_cdr_event_tl`, `sat_cdr_event__compax`, `link_vertrag_sim`, `ref_abo_option_v`, `ref_tarif_v`
- ✅ `mart_telecom`: `dim_mobilvertrag_v`, `dim_mobilkunde_v`, `dim_sim_v`, `fakt_cdr_v`, `fakt_datenvolumen_v`, `fakt_anrufe_v`
- ✅ Design-Artefakte nachgezogen: `design/raw-vault/_common/er-diagram.mmd`, `design/raw-vault/_common/er-cdr.mmd`, `design/mart/er-mart-telecom.mmd`

## 8. ZUSAMMENFASSUNG — Offene Aktionen

### Muss vor Implementierung geklärt werden (Blocker):

| # | Aktion | Priorität | Betrifft |
|---|---|---|---|
| 1 | ~~**Hash-Key-Naming festlegen**~~ | ✅ **GELÖST** | Entscheidung: `hk_<entity>` — alle Dateien aktualisiert |
| 2 | ~~**PST klären**~~ | ✅ **GELÖST** | Entscheidung: Nur `ref_projektstatus` (7 Lookup-Werte). `sat_projekt_status` entfernt |
| 3 | **PRT klären:** Status-Tracking (→ nur sat) oder eigenständige Entity (→ hub + sat + link)? | 🔴 Kritisch | hub_projektteil?, sat_projektteil, link_projektteil_projekt |
| 4 | ~~**link_person_adresse hinzufügen**~~ | ✅ **GELÖST** | Link im Plan und ER-Diagram ergänzt, Wave 1 zugeordnet |

### Sollte vor Implementierung geklärt werden (Verbesserungen):

| # | Aktion | Priorität | Betrifft |
|---|---|---|---|
| 5 | sat_buchungskopf: Vollständige Payload-Liste erstellen | 🟡 Medium | sat_buchungskopf |
| 6 | Ghost-Hub-Terminologie klären (Ghost vs. Sharepoint-backed) | 🟡 Medium | hub_konto, hub_kostenstelle |
| 7 | NTB-Zuordnung entscheiden (Vault oder Mart-only) | 🟡 Medium | Staging Rang 17 |
| 8 | Entity-Designer JSONs für EWB-Tabellen erstellen | 🟢 Nice-to-have | Dokumentation |
| 9 | NTR 70%-Match dokumentieren und Mart-NULL-Handling definieren | 🟢 Nice-to-have | ref_leistungsart |

---

## 9. POSITIV-BEFUNDE

✅ **Composite BKs datenvalidiert:** GL (DKBELEGNUMMER||KTO), KVL (BELEGNR||ZAHLNR), NSA (5-teilig) — alle durch Datenanalyse bestätigt  
✅ **Synapse-Fehler erkannt:** NSA.PROJNR = ProjektNr (nicht PersonalNr) — exzellente Datenanalyse  
✅ **NTC-Redesign korrekt:** Umbenennung von hub_projekttaetigkeit zu hub_zeiterfassung basierend auf tatsächlicher Tabellenstruktur  
✅ **Reference Tables richtig dimensioniert:** NTR (29) und PST (7) sind klassische Lookup-Kandidaten  
✅ **Wave-Planung sinnvoll:** Wave 1 (Stammdaten) → Wave 2 (Transaktionen) → Wave 3 (komplexe Links) folgt dem DV2.1-Dependency-Prinzip  
✅ **Mart-Business-Logik dokumentiert:** Vorzeichen-Logik, MWST-Anpassung, Filter-Regeln vollständig festgehalten  
✅ **Kein unnötiger Hub für Finance.Kunden:** Korrekte Entscheidung, Kundendaten aus PUBL.ADR statt dediziertem Hub aus KBL zu beziehen  

---

*Review abgeschlossen: 14. März 2026 | vault-architect | PPMC AG*
