# Erfolgsrechnung — Wie setzen sich die Werte zusammen?

> Erklärhilfe für den Fachbereich: wie die Zebra-BI-Tabelle "Erfolgsrechnung"
> aufgebaut ist und woher jede Zeile/Spalte ihren Wert bekommt.
> Stand: 2026-07-30.
>
> **Hinweis:** Die früher parallel existierenden `KPI …`-Measures und die
> Calculation Group "Summary Lines" werden auf dieser Berichtsseite **nicht
> mehr verwendet** — sie sind durch die hier beschriebenen zwei Pflegetabellen
> abgelöst. Details dazu am Ende des Dokuments.

---

## 1. Aufbau der Tabelle auf einen Blick

| Element | Was es zeigt |
|---|---|
| **Zeilen** | Kontogruppe (z. B. "3 Ertrag") → aufklappbar bis zur Konto-Subgruppe (z. B. "40 Aufwand Production & Einkauf") |
| **Spalten** | Vorjahr, Budget, Rechnung — daneben automatisch berechnete Differenzen (ΔPY, ΔPY%, ΔPL) |
| **Fett gedruckte Zeilen** (`3 Ertrag`, `4x Bruttoergebnis`, …) | Zwischensummen der Erfolgsrechnung — keine echten Konten, sondern Kennzahlen-Meilensteine |

## 2. Die drei Wert-Spalten

- **Rechnung** — Summe der tatsächlich verbuchten Beträge aus dem Hauptbuch (Ist-Werte des laufenden Jahres, je nach Monats-/Jahresfilter oben).
- **Vorjahr** — dieselbe Summe, aber ein Jahr zurückversetzt — reiner Zeitvergleich, keine eigene Datenquelle.
- **Budget** — die geplanten Werte aus der Budgetierung (separater Planungsprozess, nicht aus den Buchungen).
- **ΔPY / ΔPY% / ΔPL** — rechnet Zebra BI automatisch aus den drei Spalten aus, keine eigene Pflege nötig.

## 3. Woher kommt "3 Ertrag", "4 Aufwand", … ursprünglich? Die volle Kette

Vier Stationen, von der einzelnen Buchung bis zur Zeile im Bericht:

1. **Buchung im Hauptbuch** — jede Buchung hat eine Konto-Nummer, z. B. `30100`
   oder `40100`. Das ist die einzige "harte" Information aus der Buchhaltung
   selbst.
2. **Sharepoint-Kontenplan** — pflegt die Buchhaltung selbst, ordnet jeder
   Konto-Nummer eine Subgruppe (`Konto_L1`) und eine Hauptgruppe (`Konto_L2`)
   zu. **Konkretes Beispiel aus den echten Stammdaten:**

   | Konto-Nr. | Konto_L1 (Subgruppe) | Konto_L2 (Hauptgruppe) |
   |---|---|---|
   | 30100 | 30 Ertrag Netz | **3 Ertrag** |
   | 40100 | 40 Aufwand Production & Einkauf | **4 Aufwand** |

   Der Text **"3 Ertrag"**, den du im Bericht als Zeile siehst, ist also
   wortwörtlich der Wert aus der Sharepoint-Spalte `Konto_L2` — nicht
   irgendwo im Bericht oder in einer Formel neu erfunden.
3. **Datenmodell (`dim_konto`)** — übernimmt `Konto_L1`/`Konto_L2` aus
   Sharepoint 1:1, mit einer einzigen Ausnahme: bei der Gruppe "6a" korrigiert
   das Modell einen bekannten Sharepoint-Darstellungsfehler (ein Umlaut wird
   in Sharepoint falsch dargestellt). Bei allen anderen Gruppen ist es
   exakt der Sharepoint-Text.
4. **Pflegetabelle (Business Vault)** — legt zusätzlich fest, in welcher
   **Reihenfolge** die Gruppen erscheinen (siehe Abschnitt 5a) und **ab
   welcher Zwischensumme** eine Gruppe mitgezählt wird (siehe Abschnitt 4).
   Diese Tabelle **erfindet keine neuen Gruppen-Namen** — sie verweist nur
   per Kürzel (z. B. `"3"`, `"6a"`) auf die aus Sharepoint kommenden Gruppen.

