# Power BI Implementierungsplan — i-SE Lastgang / ¼-Stunden-Werte (CSM_ISE_DEV)

> **Ziel:** 3 Berichtsseiten für einen fachbereichstauglichen Energie-/Lastgangbericht
> auf Basis des DV2.1 ISE-Marts (`mart_ise`).
> **Modell:** CSM_ISE_DEV (DirectQuery auf `sql-analytics-ewb-001` / `datavault-dev`)
> **Bestehend:** 4 Tabellen (`dim_zeitreihe`, `dim_date`, `fakt_lastgang`,
> `fakt_lastgang_monat`) + `Report Status`.
> **Stand:** 2026-08-28 · Datenexploration gegen das laufende Modell durchgeführt.
>
> ✅ **Umgesetzt am 2026-08-28 (Schritte 1–4 und 6):** Modellkorrekturen 2.1–2.4 erledigt und
> verifiziert; **56 Measures** in den Ordnern `01 Basis`, `02 Leistung`, `03 Netzbilanz`,
> `04 Zeitvergleich`, `05 Qualität` und `06 Zebra-Steuerung` angelegt und einzeln gegen die
> Daten geprüft (alle 56 werten fehlerfrei aus).
>
> **Noch offen:** dbt-Vorarbeit 2.5 (Schritt 5) — einziger echter Blocker.
> Deshalb fehlt auch das Measure `Bilanz Zeilentyp` aus `06 Zebra-Steuerung`.
>
> ⚠ **Diese Spalten existieren im Modell noch NICHT** — sie kommen erst mit Schritt 5:
> `serien_kategorie`, `flussrichtung`, `netzebene`, `bilanz_position`, `bilanz_zeilentyp`,
> `bilanz_sort`. Sie werden unten in G3, Ordner `03`, Seite 1 (1.2/1.3) und Seite 3
> (3.1/3.2/3.5) bereits verwendet.
> **Interim ohne Schritt 5:** `dim_zeitreihe[referenz]` statt `serien_kategorie` — gruppiert
> fast deckungsgleich (Netz 16 · Auswertungen 12 · Lieferant 4+3+3 · Messpunkt 1+1+1), nur
> sind Lieferant und Messpunkt in je 3 Werte aufgeteilt statt zusammengefasst.
> Die Seiten 1–3 selbst (Schritte 7–10) sind reine Visual-Arbeit in Power BI Desktop —
> der Power-BI-MCP verwaltet nur das Semantikmodell, keine Berichtsseiten.
>
> ⚠ **Nach jeder MCP-Sitzung die .pbix speichern.** Änderungen über den Power-BI-MCP laufen
> per TOM gegen das **laufende In-Memory-Modell** von Power BI Desktop. Wird Desktop ohne
> Speichern geschlossen oder neu gestartet, sind Datumstabellen-Markierung, Beziehungen und
> Measures restlos weg. Genau das ist am 2026-08-28 passiert (Desktop-Neustart 08:11) —
> Schritte 1–4 mussten vollständig wiederholt werden. Kein Fehler des MCP, sondern normales
> Desktop-Verhalten: **Ctrl+S nicht vergessen.**

---

## 1 — Was dieser Bericht dem Fachbereich liefert

**Direkt lieferbar (Daten liegen bereits im Mart):**

- **Energiebilanz des Netzes** — Aufkommen (Bezug aus vorgelagerten Netzen + Eigenproduktion
  NE5/NE7 − Rücklieferung) bis zur Gesamteinspeisung, und weiter über Netzverluste und PUZ
  bis zur Bruttolastgangsumme. Alle Bilanzgleichungen sind gegen die Daten **verifiziert**
  (Abschnitt 3) — die Tabelle ist damit gleichzeitig Auswertung *und* Plausibilitätsprüfung.
- **Lastprofil in ¼-Stunden-Auflösung** — Tagesgang, Wochengang, Werktag/Wochenende,
  Nacht-/Grundlast gegen Mittagsspitze. Die Kurve ist bereits sauber sichtbar
  (Minimum ~407 kWh/¼h um 00:00, Maximum ~598 kWh/¼h um 11:00).
- **Spitzenlast und Benutzungsdauer** — höchste ¼-h-Leistung inkl. Zeitpunkt, Grundlast,
  Lastfaktor, Vollbenutzungsstunden. Für Netzdimensionierung und Leistungspreis relevant.
- **Verlustquote** — Netzverluste absolut und in % der Einspeisung, aufgeteilt nach
  Netzebene NE5/NE6/NE7 (aktuell 3,27 % gesamt).
- **Erzeugung** — Eigenproduktion NE5/NE7, Rücklieferung aus PV und Wasserkraft, die drei
  einzeln gemessenen Turbinen-Messpunkte.
- **Lieferantensicht** — Gesamtlieferung / Gesamtrücklieferung / Saldo je Lieferant
  (Alpiq, EPAG, Primeo) und fremde Lieferanten.
- **Datenqualitäts-Sicht** — Vollständigkeit der ¼-h-Reihen (erwartete vs. gelieferte Werte),
  Bilanzdifferenzen als Wächter, Abgleich der Monatssummen gegen den Innosolv-Cube.

**Zusätzlich lieferbar, sobald die Vollhistorie geladen ist (Backfill X-2, siehe Abschnitt 2.6):**

- **Vorjahres- und Vormonatsvergleiche** für jede Kennzahl — inkl. Erzeugung, Verbrauch,
  Verlusten und Spitzenlast, als IBCS-konforme Abweichungsdarstellung.
- **Jahresverlauf / YTD** — kumulierte Energiemengen gegen Vorjahr, gleitender 12-Monats-Wert
  gegen Witterungsschwankungen.
- **Mehrjahresvergleich Erzeugung** — PV-Zubau und Wasserkraft-Jahresgang über die Jahre.

**Perspektivisch möglich, ohne neue Technik (nur weitere Zeitreihegruppen anbinden):**

