# i-SE Energie- und Netzbilanz — Struktur nach EWB-Vorlage

**Stand:** 29. August 2026 · **Status:** Seed erstellt, Mart-Objekte noch nicht gebaut
**Quelle:** Drei Screenshots der bestehenden EWB-Auswertungen (NETZ 2025, ENERGIE 2026, GESAMT)
**Seed:** [`seeds/seed_ise_bilanz.csv`](../../../seeds/seed_ise_bilanz.csv)
**Bezug:** [`docs/power-bi/ise-lastgang-report-plan.md`](../../../docs/power-bi/ise-lastgang-report-plan.md) §6

---

## 1. Warum die EWB-Vorlage massgeblich ist

Die von EWB gelieferten Auswertungen sind bereits im Produktiveinsatz und fachlich abgestimmt.
Ihre Excel-Logik bildet **exakt** das ab, was Zebra BI Tables über „Category Class" abbildet:

| EWB-Excel | Zebra BI Tables |
|---|---|
| Spalte „Element" / „Energieportfolio" | `bilanz_position` (Category) |
| Checkbox „Abzug" ☑ | `bilanz_zeilentyp` = `-` (Invert) |
| Fett gesetzte Zwischensummen | `bilanz_zeilentyp` = `=` (Result) |
| Zeilenreihenfolge | `bilanz_sort` (Sort by column) |
| Zeile „Kontrolle → 0?" | Wächter-Measure, Sollwert 0 |
| Spalte „OK" | nicht übernommen (manuelle Sichtprüfung) |

Deshalb werden Zeilenbeschriftungen und Reihenfolge **übernommen, nicht neu erfunden**.

## 2. Abweichung zur ursprünglich geplanten Struktur

Die im Berichtsplan §3 hergeleiteten Bilanzgleichungen stimmen rechnerisch, schneiden die
Zwischensummen aber anders. Massgeblich ist die EWB-Struktur:

| | Berichtsplan §3 (verworfen) | EWB (massgeblich) |
|---|---|---|
| Gesamteinspeisung | Bezug + Prod5 + Prod7 − Rückspeisung, entspricht Serie 183741 | Bezug + Prod5 + Prod7 — **ohne** Abzug der Rückspeisung |
| Zwischenstufe | — | `Gesamtbezug Netz` = Gesamteinspeisung − Rückspeisung − PUZ |

> Serie **183741 „Gesamteinspeisung Netz"** ist damit **nicht** die EWB-„Gesamteinspeisung",
> sondern entspricht `Gesamtbezug Netz + PUZ`. Die Namensgleichheit ist eine Falle.

## 3. NETZ-Bilanz (physikalisch)

Nachgerechnet gegen den EWB-Screenshot, Jahr 2025:

| Sort | Position | Serie | Typ | 2025 (kWh) |
|---|---|---|---|---|
| 10 | NÜST Einspeisung von | 148730 | | 23'028'285 |
| 20 | Produktion NE5 | 148732 | | 83'915'161 |
| 30 | Produktion NE7 | 148738 | | 8'657'057 |
| 40 | **Gesamteinspeisung** | *Plug* | `=` | **115'600'503** |
| 50 | Rückspeisung an SAK | 148731 | `-` | −49'893'884 |
| 60 | PUZ | 150831 | `-` | −280'689 |
| 70 | **Gesamtbezug Netz** | *Plug* | `=` | **65'425'930** |
| 80 | Verlust | 148741 | `-` | −2'100'303 |
| 90 | **Bruttolastgang** | *Plug* | `=` | **63'325'627** |
| 100 | NE5 Bezug | 148733 | `-` | −13'558'304 |
| 110 | NE7 Bezug (gerechnet) | 148748 − 150831 | `-` | −49'767'325 |
| 120 | **Kontrolle → 0?** | *Plug* | `=` | **−2** |
| 130 | Referenz BLS/EN | 148746 | `/` | 63'325'628 |

## 4. ENERGIE-Bilanz (Absatz und Beschaffung)

Nachgerechnet gegen den EWB-Screenshot, Jahr 2026:

| Sort | Position | Serie | Typ | 2026 (kWh) |
|---|---|---|---|---|
| 10 | Grundversorgung | 150812 | | 5'243'417 |
| 20 | virtueller Kundenpool (PUZ-bereinigt) | 148745 − 150831 | | 16'613'968 |
| 30 | Pumpenstrom (PUZ) | 150831 | | 142'878 |
| 40 | Kunden B2B (LF EPAG) | 150823 | | 1'045'282 |
| 50 | Kunden B2B (LF Primeo) | 150828 | | 1'434'539 |
| 60 | **Absatz Energie** | *Plug* | `=` | **24'480'084** |
| 70 | Verluste | 148741 | | 1'045'235 |
| 80 | **Beschaffungsbedarf** | *Plug* | `=` | **25'525'318** |
| 90 | KW Eigene NE5 | 171958 | `-` | −6'168'965 |
| 100 | KW PVA NE5 (eigen/fremde) | 187846 | `-` | −39'528 |
| 110 | Einspeisung PV ewb Anlagen NE7 | 185780 | `-` | −1'740'807 |
| 120 | Einspeisung PV Anlagen NE7 | 178623 | `-` | −2'437'605 |
| 130 | PV kein Eigenverbrauch NE7 | 178624 | `-` | −48'095 |
| 140 | PV Plug&Play (ohne Prod. Zähler) | 178759 | `-` | −4'572 |
| 150 | Marktbeschaffung Grundversorgung | 150816 | `-` | −12'682'601 |
| 160 | Marktbeschaffung B2B EPAG | 150825 | `-` | −1'045'282 |
| 170 | Marktbeschaffung B2B Primeo | 150830 | `-` | −1'434'539 |
| 180 | **Kontrolle** | *Plug* | `=` | **−76'676** |

> ⚠ Die ENERGIE-Kontrolle geht bei EWB **nicht** auf: −76'676 kWh gegen 25,5 Mio
> Beschaffungsbedarf (≈ 0,3 %). Die NETZ-Kontrolle liegt bei −2 kWh und ist sauber.
> Fachlich zu klären, bevor der Bericht produktiv geht — der Bericht wird die Lücke
> sichtbar machen, nicht verursachen.

## 5. Damit beantwortet: welche PV-/Wasser-Serien gelten

Die ENERGIE-Bilanz zeigt, welche Teilmenge EWB tatsächlich verwendet — die bisher offene
Frage aus [`TASKS.md`](../../../TASKS.md):

| | Verwendet | Nicht verwendet |
|---|---|---|
| PV | 187846, 185780, 178623, 178624, 178759 | 178757 `PV KEV`, 171926 `EWB PV KEV`, 187139 `PV EV Überschuss Dritte` |
| Wasser | 171958 `EWB Wasser regelbar` | 178761 `Wasser KEV`, 171956 `EWB Wasser KEV` |

Fachlich schlüssig: KEV-Anlagen speisen in die nationale Förderung ein und gehören nicht ins
EWB-Beschaffungsportfolio. **Vom Fachbereich bestätigen lassen**, bevor der Seed final wird.

## 6. Seed-Aufbau

Grain: **eine Zeile je (Bilanz, Position, Komponente)**. Eine Position kann aus mehreren
Serien bestehen — deshalb die Spalte `faktor`:

| Spalte | Bedeutung |
|---|---|
| `bilanz` | `NETZ` oder `ENERGIE` |
| `bilanz_sort` | Zeilenreihenfolge; identisch für alle Komponenten einer Position |
| `bilanz_position` | Zeilenbeschriftung (Category) |
| `zeitreihe_id` | Quellserie; **leer** bei Plug-Zeilen (Zwischensummen) |
| `faktor` | `+1` / `−1` innerhalb der Position — nur für zusammengesetzte Positionen relevant |
| `bilanz_zeilentyp` | Zebra Category Class: leer = Detail, `-` = Invert, `=` = Result, `/` = Skip |
| `bemerkung` | Klartext-Herkunft, nicht im Modell verwendet |

Nur zwei Positionen sind zusammengesetzt:
`NE7 Bezug (gerechnet)` = 148748 − 150831 und
`virtueller Kundenpool (PUZ-bereinigt)` = 148745 − 150831.

Das `faktor`-Konzept ist bewusst gewählt, damit diese beiden Zeilen **datengetrieben** bleiben
und nicht als Sonderfall-DAX im Bericht landen.

## 7. Was daraus im Mart gebaut werden muss

Weil eine Bilanzposition aus mehreren Serien bestehen kann, ändert sich das Grain — die
Zuordnung passt **nicht** mehr als Attributspalte an `dim_zeitreihe`:

```
seed_ise_bilanz                       (34 Zeilen, manuell gepflegt)
  └── ise_bilanz_position_v           Business-Vault-View auf den Seed
        └── dim_bilanz_position_v     Dimension: 1 Zeile je (bilanz, position)
                                      → Category, Category Class, Sort
        └── fakt_bilanz               Fakt: 1 Zeile je (bilanz, position, jahr_monat)
                                      = SUM(fakt_lastgang_monat.summe_kwh × faktor)
```

`fakt_bilanz` ist winzig (2 Bilanzen × ~20 Positionen × Monate) und speist Seite 1 vollständig.
Die ¼-h-Faktentabelle bleibt für Seite 2 (Lastprofil) zuständig.

**Warum nicht auf `dim_zeitreihe`:** Eine Serie kann in mehreren Positionen und mehreren
Bilanzen auftreten (150831 PUZ erscheint viermal, 148741 in beiden Bilanzen). Als Attribut an
der Zeitreihe wäre das nicht abbildbar.
