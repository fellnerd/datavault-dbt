# Summary-Lines-Monatstabelle — Plan

> **Status:** Geplant (noch nicht umgesetzt)
> **Anlass:** DirectQuery-Performance der Calculation Group "Summary Lines" ist zu langsam
> **Bezug:** Ersetzt/aktualisiert Massnahme 2 aus `docs/ext-features/pbi-performance-optimization.md`
> (der dortige Plan beschreibt noch die alte SWITCH+CALCULATE+REMOVEFILTERS-Architektur vor
> der Umstellung auf Business Vault (`konto_pl_zuordnung_v`/`konto_pl_stufen_v`) und die
> Calculation Group "Summary Lines" — beide Dokumente adressieren dasselbe Kernproblem
> unterschiedlicher Architektur-Generationen. Empfehlung: alten Plan nach Umsetzung archivieren.

---

## Ausgangslage

Die Calculation Group "Summary Lines" (12 Items, siehe `docs/power-bi/` Kontext) berechnet
jede Zelle einer Tabelle/Matrix live über:

```dax
CALCULATE(SELECTEDMEASURE(), KEEPFILTERS(FILTER('konto_pl_zuordnung_v', ...)))
```

Bei DirectQuery erzeugt das pro Zelle einen SQL-Roundtrip mit Beziehungs-Traversierung
(`konto_pl_zuordnung_v` → `dim_konto` → `fakt_buchungen`/`fakt_budget`). Bei 12 Items ×
mehreren Measures × mehreren Monaten summiert sich das spürbar auf (User-Feedback: "dauert
sehr lange").

**Idee:** Eine dbt-materialisierte Tabelle auf Monatsgranularität, die die 6 P&L-Stufen
bereits vorberechnet enthält — Power BI liest dann nur noch kleine, fertige Zahlen statt bei
jedem Render die Aggregation live zu rechnen.

---

## Wichtige Abgrenzung (Lehre aus der Architektur-Diskussion zu `dim_konto_v`)

Diese Tabelle darf **nicht** in dieselbe atomare Fakttabelle (`fakt_buchungen`) gemischt
werden — sonst Doppelzählungsrisiko bei "Summe über alles"-Abfragen (siehe Diskussion weiter
oben in der Session zu Business Vault vs. Raw Vault). Sie ist eine **eigenständige,
vorberechnete Aggregat-Tabelle**, die nie mit der Detail-Fact zusammen abgefragt wird.

---

## Vorschlag: Tabellendesign

**Name:** `mart_finance.fakt_pl_summary_monat` (Arbeitstitel, zur Diskussion)

**Grain:** `(jahr, monat, stufe, szenario)`

| Spalte | Typ | Bedeutung |
|--------|-----|-----------|
| `jahr` | int | Jahr (ab 2026, siehe unten) |
| `monat` | int | 1–12 |
| `stufe` | int | 1–6, FK auf `konto_pl_stufen_v.stufe` |
| `subtotal_label` | nvarchar | Denormalisiert aus `konto_pl_stufen_v` (z.B. "4x Bruttoergebnis") — spart einen Join fürs Anzeigen |
| `konto_sort` | int | Denormalisiert aus `konto_pl_stufen_v` — für Sortierung ohne Join |
| `szenario` | nvarchar | 'Actuals' \| 'Budget' \| 'Forecast' (siehe Punkt 1) |
| `betrag` | decimal | Kumulierte Summe (Ertrag ... Stufe X) |
| `dss_load_date` | datetime2 | Standard DV-Metadaten |
| `dss_record_source` | nvarchar | Standard DV-Metadaten |

**Bewusst NICHT enthalten:** Kostenstelle, Konto-Detail, Tages-Granularität — siehe Punkt 3.

---

## Offene Punkte — mit Empfehlung

### 1. Welche Szenarien?

| Szenario | Quelle | Empfehlung |
|----------|--------|------------|
| Rechnung (Actuals) | `fakt_buchungen` | **Ja** — Kernbedarf, aktuell der langsame Teil |
| Budget | `fakt_budget` | **Ja** — im gezeigten Tabellen-Visual bereits verwendet |
| Forecast | `fakt_forecast` | **Ja, gleich mit aufnehmen** — strukturell derselbe Aufwand, wird im Modell bereits genutzt (`Total Forecast`, `Forecast Selector`); separat nachzuziehen wäre unnötige Doppelarbeit |
| Vorjahr | ? | **Nein, nicht als eigene Zeile persistieren.** Zu klären: Ist `Vorjahr` im Modell eine echte eigene Quelle oder Zeitintelligenz (`SAMEPERIODLASTYEAR`) auf `Rechnung`? Falls Zeitintelligenz (wahrscheinlich): kann direkt in DAX über dieselbe Tabelle (Jahr−1-Lookup) berechnet werden, ohne Datenduplikation. **Muss vor Umsetzung verifiziert werden** (kurzer Check der bestehenden `Vorjahr`-Measure-Definition). |

### 2. Zeitraum

**Bestätigt: ab Jahr 2026.** `WHERE jahr >= 2026`, Materialisierung als `table` (Vollneuberechnung
pro `dbt run` — Datenvolumen trivial klein: 6 Stufen × 3 Szenarien × 12 Monate × wenige Jahre
≈ niedrige dreistellige Zeilenzahl, kein Grund für incremental).

### 3. Weitere Dimensionen — Vorschläge, um "nicht zu aufgebläht" zu bleiben

- **Kostenstelle NICHT mit aufnehmen.** Multipliziert die Zeilenzahl um Faktor ~50+ (Anzahl
  Kostenstellen) und ist aktuell nicht gefordert. Falls später gebraucht: eigene,
  separate Tabelle (`fakt_pl_summary_kostenstelle_monat`) statt diese hier zu überladen —
  unterschiedliche Anwendungsfälle (Gesamt-Trend vs. Kostenstellen-Drill) sollten nicht
  dieselbe Tabelle teilen.
- **Keine YTD-Vorberechnung.** `TOTALYTD` in DAX über eine bereits kleine, monatsgranulare
  Tabelle ist performant genug — muss nicht zusätzlich in SQL vorgerechnet werden (vermeidet
  weitere Spalten/Komplexität für marginalen Nutzen).
- **Denormalisierte Label/Sort-Spalten (`subtotal_label`, `konto_sort`) mit aufnehmen** —
  kostet nichts an Zeilen (nur 2 zusätzliche Spalten je Zeile), erspart aber einen Join
  in jedem Bericht, der diese Tabelle nutzt.

---

## Nächste Schritte (nach Freigabe)

1. `Vorjahr`-Measure-Definition im Modell prüfen (Zeitintelligenz vs. eigene Quelle)
2. `models/mart/finance/fakt_pl_summary_monat.sql` bauen (Business Vault liefert die
   Stufen-Logik, analog zur Calculation Group — SQL-Äquivalent von
   `ab_stufe <= N`, kumulativ pro Szenario)
3. Deploy + Verifikation gegen die Calculation-Group-Werte (gleiches Muster wie beim
   `dim_konto_v`-Refactor: Alt-vs-Neu-Abgleich vor Umstellung des Visuals)
4. Visual in Power BI auf die neue Tabelle umstellen (User-Aufgabe, nicht dbt)
5. Alten Plan (`pbi-performance-optimization.md`) archivieren oder aktualisieren

**Nicht Teil dieses Plans:** Die Calculation Group "Summary Lines" bleibt für alle
Anwendungsfälle bestehen, die diese Monatstabelle nicht abdeckt (andere Granularität,
Kostenstellen-Drill, Ad-hoc-Filter). Diese Tabelle ist ein Fast-Path für den Hauptfall
(Monatstrend Gesamt), keine vollständige Ablösung.
