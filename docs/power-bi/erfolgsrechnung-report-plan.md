# Power BI Implementierungsplan — Erfolgsrechnung CSM_Abacus_T

> **Ziel:** 4 zusätzliche Berichtsseiten für einen Controlling-/Fachbereichs-tauglichen
> Erfolgsrechnungs-Bericht auf Basis des DV2.1 Finance-Modells (datavault-test).
> **Bestehend:** Zebra-BI ER-Tabelle (Plausibilitätscheck) + 42 KPI-Measures.
> **Modell:** CSM_Abacus_T (DirectQuery auf `mart_finance` / `mart`)

---

## 0 — Vorarbeit: Fehlende Measures anlegen

Diese Measures werden für die Trend-/YTD-Visuals (Seite 2) benötigt und existieren noch nicht.
Anlegen auf Tabelle `fakt_buchungen`, Display-Folder `Trend`.

| Measure | DAX (Kurzform) | Format |
|---------|----------------|--------|
| `Rechnung YTD` | `TOTALYTD([Rechnung], 'dim_date'[full_date])` | `#,##0.00 CHF` |
| `Budget YTD` | `TOTALYTD([Budget], 'dim_date'[full_date])` | `#,##0.00 CHF` |
| `Vorjahr YTD` | `TOTALYTD([Vorjahr], 'dim_date'[full_date])` | `#,##0.00 CHF` |
| `Forecast YTD` | `TOTALYTD([Total Forecast], 'dim_date'[full_date])` | `#,##0.00 CHF` |

> Bereits vorhanden (nicht neu anlegen): `Rechnung`, `Budget`, `Vorjahr`, `Total Forecast`,
> `Total Actuals (with Forecast)`, `Total Actuals vs Budget/Forecast/Prev Year` (+ `%`),
> sowie 42 `KPI …`-Measures (6 Gruppen × 7).

---

## Globale Elemente (auf jeder Seite gleich)

### G1 — Header-Band
- **Visual:** Bild (EWB-Logo) + Textfeld Titel
- **Position:** oben, volle Breite, Höhe ~70px
- **Inhalt:** Logo links, Seitentitel mittig, `last_load`-Measure rechts

### G2 — Zeit-Slicer (Y/Q/M)
- **Visual:** Slicer
- **Feld:** `dim_date[year]` bzw. Hierarchie `year → quarter → month`
- **Einstellung:** Modus „Zwischen" oder Dropdown; Standard = aktuelles Jahr

### G3 — Szenario-Slicer
- **Visual:** Slicer
- **Feld:** `Actuals Forecast Selector[Scenario]`
- **Einstellung:** Einzelauswahl, Standard = „Actuals"

### G4 — Monats-Range-Slicer
- **Visual:** Slicer
- **Feld:** `dim_date[year_month]`
- **Einstellung:** Typ „Zwischen"

> **Sync-Slicers** aktivieren, damit G2–G4 auf allen 4 Seiten synchron filtern.

---

## Seite 1 — Management Cockpit

**Zweck:** GuV auf einen Blick für Geschäftsleitung. KPI-Fokus.

| # | Visual | Buckets / Felder | Einstellungen |
|---|--------|------------------|---------------|
| 1.1 | **Card (×6)** oder **Multi-Row Card** | Je Card ein KPI: `KPI 4x Bruttoergebnis`, `KPI 5x Bruttoergebnis`, `KPI 6ax EBITDA`, `KPI 6bx EBIT`, `KPI 7x Betriebsergebnis`, `KPI 9x Ergebnis` | Callout-Wert; darunter je `… ΔVJ%` + `… ΔBudget%` als Detail. Bedingte Formatierung: grün/rot nach Vorzeichen |
| 1.2 | **Wasserfall** | Kategorie: `dim_konto[konto_l2]` · Y: `Rechnung` | Sortierung nach `konto_sort`; Summenanzeige; Start/Ende = Budget/Rechnung optional |
| 1.3 | **Liniendiagramm** | X: `dim_date[month_name_short]` · Y: `Rechnung`, `Budget`, `Vorjahr` | X-Achse nach `month` sortiert; Legende oben; Marker an |
| 1.4 | **KPI-Card** (Kontext) | Wert: `9x Ergebnis` · Ziel: `KPI 9x Ergebnis Budget` | Trendachse: `dim_date[year_month]` |

**Layout:** KPI-Cards oben (Reihe), Wasserfall links unten (breit), Trend-Linie rechts unten.

---

## Seite 2 — Perioden- & Trendanalyse

**Zweck:** Zeitliche Entwicklung, YTD, Forecast-Verlauf. Für Controlling.

| # | Visual | Buckets / Felder | Einstellungen |
|---|--------|------------------|---------------|
| 2.1 | **Matrix** | Rows: `dim_konto[konto_l2]` → `konto_l1` · Columns: `dim_date[month_name_short]` · Values: `Rechnung` | Zeilen nach `konto_sort`; Spalten nach `month`; Zwischensummen aus; Konditionale Formatierung (Datenbalken) |
| 2.2 | **Liniendiagramm (kumuliert)** | X: `dim_date[month_name_short]` · Y: `Rechnung YTD`, `Budget YTD`, `Vorjahr YTD` | Kumulative YTD-Kurven; Legende oben |
| 2.3 | **Liniendiagramm mit Prognose** | X: `dim_date[year_month]` · Y: `Total Actuals (with Forecast)`, `Budget` | Actuals+Forecast vs Budget; Forecast-Bereich visuell abgesetzt |
| 2.4 | **Karten-Reihe** | `Rechnung YTD`, `Budget YTD`, `Total Actuals vs Budget`, `Total Actuals vs Budget %` | Kompakte KPI-Leiste oben |

