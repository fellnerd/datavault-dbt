# Offene Fragen — Data Vault Implementierung EWB

**Datum:** 13. März 2026  
**Von:** PPMC AG — Analytics Team  
**An:** EWB — Fachverantwortliche  
**Betreff:** Klärungsbedarf vor Implementierung Wave 2+3

---

## Zusammenfassung

Wir haben die bestehenden Synapse structured-tables Pipelines analysiert und dabei wertvolle Erkenntnisse gewonnen. Einige Punkte erfordern fachliche Klärung durch EWB, bevor wir die nächsten Implementierungswellen starten können. Wave 1 (Stammdaten) kann sofort beginnen.

---

## ~~Frage 1: FIBU.GL — Belegnummer-Eindeutigkeit~~ ✅ GELÖST

> **Ergebnis (Datenanalyse 13.03.2026):** Dieselbe `DKBELEGNUMMER` erscheint auf 2–5 verschiedenen Konten (29% aller Belegnummern). Composite BK `DKBELEGNUMMER||KTO` bestätigt. Wave 2 ist nicht mehr blockiert.

---

## Frage 2: PROJ.NSA — Projektzuordnung in Stundenbuchungen (🔴 Blockiert Wave 3)

**Hintergrund:**
Bei der Analyse der Synapse-Pipeline `Projekt.Stunden` haben wir eine überraschende Erkenntnis gewonnen:

Die Spalte `PROJNR` in der Tabelle `PROJ.NSA` enthält **nicht** die Projektnummer, sondern die **Personalnummer** (= Mitarbeiternummer). Dies zeigt der Synapse-Code:
```sql
CAST(T1.[PROJNR] as int) AS [PersonalNr]
-- JOIN: NSA.PROJNR = ADR.LOHNNR (Adressstamm)
```

**Konkrete Fragen:**
1. Können Sie bestätigen, dass `PROJNR` in `PROJ.NSA` tatsächlich die Personalnummer speichert?
2. Über welchen Weg wird in Abacus die **Projektzuordnung** der Stundenbuchungen hergestellt? Mögliche Kandidaten:
   - Über `PROJ.NTC` (Tätigkeiten pro Projekt)?
   - Über ein anderes Feld in NSA, das wir nicht identifiziert haben?
   - Über eine indirekte Zuordnung (Person → Projekt via Organisationseinheit)?
3. Ist `RECNUM` in NSA ein stabiler, fachlicher Schlüssel oder ein rein technischer Zähler?

**Impact:** Ohne Klärung kann `link_stundenbuchung_projekt` nicht modelliert werden — die gesamte Projekt-Stunden-Auswertung im Mart wäre unvollständig.

---

## Frage 3: Leistungsarten — Hub oder Referenztabelle? (⚠️ Wave 1)

**Hintergrund:**
`PROJ.NTR` enthält Leistungsarten (z.B. "Projektleitung", "Engineering"). Typischerweise sind dies stabile Lookup-Werte (<100 Einträge).

**Konkrete Fragen:**
1. Werden Leistungsarten ausschliesslich in Abacus gepflegt, oder kommen sie auch aus anderen Systemen (z.B. IDMS)?
2. Ist die Historisierung der Leistungsart-Bezeichnungen relevant? (z.B. "Leistungsart X hiess früher Y")

**Optionen:**
- **Reference Table** (einfacher, empfohlen wenn nur Abacus + keine Historisierung nötig)
- **Hub + Satellite** (nötig bei Multi-Source oder Historisierungsbedarf)

**Unsere Empfehlung:** Reference Table, sofern EWB bestätigt, dass Leistungsarten stabil und single-source sind.

---

## Frage 4: Sharepoint-Daten als Referenztabellen (⚠️ Wave 1–2)

**Hintergrund:**
In den bestehenden Synapse-Pipelines haben wir 8 Sharepoint-Tabellen identifiziert, die als Referenzdaten verwendet werden:

| Sharepoint-Tabelle | Verwendung in Synapse | Relevanz für DV |
|---|---|---|
| `Konten` | Kontenplan-Beschriftungen | 🔴 Löst Ghost-Record-Problem für `hub_konto` |
| `Kostenstellen` | Kostenstellen-Namen | 🔴 Löst Ghost-Record-Problem für `hub_kostenstelle` |
| `Budget` | Budgetdaten | ⚠️ Finance-Reporting |
| `Forecast` / `ActualForecast` | Planungsdaten | ⚠️ Finance-Reporting |
| `KategorisierungProjekte` | Projekt→Kategorie-Zuordnung | ⚠️ Projekt-Gruppierung |
| `ProjekteKategorien` | Kategorie-Stammdaten | ⚠️ Projekt-Gruppierung |
| `Zugangsrechte` | Berechtigungen | 🟡 Ggf. für Row-Level Security |

**Konkrete Fragen:**
1. Sollen `Konten` und `Kostenstellen` als Reference Tables im Data Vault importiert werden? (Unsere Empfehlung: Ja — ermöglicht Dimensionsbeschriftungen in Mart-Views)
2. Sollen die Planungsdaten (Budget/Forecast) ebenfalls in den DV-Scope?
3. Können diese Sharepoint-Tabellen über die bestehende ADF-Pipeline in die `landing-zone` bereitgestellt werden? Aktuell werden sie nur via Synapse `[Sharepoint].*` Schema geladen.

---

## Zusätzliche Erkenntnisse (zur Information, keine Klärung nötig)

### ✅ Personenbezug in Stundenbuchungen bestätigt
Die Verknüpfung `NSA.PROJNR = ADR.LOHNNR` ermöglicht den Link zwischen Stundenbuchung und Person. Der `link_stundenbuchung_person` kann wie geplant umgesetzt werden.

### ✅ Buchungen-Logik dokumentiert
Die komplexe Buchungslogik (4-facher UNION ALL mit Vorzeichen-Umkehr, MWST-Anpassung, KST-Ausschlussfilter) wurde vollständig extrahiert und wird im Mart Layer (`mart.v_fibu_buchungen`) repliziert.

### ⚠️ Finance.Kunden ist kein Kundenstamm
Die Synapse-View `Finance.Kunden` extrahiert Kundennummern aus Kreditorenbelegen (KBL) — ohne DISTINCT. Dies ist keine valide Kundenstamm-Quelle. Im Data Vault verwenden wir stattdessen `PUBL.ADR` als Personen-/Kundenstamm.

### ⚠️ PROJNR-Namenskollision
Die Spalte `PROJNR` hat unterschiedliche Bedeutungen in verschiedenen Abacus-Tabellen:
- `PROJ.NPO`: ProjektNummer ✅
- `PROJ.NSA`: PersonalNummer ⚠️

Wir werden dies in den Staging-Views durch Umbenennung (`PROJNR AS PERSONALNR`) in NSA klar dokumentieren.

---

## Nächste Schritte

| Schritt | Wer | Wann |
|---|---|---|
| Klärung F1–F4 | EWB Fachverantwortliche | Meeting |
| Wave 1 starten (Stammdaten) | PPMC Analytics | Sofort (unabhängig von F1–F4) |
| Wave 2 starten (Transaktionen) | PPMC Analytics | Nach Klärung F1 |
| Wave 3 starten (Projekt-Domain) | PPMC Analytics | Nach Klärung F2 |
| Mart-Layer planen | PPMC + EWB | Nach Wave 2 |