- **Tarifanalysen** — Gruppe `ewb Tarif 2027 Haushalt mit Smartmeter` (6'187 Serien) und
  `ewb Tarif 2027 Industrie N (NE7)` (69 Serien) liegen in i-SE bereit; damit werden
  Lastprofile je Tarifgruppe, Gleichzeitigkeitsgrade und Tarifsimulationen möglich.
- **Herkunftsnachweise** — Gruppe `HKN` (673 Serien).
- **Einzelkundenanalysen** — messpunktreferenzierte Serien lassen sich um Standort und
  Bezügeranlage anreichern (in `dim_zeitreihe` bereits vorhanden, aktuell nur für 3 Serien
  gefüllt).
- **Kombination mit Wetterdaten** — Grad-Tag-Normierung, witterungsbereinigter Verbrauch.
- **Ist gegen Fahrplan** — sobald Fahrplan-/Prognosedaten angebunden sind, füllt sich der
  Zebra-BI-Forecast-Platzhalter und die Abweichungslogik greift ohne weiteren Umbau.

---

## 2 — Vorarbeiten (zwingend, vor dem ersten Visual)

Diese Punkte sind bei der Exploration am laufenden Modell festgestellt und jeweils
**empirisch belegt**. Ohne sie liefern die Vergleichs-Measures still falsche Werte.

### 2.1 `dim_date` als Datumstabelle markieren — **kritisch**

Aktuell ist `dim_date` **nicht** als Datumstabelle markiert. Belegt durch:

| Filter im Test | `PREVIOUSDAY`-Ergebnis |
|---|---|
| `dim_date[full_date] = 05.08.2026` | 2'016'791,57 ✓ korrekt |
| `dim_date[year]=2026 & [month]=8 & [day_of_month]=5` | **BLANK** ✗ |

Der zweite Fall ist genau das, was ein Jahr-/Monats-Slicer erzeugt. **Jedes** Vorjahres-,
Vormonats- und YTD-Measure würde im Bericht leer bleiben.

→ *Tabellentools → Als Datumstabelle markieren → `full_date`.*

### 2.2 Beziehung `fakt_lastgang_monat` → `dim_zeitreihe` von 1:1 auf n:1 korrigieren — **kritisch**

Die Beziehung ist als `fromCardinality: One` (1:1) deklariert. Das ist heute nur deshalb
gültig, weil der Mart genau **einen** Monat enthält (41 Zeilen = 41 Serien). Sobald der
zweite Monat lädt, wiederholt sich `zeitreihe_key` und die Beziehung bricht.

→ *Beziehung bearbeiten → Kardinalität `Viele zu eins (*:1)`.*

### 2.3 Bidirektionale Filterung auf beiden Faktentabellen abschalten

`fakt_lastgang` → `dim_zeitreihe` und `fakt_lastgang_monat` → `dim_zeitreihe` filtern beide
**bidirektional**. Damit entsteht ein Pfad
`dim_date → fakt_lastgang → dim_zeitreihe → fakt_lastgang_monat` — die Monatsfakten werden
unbeabsichtigt durch den Tagesfilter der ¼-h-Fakten mitgefiltert.

→ *Beide auf `Einfach` (Dimension → Faktentabelle) stellen.* Zebra BI verlangt ohnehin ein
striktes Sternschema mit Single-Cross-Filter.

### 2.4 Automatisches Datum/Uhrzeit deaktivieren

Das Modell trägt `__PBI_TimeIntelligenceEnabled = 1`. Bei DirectQuery bringt das nichts und
erzeugt nur Rauschen. → *Optionen → Datenladen → Automatisches Datum/Uhrzeit aus.*

### 2.5 `dim_zeitreihe_v` materialisieren (dbt) + Bilanz-Attribute ergänzen

`dim_zeitreihe_v` ist heute eine **View mit vier Joins**, davon zwei auf `*_current_v`-Views
über SCD2-Satelliten. Bei DirectQuery wird das bei jeder Abfrage neu berechnet. Das
Hausmuster aus `docs/LESSONS_LEARNED.md` (§1) lautet: Logik in eine `table`, davor eine dünne
Wrapper-View — genau wie es `fakt_lastgang`/`fakt_lastgang_v` bereits macht.

Gleichzeitig fehlen dem Mart die Attribute, ohne die der Bericht keine fachlichen Gruppen
bilden kann. Vorschlag — analog zu den Pflegetabellen der Erfolgsrechnung als **dbt-Seed**,
damit der Fachbereich sie selbst pflegen kann:

| Neue Spalte | Zweck | Beispielwerte |
|---|---|---|
| `serien_kategorie` | Fachliche Gruppe | `Netzbilanz`, `Lieferant`, `Erzeugung PV`, `Erzeugung Wasser`, `Messpunkt` |
| `flussrichtung` | Vorzeichen-/Farblogik | `Bezug`, `Einspeisung`, `Verlust`, `Saldo` |
| `netzebene` | Netzebene aus dem Seriennamen | `NE5`, `NE6`, `NE7`, `–` |
| `bilanz_position` | Zeilenbeschriftung der Bilanztabelle | `Bezug vorgelagerte Netze NE5` |
| `bilanz_zeilentyp` | **Zebra BI „Category Class"** | `=` Result, `-` Invert, `/` Skip, leer = Detail |
| `bilanz_sort` | Zeilenreihenfolge (zwingend, s. Abschnitt 6) | `10`, `20`, … |

Zusätzlich **Plug-Zeilen** (Dimensionszeilen ohne Fakten) für die Zwischensummen
`= Gesamteinspeisung Netz` und `= Bruttolastgangsumme BLS/EN` — exakt das Muster, das
`dim_konto` für die Erfolgsrechnung verwendet.

### 2.6 Offen (nicht blockierend, aber begrenzend): Datenumfang

Der Mart enthält aktuell **6 Tage** (02.–07.08.2026, 23'616 ¼-h-Werte, 41 Serien, ein
Monatsaggregat `2026/08`). Dokumentiert sind 169'248 Zeilen im Vault; bei Vollhistorie der
Gruppe 150 wären es ~3,2 Mio.

**Konsequenz für den Bericht:** Vorjahres- und Vormonatsvergleiche sind fachlich korrekt
modelliert, liefern aber bis zum Backfill **BLANK**. Das ist kein Fehler und in Zebra BI
sogar das gewünschte Verhalten (leer ≠ 0). Bis dahin tragen die Seiten über Vortag,
Vorwoche und Tagesprofil.

→ Offene Punkte X-2 (Backfill-Export) und die Delta-Load-Strategie in
[`TASKS.md`](../../TASKS.md) sind die Voraussetzung für die Zeitvergleiche.

---

## 3 — Verifizierte Bilanzgleichungen (Grundlage von Seite 1)

Gegen das laufende Modell nachgerechnet; Residuen ≤ 4·10⁻⁶ kWh (Gleitkommarauschen):

| # | Gleichung | Residuum |
|---|---|---|
| A1 | Bezug vorgel. NE5 + Produktion NE5 + Produktion NE7 − Rücklieferung vorgel. NE5 = **Gesamteinspeisung Netz** | 0 |
| A2 | Gesamteinspeisung Netz = **Verbrauch im Netz gesamt** (wertgleiche Serien) | 0 |
| A3 | Bruttolastgangsumme + Verluste Gesamt + PUZ = Verbrauch im Netz gesamt | 2·10⁻⁶ |
| A4 | Verluste NE5 + NE6 + NE7 = **Verluste Gesamt** | 4·10⁻⁶ |
| A5 | Summe Bezüger NE7 + Virtueller Kundenpool = **Gesamtbezug NE7 inkl. VKP** | 2·10⁻⁶ |
| A6 | Summe Bezüger NE5 + Gesamtbezug NE7 − PUZ = **Bruttolastgangsumme BLS/EN** | 0 |
| B2 | Gesamtlieferung LF − Gesamtrücklieferung LF = **Saldo-Serie** (alle 3 Lieferanten) | 6·10⁻¹¹ |

> ⚠ **Zentrale Modellierungsregel:** Die 41 Serien überlappen sich fachlich (A2, A4, A5, A6
> zeigen es). Eine Summe über *alle* Serien ist **bedeutungslos**. Jedes Visual muss
> entweder auf genau eine Serie filtern oder nach Serie aufreissen. Die Measures in
> Abschnitt 4 setzen deshalb ihre Serienauswahl selbst per `CALCULATE` — sie sind gegen
> falsche Filterkontexte robust.

> ⚠ **Offen für den Fachbereich:** Bei den PV- und Wasser-Serien gibt es Nahduplikate
> (`PV KEV Rücklieferung` 17'730 kWh vs. `EWB PV KEV Rücklieferung` 17'169 kWh;
> `Wasser KEV Rücklieferung` vs. `EWB Wasser KEV Rücklieferung`). Welche Teilmenge
> überschneidungsfrei ist, muss fachlich bestätigt werden, bevor `Erzeugung PV MWh` und
> `Erzeugung Wasser MWh` produktiv gehen. Bis dahin gilt als belastbare Erzeugungsdefinition
> `Produktion NE5 + Produktion NE7` — die ist über A1 verifiziert.

---

## 4 — Measures anlegen

Alle Measures auf Tabelle **`fakt_lastgang`** (Hausmuster: Measures liegen auf der
Faktentabelle, vgl. Erfolgsrechnung auf `fakt_buchungen`). Gliederung über **Anzeigeordner**.
Eine eigene Measure-Tabelle würde eine Importtabelle und damit ein zusammengesetztes Modell
erfordern — bewusst vermieden.

> **Zebra-BI-Grundregel:** Abweichungen (Δ absolut, Δ %) werden von Zebra BI **automatisch**
> aus der Bucket-Zuordnung berechnet. Laut Doku: *„you do not have to create separate
> measures for absolute variance and relative variance."* → **Keine Δ-Measures bauen.**
> Die wenigen Ausnahmen für native Power-BI-Visuals sind unten als solche gekennzeichnet.

### Ordner `01 Basis`

| Measure | DAX | Format |
|---|---|---|
| `Energie kWh` | `SUM ( fakt_lastgang[wert_kwh] )` | `#,##0 "kWh"` |
| `Energie MWh` | `DIVIDE ( [Energie kWh], 1000 )` | `#,##0.0 "MWh"` |
| `Anzahl Messwerte` | `COUNTROWS ( fakt_lastgang )` | `#,##0` |
| `Erwartete Messwerte` | `DISTINCTCOUNT ( fakt_lastgang[datum_key] ) * 96 * DISTINCTCOUNT ( fakt_lastgang[zeitreihe_key] )` | `#,##0` |
| `Vollständigkeit %` | `DIVIDE ( [Anzahl Messwerte], [Erwartete Messwerte] )` | `0.0 %` |

> `Energie MWh` ist die **Leitgrösse** für Seite 1 und 3. Grund: Zebra BI kennt nur die
> generischen Stufen K/M/bn und erzeugt auf kWh angewandt „kkWh". Deshalb die Umrechnung im
> Measure und im Visual *Data labels → Units = `Power BI`*.

### Ordner `02 Leistung`

| Measure | DAX | Format |
|---|---|---|
| `Spitzenlast kW` | `MAXX ( VALUES ( fakt_lastgang[intervall_start] ), CALCULATE ( [Energie kWh] ) ) * 4` | `#,##0 "kW"` |
| `Grundlast kW` | `MINX ( VALUES ( fakt_lastgang[intervall_start] ), CALCULATE ( [Energie kWh] ) ) * 4` | `#,##0 "kW"` |
| `Leistung Ø kW` | `DIVIDE ( [Energie kWh], [Anzahl Messwerte] ) * 4` | `#,##0 "kW"` |
| `Lastfaktor %` | `DIVIDE ( [Leistung Ø kW], [Spitzenlast kW] )` | `0.0 %` |
| `Benutzungsdauer h` | `DIVIDE ( [Energie kWh], [Spitzenlast kW] )` | `#,##0 "h"` |
| `Zeitpunkt Spitzenlast` | `VAR T = TOPN ( 1, VALUES ( fakt_lastgang[intervall_start] ), CALCULATE ( [Energie kWh] ), DESC ) RETURN FORMAT ( MAXX ( T, fakt_lastgang[intervall_start] ), "DD.MM.YYYY HH:mm" )` | Text |

> `Spitzenlast kW` ist bewusst als **gleichzeitige** Spitze definiert (Maximum der über die
> gewählten Serien *summierten* ¼-h-Leistung), nicht als `MAX` der Einzelwerte — sonst wäre
> sie bei Mehrfachauswahl fachlich falsch. Faktor 4: kWh je ¼ h × 4 = kW.
>
> **Performance:** `VALUES(intervall_start)` iteriert über die gefilterten Zeitpunkte (Monat
> ≈ 2'976). Für Jahresbetrachtungen stattdessen `MAX ( fakt_lastgang_monat[max_kwh] ) * 4`
> verwenden (nur bei Einzelserien exakt).
>
> `Zeitpunkt Spitzenlast` liefert **Text** — nie in einen Zebra-Values-Bucket legen.

### Ordner `03 Netzbilanz` (feste Serienzuordnung)

Muster — greift `REMOVEFILTERS` auf die Dimension, damit die Kennzahl unabhängig vom
Serien-Slicer stimmt:

```dax
Einspeisung MWh =
CALCULATE (
    [Energie MWh],
    REMOVEFILTERS ( dim_zeitreihe ),
    dim_zeitreihe[zeitreihe_id] = 183741
)
```

| Measure | Serie(n) (`zeitreihe_id`) |
|---|---|
| `Einspeisung MWh` | 183741 Gesamteinspeisung Netz |
| `Verbrauch MWh` | 185776 Verbrauch im Netz gesamt |
| `Netzverluste MWh` | 148741 Verluste Gesamt |
| `Verluste NE5 MWh` / `NE6` / `NE7` | 148734 / 148736 / 148740 |
| `Bezug vorgelagert MWh` | 148730 Lieferung von vor-/nachgel. Netzen NE5 |
| `Rücklieferung vorgelagert MWh` | 148731 Rücklieferung an vor-/nachgel. Netze NE5 |
| `Produktion NE5 MWh` | 148732 |
| `Produktion NE7 MWh` | 148738 |
| `Bruttolastgangsumme MWh` | 148746 |
| `PUZ MWh` | 150831 |
| `Bezüger NE5 MWh` | 148733 |
| `Bezüger NE7 MWh` | 148739 |
| `Virtueller Kundenpool MWh` | 148745 |

Abgeleitet:

| Measure | DAX |
|---|---|
| `Erzeugung MWh` | `[Produktion NE5 MWh] + [Produktion NE7 MWh]` |
| `Nettobezug vorgelagert MWh` | `[Bezug vorgelagert MWh] - [Rücklieferung vorgelagert MWh]` |
| `Verlustquote %` | `DIVIDE ( [Netzverluste MWh], [Einspeisung MWh] )` |
| `Eigenerzeugungsquote %` | `DIVIDE ( [Erzeugung MWh], [Einspeisung MWh] )` |
| `Importquote %` | `DIVIDE ( [Nettobezug vorgelagert MWh], [Einspeisung MWh] )` |

*Nach fachlicher Klärung (Abschnitt 3):* `Erzeugung PV MWh`, `Erzeugung Wasser MWh` nach
demselben Muster über `dim_zeitreihe[serien_kategorie]`.

> ⚠ **Wertebereich der beiden Quoten — beim Messen aufgefallen:** Im geladenen Zeitraum
> ist `Eigenerzeugungsquote %` = **192 %** und `Importquote %` = **−92 %**. Das ist kein
> Rechenfehler: Die lokale Produktion (1'909 MWh) übersteigt die Gesamteinspeisung
> (994 MWh), weil der Überschuss an vorgelagerte Netze zurückgeliefert wird
> (Rücklieferung 1'273 MWh > Bezug 358 MWh) — das Netz ist in diesem Fenster **Netto-Exporteur**.
> Die beiden Kennzahlen sind also nicht auf 0–100 % beschränkt. Für die Darstellung heisst
> das: keine Prozent-Achse mit fixem 0–100-Bereich, und bei der Beschriftung im Bericht
> darauf hinweisen. Ob der Fachbereich stattdessen einen auf die Einspeisung begrenzten
> Autarkiegrad möchte, ist zu klären.

### Ordner `04 Zeitvergleich`

Diese Measures gehören in die Zebra-BI-Vergleichs-Buckets — **nicht** in `Values`.

| Measure | DAX | Zebra-Bucket |
|---|---|---|
| `Energie MWh VJ` | `CALCULATE ( [Energie MWh], SAMEPERIODLASTYEAR ( dim_date[full_date] ) )` | **Previous Year** |
| `Energie MWh VM` | `CALCULATE ( [Energie MWh], DATEADD ( dim_date[full_date], -1, MONTH ) )` | **Plan** |
| `Energie MWh VT` | `CALCULATE ( [Energie MWh], DATEADD ( dim_date[full_date], -1, DAY ) )` | **Plan** |
| `Energie MWh VW` | `CALCULATE ( [Energie MWh], DATEADD ( dim_date[full_date], -7, DAY ) )` | **Plan** |
| `Energie MWh YTD` | `CALCULATE ( [Energie MWh], DATESYTD ( dim_date[full_date] ) )` | Values (Zusatzspalte) |
| `Energie MWh VJ YTD` | `CALCULATE ( [Energie MWh YTD], SAMEPERIODLASTYEAR ( dim_date[full_date] ) )` | **Previous Year** |
| `Energie MWh Ø 7T` | `AVERAGEX ( DATESINPERIOD ( dim_date[full_date], MAX ( dim_date[full_date] ), -7, DAY ), [Energie MWh] )` | Values (Zusatzspalte) |

Analog für die Bilanzgrössen (jeweils `… VJ` und `… VM`):

| Measure | DAX |
|---|---|
| `Erzeugung MWh VJ` | `CALCULATE ( [Erzeugung MWh], SAMEPERIODLASTYEAR ( dim_date[full_date] ) )` |
| `Erzeugung MWh VM` | `CALCULATE ( [Erzeugung MWh], DATEADD ( dim_date[full_date], -1, MONTH ) )` |
| `Einspeisung MWh VJ` / `… VM` | analog |
| `Verbrauch MWh VJ` / `… VM` | analog |
| `Netzverluste MWh VJ` / `… VM` | analog |
| `Spitzenlast kW VJ` / `… VM` | analog auf `[Spitzenlast kW]` |

> **Warum „Vormonat" in den Plan-Bucket?** Zebra BI erkennt Szenarien ausschliesslich am
> **Bucket**, nie am Measure-Namen. Es gibt hier fachlich weder Budget noch Forecast — der
> `Plan`-Platzhalter ist damit frei und wird für den zweiten Zeitvergleich genutzt. Die
> Spaltenüberschrift im Visual anschliessend auf `VM` umbenennen bzw. *„Use measure name"*
> aktivieren, damit im Bericht nicht „PL" steht.
>
> `DATEADD` statt `PREVIOUSMONTH`: verschiebt die *gewählte* Periode um einen Monat und
> funktioniert damit auch bei Tages- und Wochenfiltern korrekt.

### Ordner `05 Qualität`

| Measure | DAX |
|---|---|
| `Bilanzdifferenz Aufkommen MWh` | `( [Bezug vorgelagert MWh] + [Produktion NE5 MWh] + [Produktion NE7 MWh] - [Rücklieferung vorgelagert MWh] ) - [Einspeisung MWh]` |
| `Bilanzdifferenz Verwendung MWh` | `( [Bruttolastgangsumme MWh] + [Netzverluste MWh] + [PUZ MWh] ) - [Verbrauch MWh]` |
| `Bilanzdifferenz Verluste MWh` | `( [Verluste NE5 MWh] + [Verluste NE6 MWh] + [Verluste NE7 MWh] ) - [Netzverluste MWh]` |
| `Monatssumme MWh (Cube-Referenz)` | `DIVIDE ( SUM ( fakt_lastgang_monat[summe_kwh] ), 1000 )` |
| `Abweichung ¼h vs. Monat MWh` | `[Energie MWh] - [Monatssumme MWh (Cube-Referenz)]` |
| `Letzter Messzeitpunkt` | `FORMAT ( MAX ( fakt_lastgang[intervall_start] ), "DD.MM.YYYY HH:mm" )` |
| `Erste Messung` | `FORMAT ( MIN ( fakt_lastgang[intervall_start] ), "DD.MM.YYYY HH:mm" )` |

### Ordner `06 Zebra-Steuerung`

| Measure | DAX | Zweck |
|---|---|---|
| `Bilanz Zeilentyp` | `SELECTEDVALUE ( dim_zeitreihe[bilanz_zeilentyp] )` | **Category Class**-Bucket |
| `Titel Bilanz` | `"Energiebilanz " & SELECTEDVALUE ( dim_date[year_month], "Gesamtzeitraum" ) & " (in MWh)"` | Filters-Bucket → dynamischer Titel |

> Der Umweg über ein Measure statt der rohen Spalte ist Absicht: sobald im Modell eine
> Calculation Group existiert, sind implizite Measures modellweit deaktiviert und die
> Spalte liesse sich nicht mehr direkt binden (`docs/LESSONS_LEARNED.md` §3).

### Ausnahme — explizite Δ-Measures **nur** für native Power-BI-Visuals

Nicht in Zebra-BI-Visuals verwenden (dort doppelt sich die Varianzlogik):

| Measure | DAX |
|---|---|
| `Δ Energie VJ MWh` | `[Energie MWh] - [Energie MWh VJ]` |
| `Δ Energie VJ %` | `DIVIDE ( [Energie MWh] - [Energie MWh VJ], [Energie MWh VJ] )` |

---

## 5 — Globale Elemente (auf allen 3 Seiten gleich)

### G1 — Header-Band
Logo (`docs/power-bi/design/logo.svg`) links, Seitentitel mittig, rechts `last_load`
(vorhanden auf `Report Status`) plus `Letzter Messzeitpunkt`.

### G2 — Zeit-Slicer
`dim_date[year_month]`, Typ *Zwischen*. Zusätzlich `dim_date[full_date]` als Datumsbereich
für Seite 2.

### G3 — Serien-Slicer
`dim_zeitreihe[serien_kategorie]` → `zeitreihe_name` (Hierarchie).
**Wichtig:** Die Kennzahlen aus `03 Netzbilanz` ignorieren diesen Slicer bewusst
(`REMOVEFILTERS`) — er wirkt nur auf Seite 3 und auf die generischen `Energie`-Measures.

### G4 — Werktag/Wochenende
`dim_date[is_weekend]`, nur Seite 2.

> **Sync-Slicers** für G1–G3 über alle Seiten aktivieren.

### Zebra-BI-Grundeinstellungen (einmalig je Visual, dann per Theme-JSON fixieren)

| Einstellung | Wert | Begründung |
|---|---|---|
| *Data labels → Units* | `Power BI` | sonst überschreibt Zebras Auto-Logik das Measure-Format und erzeugt „kkWh" |
| *Data labels → Locale* | `de-CH` | deterministische Schweizer Zahlendarstellung (1'234.56); Default ist das Host-Locale |
| *Layout* | fest wählen, nicht responsiv lassen | IBCS-Konsistenz über die 3 Seiten |
| *Interaction settings* | `Scale groups = OFF`, `Show global toolbar = OFF` | verhindert, dass Nutzer die Vergleichbarkeit zerschiessen |
| *Treat null as zeros* | **AUS** | fehlende ¼-h-Werte sind BLANK, nicht 0 — sonst rechnet Zebra −100 % gegen den Vergleich |
| *Invert* | auf **Bezugs-/Verbrauchszeilen** setzen, **nicht** auf Erzeugung | „Verbrauch über Vorjahr" ist schlecht, „Erzeugung über Vorjahr" ist gut |
| *Neutral variance color* | symmetrisch (rot → neutral → rot) für Bilanzdifferenzen | Abweichung ist in **beide** Richtungen kritisch |

---

## 6 — Seite 1: Energiebilanz Netz

**Zweck:** Woher kommt die Energie, wohin geht sie, was geht verloren. Für Geschäftsleitung
und Netzführung. **Leitgrösse MWh.**

| # | Visual | Buckets / Felder | Einstellungen |
|---|---|---|---|
| 1.1 | **Zebra BI Cards** | *Group:* `dim_zeitreihe[bilanz_position]` (gefiltert auf 5 KPI-Zeilen) · *Values:* `Energie MWh` · *Previous Year:* `Energie MWh VJ` · *Plan:* `Energie MWh VM` · *Category (trend):* `dim_date[year_month]` | Row Layout; Scaled groups **nicht** über Einheiten hinweg mischen. **Voraussetzung:** KPI-Liste muss eine **Dimension** sein — Zebra-Doku: *„If you organize KPIs as measures, you will not get the desired result."* Sonst 1.1b |
| 1.1b | *(Fallback)* **native Karten ×5** | `Einspeisung MWh`, `Verbrauch MWh`, `Erzeugung MWh`, `Netzverluste MWh`, `Verlustquote %` | Nur wenn 1.1 nicht umsetzbar; hier dann die expliziten Δ-Measures verwenden |
| 1.2 | **Zebra BI Tables — Energiebilanz** | *Category:* `dim_zeitreihe[bilanz_position]` (**flach**, nicht hierarchisch) · *Category Class:* `Bilanz Zeilentyp` · *Values:* `Energie MWh` · *Previous Year:* `Energie MWh VJ` · *Plan:* `Energie MWh VM` | Sortierung `bilanz_sort` (**zwingend**, s. u.); Δ-Spalten von Zebra automatisch; `Invert` kommt aus `Category Class`, nicht per Rechtsklick |
| 1.3 | **Zebra BI Charts — Wasserfall** | *Category:* `dim_zeitreihe[bilanz_position]` · *Values:* `Energie MWh` | Einzel-Measure-Wasserfall: Zwischensummen per Rechtsklick als `Result`; Achsen-Cutoff **deaktivieren** (verzerrt Mengenbrücken) |
| 1.4 | **Zebra BI Tables — Bilanzwächter** | *Category:* Textkonstanten · *Values:* `Bilanzdifferenz Aufkommen MWh`, `… Verwendung MWh`, `… Verluste MWh`, `Vollständigkeit %` | Neutral variance color **symmetrisch**; Sollwert 0 |

**Zeilenaufbau der Bilanztabelle (1.2 / 1.3):**

| `bilanz_sort` | `bilanz_position` | Serie | `bilanz_zeilentyp` |
|---|---|---|---|
| 10 | Bezug vorgelagerte Netze NE5 | 148730 | *(leer)* |
| 20 | Produktion NE5 | 148732 | *(leer)* |
| 30 | Produktion NE7 | 148738 | *(leer)* |
| 40 | Rücklieferung an vorgelagerte Netze NE5 | 148731 | `-` |
| 50 | **= Gesamteinspeisung Netz** | *Plug-Zeile* | `=` |
| 55 | *nachrichtlich: i-SE-Serie Gesamteinspeisung* | 183741 | `/` |
| 60 | Netzverluste NE5 | 148734 | `-` |
| 70 | Netzverluste NE6 | 148736 | `-` |
| 80 | Netzverluste NE7 | 148740 | `-` |
| 90 | PUZ | 150831 | `-` |
| 100 | **= Bruttolastgangsumme BLS/EN** | *Plug-Zeile* | `=` |
| 110 | *nachrichtlich: i-SE-Serie BLS/EN* | 148746 | `/` |
| 120 | *nachrichtlich: Bezüger NE5* | 148733 | `/` |
| 130 | *nachrichtlich: Bezüger NE7* | 148739 | `/` |
| 140 | *nachrichtlich: Virtueller Kundenpool* | 148745 | `/` |

> **Warum Plug-Zeilen statt der echten Serien als Result?** Zebra BI rechnet eine
> `=`-Zeile als laufende Summe der Zeilen darüber. Läge dort eine echte Serie mit eigenem
> Wert, würde dieser in die nächste Zwischensumme doppelt einfliessen. Die echte Serie
> steht deshalb direkt darunter als `/`-Zeile (sichtbar, zählt nicht mit) — und weil A1 und
> A3/A6 exakt aufgehen, **muss** der von Zebra berechnete Wert gleich der i-SE-Serie sein.
> Die Tabelle prüft sich damit selbst.
>
> **Zwei Fallstricke aus `LESSONS_LEARNED.md` §4:**
> 1. `Category` darf **nur die flache Ebene** enthalten, auf der die Plug-Zeilen liegen —
>    keine mehrstufige Hierarchie dazu.
> 2. Result-Zeilen sind **reihenfolgeabhängig**. Ohne `Sortieren nach Spalte → bilanz_sort`
>    bleiben sie leer oder falsch.

**Layout:** KPI-Karten oben (volle Breite), Bilanztabelle links (breit), Wasserfall rechts
oben, Bilanzwächter rechts unten (schmal).

---

## 7 — Seite 2: Lastprofil & Spitzenlast

**Zweck:** Wie verteilt sich die Last über Tag und Woche, wann liegt die Spitze. Für
Netzführung und Beschaffung. **Leitgrösse kW** (Leistung), Detailwerte in kWh.

| # | Visual | Buckets / Felder | Einstellungen |
|---|---|---|---|
| 2.1 | **Kartenreihe** | `Spitzenlast kW`, `Zeitpunkt Spitzenlast`, `Grundlast kW`, `Lastfaktor %`, `Benutzungsdauer h` | `Zeitpunkt Spitzenlast` ist Text → nur als Karte/Textspalte, nie im Values-Bucket eines Zebra-Visuals |
| 2.2 | **Zebra BI Charts — Line** | *Category:* `fakt_lastgang[intervall_start]` · *Values:* `Energie kWh` · *Plan:* `Energie MWh VT` (→ als „Vortag" umbenennen) | **Line, nicht Column** — Zebra-Doku: Säulendiagramme nur bei 6–12 Kategorien; ein ¼-h-Lastgang gehört nie in ein Säulendiagramm |
| 2.3 | **Zebra BI Charts — Small Multiples (Tagesgang)** | *Category:* `fakt_lastgang[stunde]` · *Values:* `Leistung Ø kW` · *Group:* `dim_date[day_name_short]` | Ein Chart je Wochentag, Y-Achse automatisch synchronisiert; *Sort:* `Original order` + `Sort by column` auf `day_of_week` |
| 2.4 | **Zebra BI Charts — Column** | *Category:* `fakt_lastgang[stunde]` · *Values:* `Leistung Ø kW` · *Previous Year:* `Spitzenlast kW` | 24 Kategorien; Mittelwert gegen Spitze je Stunde — zeigt die Spreizung |
| 2.5 | **Matrix (nativ) — Lastteppich** | *Zeilen:* `dim_date[full_date]` · *Spalten:* `fakt_lastgang[stunde]` · *Werte:* `Leistung Ø kW` | Bedingte Formatierung Farbskala; klassische Heatmap, die Zebra BI nicht abdeckt |
| 2.6 | **Slicer** | `dim_zeitreihe[zeitreihe_name]`, Einzelauswahl, Standard `Gesamteinspeisung Netz (…)` | **Zwingend Einzelauswahl** — bei Mehrfachauswahl summiert 2.2 über überlappende Serien |

**Layout:** KPI-Leiste oben, Lastgangkurve (2.2) darunter über die volle Breite,
Small Multiples links unten, Lastteppich rechts unten.

> **Performance-Hinweis:** 2.2 rendert bei einem Monat ~2'976 Punkte je Serie über
> DirectQuery. Der Index `(zeitreihe_key, datum_key)` auf `fakt_lastgang` deckt das ab.
> Bei Zeiträumen > 3 Monate stattdessen auf `Leistung Ø kW` je Stunde wechseln
> (2.4-Muster) — oder eine Stunden-/Tagesaggregation im Mart ergänzen (offener Punkt
> „Aggregationsebene für Power BI" in [`TASKS.md`](../../TASKS.md)).

---

## 8 — Seite 3: Zeitreihen & Entwicklung

**Zweck:** Vergleich der 41 Serien untereinander und über die Zeit; Erzeugung im
Vorjahres-/Vormonatsvergleich. Für Fachbereich und Controlling. **Leitgrösse MWh.**

| # | Visual | Buckets / Felder | Einstellungen |
|---|---|---|---|
| 3.1 | **Zebra BI Tables — Serienübersicht** | *Category:* `serien_kategorie` → `zeitreihe_name` · *Values:* `Energie MWh`, `Spitzenlast kW`, `Lastfaktor %` · *Previous Year:* `Energie MWh VJ` · *Plan:* `Energie MWh VM` | `Spitzenlast kW` und `Lastfaktor %` als **Zusatzspalten** in eigene *Scale Groups* legen (andere Einheit/Grössenordnung) und **nicht** als Szenario markieren — sonst rechnet Zebra unsinnige Abweichungen darauf. **Zwischensummen ausschalten** (Serien überlappen sich, s. Abschnitt 3) |
| 3.2 | **Zebra BI Charts — Small Multiples** | *Category:* `dim_date[year_month]` · *Values:* `Energie MWh` · *Previous Year:* `Energie MWh VJ` · *Group:* `dim_zeitreihe[zeitreihe_name]` | *Top N* = 12 + „Others"; *Layout:* `Largest first`. **Gegenmassnahme zur geteilten Y-Achse:** bei 41 Serien mit stark unterschiedlicher Grössenordnung drücken die grossen die kleinen auf eine flache Linie — deshalb Top N, oder je `serien_kategorie` eine eigene Small-Multiples-Gruppe |
| 3.3 | **Zebra BI Charts — Column (Erzeugung)** | *Category:* `dim_date[year_month]` · *Values:* `Erzeugung MWh` · *Previous Year:* `Erzeugung MWh VJ` · *Plan:* `Erzeugung MWh VM` | Layout `Integrated variance`; **kein** `Invert` (mehr Erzeugung = gut) |
| 3.4 | **Zebra BI Charts — Column (Verbrauch)** | *Category:* `dim_date[year_month]` · *Values:* `Verbrauch MWh` · *Previous Year:* `Verbrauch MWh VJ` · *Plan:* `Verbrauch MWh VM` | Layout `Integrated variance`; **`Invert` setzen** (mehr Verbrauch = ungünstig) |
| 3.5 | **Zebra BI Tables — Lieferanten** | *Category:* `dim_zeitreihe[referenz]` (gefiltert `serien_kategorie = "Lieferant"`) · *Values:* `Energie MWh` · *Previous Year:* `Energie MWh VJ` | Die Saldo-Serien (`Gesamtlieferung minus Gesamtrücklieferung LF`) auf `/` Skip setzen — sie sind über B2 aus den beiden anderen Zeilen ableitbar und würden doppelt zählen |
| 3.6 | **Drill-through-Seite `DT Zeitreihe`** | `zeitreihe_name`, `zeitreihe_exportschluessel`, `referenz`, `referenz_art`, `standort`, `bezuegeranlage`, `einheit`, `zeitschritt_min`, `gueltig_von`/`bis` + Lastgangkurve | Drill-through-Feld `dim_zeitreihe[zeitreihe_name]`; Seite ausblenden (Rechtsklick → *Seite ausblenden*), Zurück-Button wird automatisch erzeugt |

**Layout:** Serienübersicht links (volle Höhe), Erzeugung/Verbrauch rechts oben nebeneinander,
Small Multiples rechts unten. Lieferantentabelle über Bookmark oder als zweiter Tab.

---

## 9 — Umsetzungs-Reihenfolge

| Schritt | Aktion | Tool | Status |
|---|---|---|---|
| 1 | `dim_date` als Datumstabelle markieren (2.1) | PBI MCP `table_operations` | ✅ **erledigt** 2026-08-28 |
| 2 | Beziehungen korrigieren: Kardinalität + Filterrichtung (2.2/2.3) | PBI MCP `relationship_operations` | ✅ **erledigt** — alle 5 auf Many→One / OneDirection |
| 3 | Auto-Datum/Uhrzeit deaktivieren (2.4) | PBI MCP `model_operations` | ✅ **erledigt** — Annotation auf `0`; in Desktop gegenprüfen |
| 4 | Measures `01 Basis`, `02 Leistung`, `05 Qualität` anlegen | PBI MCP `measure_operations` | ✅ **erledigt** — inkl. `03 Netzbilanz` (s. u.) |
| 5 | dbt: `dim_zeitreihe` materialisieren + Bilanz-Seed + Plug-Zeilen (2.5) | dbt / `dv-toolkit:mart-architect` | 📋 **TODO — als Task in [`TASKS.md`](../../TASKS.md) erfasst.** Einziger echter Blocker für Seite 1 |
| 6 | Measures `04 Zeitvergleich`, `06 Zebra-Steuerung` | PBI MCP `measure_operations` | ✅ **erledigt** 2026-08-28 — 18 Measures, bis auf `Bilanz Zeilentyp` (braucht Spalte aus Schritt 5) |
| 7 | Seite 1 (Energiebilanz) bauen | PBI Desktop + Zebra BI | ⬜ offen — braucht 5, 6 |
| 8 | Seite 2 (Lastprofil) bauen | PBI Desktop + Zebra BI | ⬜ offen — **nicht blockiert**, kann sofort starten |
| 9 | Seite 3 (Zeitreihen) bauen | PBI Desktop + Zebra BI | ⬜ offen — braucht 6 |
| 10 | Sync-Slicers, Drill-through, Theme-JSON (Locale `de-CH`, Units `Power BI`) | PBI Desktop | ⬜ offen — braucht 7–9 |
| 11 | Backfill-Export anfordern (X-2) → Zeitvergleiche werden gefüllt | EWB | ⬜ offen |

> **Abweichung von der ursprünglichen Sequenz:** Ordner `03 Netzbilanz` wurde in Schritt 4
> vorgezogen. Grund: Die dortigen Measures selektieren ihre Serien über `zeitreihe_id` und
> brauchen den dbt-Seed aus Schritt 5 gar nicht — nur `Erzeugung PV MWh` und
> `Erzeugung Wasser MWh` (über `serien_kategorie`) warten noch darauf. Ohne `03` wären die
> drei Bilanzwächter in `05 Qualität` nicht lauffähig gewesen.
>
> **Verifikation nach Schritt 1–4** (gegen das laufende Modell gemessen):
>
> | Prüfung | Ergebnis |
> |---|---|
> | `PREVIOUSDAY` über Jahr/Monat/Tag-Slicer (vorher BLANK) | 2'016'791,57 ✓ |
> | `Bilanzdifferenz Aufkommen MWh` | 0 ✓ |
> | `Bilanzdifferenz Verwendung MWh` | 2·10⁻⁹ ✓ |
> | `Bilanzdifferenz Verluste MWh` | 4·10⁻⁹ ✓ |
> | `Abweichung ¼h vs. Monat MWh` (Cube-Regression) | 0 ✓ |
> | `Vollständigkeit %` | 100 % ✓ |
> | `Spitzenlast kW` (Gesamteinspeisung Netz) | 10'707,8 kW am 06.08.2026 11:30 ✓ |
> | `Lastfaktor %` / `Benutzungsdauer h` | 64,4 % / 92,8 h ✓ |

> Schritt 8 ist **nicht** vom Backfill abhängig — Seite 2 funktioniert vollständig mit den
> vorhandenen 6 Tagen und ist deshalb der schnellste sichtbare Fortschritt für den
> Fachbereich.

---

## 10 — Referenz

### Datenstand zum Zeitpunkt der Planung (2026-08-28)

| | |
|---|---|
| Zeitreihen | 41 (Gruppe 150 „ewb_Power BI"), alle `kWh`, Zeitschritt 15 min |
| ¼-h-Werte im Mart | 23'616 (02.–07.08.2026, 6 Tage × 96 × 41) |
| Monatsaggregat | 1 Zeile je Serie für `2026/08` |
| Referenzarten | 38 Marktpartner, 3 Messpunkt (mit Standort/Bezügeranlage) |
| Negative Werte | 95 Zeilen — ausschliesslich Saldo-Serien (`Gesamtlieferung minus Gesamtrücklieferung LF`), fachlich korrekt |
| Nullserien | `Gesamtrücklieferung LF lokal` (EPAG, Primeo), `EWB Wasser KEV Rücklieferung` |
| Letzter dbt-Lauf | 19.08.2026 11:26 (`datavault-dev`) |

### Serien-Zuordnung (41 = 16 + 10 + 12 + 3)

| Gruppe | Anzahl | Referenz |
|---|---|---|
| Netzbilanz | 16 | `Elektrizitäts- und Wasserwerk der Stadt Buchs <Netz>` |
| Lieferant | 10 | Alpiq / EPAG / Primeo — genau die 10 Serien, die im Innosolv-Cube fehlen |
| Erzeugung PV / Wasser | 12 | `Auswertungen` |
| Messpunkt | 3 | `CH1008…` — Turbine 95 kVA, TW Turbine 680 kW, Summenmessung VFA |

### Wichtige Modell-Attribute

| Tabelle | Attribute für Berichte |
|---|---|
| `dim_zeitreihe` | `zeitreihe_name` (eindeutig), `zeitreihe_typ`, `referenz`, `referenz_art`, `standort`, `bezuegeranlage`, `einheit`, `zeitschritt_min`, `gruppe_reihenfolge` — **neu:** `serien_kategorie`, `flussrichtung`, `netzebene`, `bilanz_position`, `bilanz_zeilentyp`, `bilanz_sort` |
| `dim_date` | `full_date`, `year`, `year_month`, `month_name_short`, `day_name_short`, `day_of_week`, `is_weekend`, `iso_week` |
| `fakt_lastgang` | `wert_kwh`, `intervall_start`, `messzeitpunkt`, `datum_key`, `jahr_monat`, `stunde`, `minute` |
| `fakt_lastgang_monat` | `summe_kwh`, `min_kwh`, `max_kwh`, `mittel_kwh`, `anzahl_werte` — entspricht 1:1 den Cube-Measures Summe/Minimum/Maximum |

### Zebra-BI-Regeln, die hier den Ausschlag geben

1. **Szenario = Bucket, nicht Name.** `Values` → AC, `Previous Year` → PY, `Plan` → PL,
   `Forecast` → FC. Ein Vergleichs-Measure im `Values`-Bucket wird nicht als Szenario erkannt
   (ein zweites Values-Measure erzeugt stattdessen ein Combo-Chart mit Sekundärachse).
2. **Keine Δ-Measures.** Absolute und relative Abweichungen rechnet Zebra BI selbst.
3. **BLANK ≠ 0.** Fehlende ¼-h-Werte müssen BLANK liefern; `Treat null as zeros` ausschalten.
   Ein echter Nullverbrauch bleibt eine 0 — die Unterscheidung trägt der Mart.
4. **Kein `FORMAT()` in Measures** — macht aus der Zahl Text und zerstört die Varianzlogik.
   Einheiten über den Format-String bzw. Dynamic Format Strings.
5. **Units nie auf `Auto`** bei mehreren Visuals je Seite — sonst zeigt ein Visual K und das
   nächste M. Auf `Power BI` stellen und die Einheit im Measure fixieren.
6. **Nicht-additive Kennzahlen** (`Spitzenlast kW`, alle `%`-Quoten) nie als Szenario
   markieren und Summenzeilen dafür ausschalten.
7. **`Invert` ist eine Metadaten-Entscheidung**, keine Rechenoperation: Werte bleiben positiv,
   die Bedeutung wird im Visual bzw. über `Category Class` gesetzt.
8. **Ein Small-Multiples-Visual schlägt n Einzelvisuals** — ein Data Fetch statt n. Bei
   DirectQuery auf ¼-h-Daten der entscheidende Performance-Hebel.

### Quellen

- `docs/issues/2026-07-06_edm-ise-olap-cube-anbindung.md` §12 — Herkunft, Dedup-Regeln,
  Cube-Abgleich, offene Punkte X-1 bis X-6
- `docs/LESSONS_LEARNED.md` §1, §3, §4 — Materialisierung, DAX-Fallstricke, Zebra BI Tables
  „Category Class"
- `docs/power-bi/erfolgsrechnung-report-plan.md`, `konto-hierarchie-und-kern-measures.md` —
  Muster für Zwischensummen über Pflegetabellen
- help.zebrabi.com — Tables, Tables+, Charts, Cards, Data Modeling, Reporting Best Practices,
  Styling & Design