**Layout:** KPI-Leiste oben, Matrix links (breit), YTD-Linie + Forecast-Linie rechts gestapelt.

---

## Seite 3 — Bereichs- & Kostenstellenanalyse

**Zweck:** Ergebnis nach Organisationseinheit. Für Bereichsleitung.

| # | Visual | Buckets / Felder | Einstellungen |
|---|--------|------------------|---------------|
| 3.1 | **Matrix** | Rows: `dim_kostenstelle[bereich_name]` → `kostenstelle_name` · Values: `Vorjahr`, `Budget`, `Rechnung`, `Total Actuals vs Prev Year`, `Total Actuals vs Budget` | Zwischensummen an (Bereich-Ebene); Bedingte Formatierung auf Δ-Spalten (rot/grün) |
| 3.2 | **Decomposition Tree** | Analysieren: `Rechnung` · Erklären nach: `dim_kostenstelle[bereich_name]`, `kostenstelle_name`, `dim_konto[konto_l2]` | Interaktives Drill-down |
| 3.3 | **Balkendiagramm (gestapelt)** | Achse: `dim_kostenstelle[bereich_name]` · Werte: `Rechnung` · Legende: `dim_konto[konto_l2]` | Horizontal; sortiert nach Rechnung absteigend |
| 3.4 | **Karten** | `Rechnung`, `Total Actuals vs Budget %` | Kontext oben |

**Layout:** Matrix links (breit), Decomposition Tree rechts oben, Balken rechts unten.

---

## Seite 4 — Lieferanten & Buchungsdetail

**Zweck:** Kreditoren-Ranking + Abweichungs-Drill + Transaktions-Detail. Für Detail-Analyse.

| # | Visual | Buckets / Felder | Einstellungen |
|---|--------|------------------|---------------|
| 4.1 | **Tabelle (Kreditoren)** | Spalten: `dim_kreditor[kreditor_name]`, `Vorjahr`, `Rechnung`, `Total Actuals vs Prev Year` | Sortiert nach `Rechnung` aufsteigend (grösste Aufwände zuerst); Top-N-Filter optional |
| 4.2 | **Balkendiagramm (Top Abweichungen)** | Achse: `dim_konto[konto_label]` · Werte: `Total Actuals vs Budget` | Top-15-Filter nach absoluter Abweichung; horizontal; rot/grün |
| 4.3 | **Tabelle (Buchungsdetail)** | `dim_date[full_date]`, `dim_kostenstelle[kostenstelle_name]`, `dim_konto[konto_label]`, `fakt_buchungen[umschreibung]`, `fakt_buchungen[belegnummer]`, `Rechnung` | Als **Drill-through-Ziel** konfigurieren (Drill-through-Feld: `dim_konto[konto_l2]`); Betrag rechtsbündig |
| 4.4 | **Slicer** | `dim_kostenstelle[bereich_name]` | Seitenspezifisch |

**Layout:** Kreditoren-Tabelle links oben, Top-Abweichungen links unten, Buchungsdetail rechts (volle Höhe).

---

## Umsetzungs-Reihenfolge

| Schritt | Aktion | Tool |
|---------|--------|------|
| 1 | 4 YTD-Measures anlegen | PBI MCP `measure_operations` |
| 2 | Seite 1 (Cockpit) bauen | PBI Desktop |
| 3 | Seite 2 (Trend) bauen | PBI Desktop |
| 4 | Seite 3 (Bereich) bauen | PBI Desktop |
| 5 | Seite 4 (Detail) bauen | PBI Desktop |
| 6 | Sync-Slicers + Drill-through konfigurieren | PBI Desktop |
| 7 | (später) Figma Low-Fidelity Mockups | Figma MCP |

---

## Referenz — Verfügbare Measures (Auszug)

**Basis:** `Rechnung`, `Budget`, `Vorjahr`, `Total Forecast`, `Total Actuals (with Forecast)`
**Abweichungen:** `Total Actuals vs Budget`, `… vs Forecast`, `… vs Prev Year` (+ jeweils `%`)
**KPI-Gruppen** (je 7: Wert, VJ, ΔVJ, ΔVJ%, Budget, ΔBudget, ΔBudget%):
`KPI 4x Bruttoergebnis`, `KPI 5x Bruttoergebnis`, `KPI 6ax EBITDA`, `KPI 6bx EBIT`, `KPI 7x Betriebsergebnis`, `KPI 9x Ergebnis`

## Referenz — Wichtige Dimensions-Attribute

| Tabelle | Attribute für Berichte |
|---------|------------------------|
| `dim_konto` | `konto_l2`, `konto_l1`, `konto_label`, `konto_sort` (Sortierung), `Zeilentyp` |
| `dim_kostenstelle` | `bereich_name`, `bereich_detail_name`, `kostenstelle_name`, `investitionsrechnung` |
| `dim_kreditor` | `kreditor_name`, `kreditor_code` |
| `dim_date` | `year`, `quarter_name`, `month`, `month_name_short`, `year_month` |
| `fakt_buchungen` | `betrag`, `umschreibung`, `umschreibung2`, `belegnummer`, `kundennummer`, `soll_haben` |