**Kurzform:** *Konto-Nummer → Sharepoint sagt "gehört zu 3 Ertrag" → Bericht
zeigt "3 Ertrag" genau so an → Pflegetabelle sagt "gehört an Position 1 und
zählt ab der ersten Zwischensumme mit".*

## 4. Woher kommen die fett gedruckten Zwischensummen genau? (die exakten Mengen)

Diese Zeilen sind **keine echten Konten** — es gibt dafür keine Buchungen.
Jede Zwischensumme ist die Summe von `Rechnung` (bzw. `Vorjahr`/`Budget`)
über eine **exakt definierte Menge von Kontogruppen** — genau wie es früher
in den `KPI …`-Measures fest einprogrammiert war, nur jetzt aus der
Pflegetabelle abgeleitet statt hartcodiert:

| Zwischensumme | Enthält genau diese Kontogruppen |
|---|---|
| **4x Bruttoergebnis** | `3 Ertrag`, `4 Aufwand` |
| **5x Bruttoergebnis mit Personal** | `3 Ertrag`, `4 Aufwand`, `5 Personalaufwand` |
| **6ax EBITDA** | `3 Ertrag`, `4 Aufwand`, `5 Personalaufwand`, `6a Uebriger Betriebsaufwand` |
| **6bx EBIT** | `3 Ertrag`, `4 Aufwand`, `5 Personalaufwand`, `6a Uebriger Betriebsaufwand`, `6b Abschreibungen` |
| **7x Betriebsergebnis** | `3 Ertrag`, `4 Aufwand`, `5 Personalaufwand`, `6a Uebriger Betriebsaufwand`, `6b Abschreibungen`, `6c Finanzierung`, `7 Umlagen` |
| **9x Ergebnis** | `3 Ertrag`, `4 Aufwand`, `5 Personalaufwand`, `6a Uebriger Betriebsaufwand`, `6b Abschreibungen`, `6c Finanzierung`, `7 Umlagen`, `8 Ausserord. & Betriebsfr. Ergebnis` |

Zum Vergleich — genau das stand früher in der Measure selbst:

```dax
KPI 4x Bruttoergebnis = CALCULATE(
    SUM('fakt_buchungen'[betrag]),
    REMOVEFILTERS('dim_konto'[konto_l2]),
    'dim_konto'[konto_l2] IN {"3 Ertrag","4 Aufwand"}
)

KPI 5x Bruttoergebnis mit Personal = CALCULATE(
    SUM('fakt_buchungen'[betrag]),
    REMOVEFILTERS('dim_konto'[konto_l2]),
    'dim_konto'[konto_l2] IN {"3 Ertrag","4 Aufwand","5 Personalaufwand"}
)
```

Jede Zwischensumme "erbt" also alle Gruppen der vorherigen plus genau eine
(oder zwei, bei `7x Betriebsergebnis`) neue Gruppe — daher die Bezeichnung
"kumulativ".

**Wichtig für das Verständnis:** Diese Mengen stehen **nirgends mehr als
Liste in einer Formel** — Zebra BI addiert beim Anzeigen automatisch alles,
was in der Tabelle **oberhalb** einer Zwischensumme steht. Die Pflegetabelle
legt nur fest, *an welcher Position* eine Zwischensumme eingefügt wird
(Abschnitt 5b) und *ab welcher Position* jede Kontogruppe mitzählt
(Abschnitt 5a) — die obige Tabelle ist das **Ergebnis** dieser beiden
Festlegungen, keine eigene Eingabe.

**"x Hilfskonten"** ist eine Sonderzeile: sie bleibt sichtbar, fließt aber in
**keine** der sechs Zwischensummen ein (z. B. rein technische/interne
Gegenkonten).

## 5. Die zwei Pflegetabellen dahinter

Alles in Abschnitt 3 und 4 kommt aus genau zwei kleinen, zentral gepflegten
Tabellen (ähnlich einer Excel-Liste, technisch ein dbt-Seed):

### a) Kontogruppen-Zuordnung — welche Gruppe, in welcher Reihenfolge, ab wann mitgezählt

| Kontogruppe | Reihenfolge | Zählt mit ab Zwischensumme … |
|---|---|---|
| 3 Ertrag | 1. | 4x Bruttoergebnis (ganz am Anfang) |
| 4 Aufwand | 2. | 4x Bruttoergebnis (ganz am Anfang) |
| 5 Personalaufwand | 3. | 5x Bruttoergebnis mit Personal |
| 6a Uebriger Betriebsaufwand | 4. | 6ax EBITDA |
| 6b Abschreibungen | 5. | 6bx EBIT |
| 6c Finanzierung | 6. | 7x Betriebsergebnis |
| 7 Umlagen | 7. | 7x Betriebsergebnis |
| 8 Ausserord. & Betriebsfr. Ergebnis | 8. | 9x Ergebnis (ganz am Ende) |
| x Hilfskonten | 9. (letzte) | **nirgends** — bleibt sichtbar, zählt aber nicht mit |

### b) Zwischensummen-Definition — Name und Position jeder Summenzeile

| Zwischensumme | Position in der Tabelle |
|---|---|
| 4x Bruttoergebnis | direkt nach "4 Aufwand" |
| 5x Bruttoergebnis mit Personal | direkt nach "5 Personalaufwand" |
| 6ax EBITDA | direkt nach "6a Uebriger Betriebsaufwand" |
| 6bx EBIT | direkt nach "6b Abschreibungen" |
| 7x Betriebsergebnis | direkt nach "7 Umlagen" |
| 9x Ergebnis | ganz am Ende |

**Wenn sich fachlich etwas ändert** (neue Kontogruppe, andere Reihenfolge,
andere Zuordnung zu einer Zwischensumme), reicht eine Anpassung in genau
diesen zwei Tabellen — die Tabelle im Bericht zieht das automatisch nach,
ohne dass am DAX/Bericht selbst etwas geändert werden muss.

## 6. Konkretes Beispiel: warum "5 Personalaufwand" nicht in "4x Bruttoergebnis" auftaucht

- "5 Personalaufwand" ist in der Zuordnungstabelle als "zählt mit ab
  5x Bruttoergebnis mit Personal" markiert.
- Die Zwischensumme "4x Bruttoergebnis" steht in der Tabelle **vor**
  "5 Personalaufwand" — zu diesem Zeitpunkt ist der Personalaufwand also noch
  gar nicht aufgelaufen.
- Erst bei "5x Bruttoergebnis mit Personal" (und allen späteren Summen:
  6ax, 6bx, 7x, 9x) ist er automatisch mit dabei.

Das ist exakt die klassische Erfolgsrechnungs-Logik (Bruttoergebnis → *nach
Abzug Personalkosten* → Bruttoergebnis mit Personal → *nach Abzug übriger
Betriebskosten* → EBITDA → …), nur eben tabellarisch hinterlegt statt in
Kopf oder Excel-Formel.

---

## Anhang: was nicht mehr verwendet wird

Es gibt im Datenmodell noch ältere Objekte aus der Zeit vor dieser
Umstellung, die auf **dieser Berichtsseite nicht mehr zum Einsatz kommen**:

- Die einzelnen `KPI 4x …` bis `KPI 9x Ergebnis`-Measures (je 7 Varianten:
  Wert/Vorjahr/Δ/Δ%/Budget/ΔBudget/ΔBudget%) — hatten die Kontogruppen-Listen
  fest einprogrammiert, statt sie aus den Pflegetabellen zu lesen.
- Die Calculation Group "Summary Lines" — ein älterer, alternativer Ansatz
  für dieselben Zwischensummen, der die Pflegetabellen zwar schon nutzte, aber
  ein eigenes, komplexeres Bucket-System im Bericht brauchte.

Beide wurden durch die in diesem Dokument beschriebene, einfachere Lösung
(Kategorie-Hierarchie `konto_l2`→`konto_l1` + "Category Class" direkt aus der
Kontodimension) ersetzt und können bei Bedarf aus dem Modell entfernt werden
— sie sind für diese Seite nicht mehr relevant.
