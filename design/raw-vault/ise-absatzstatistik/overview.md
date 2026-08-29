# i-SE Absatzstatistik — Fachliche Dokumentation & Datenmodell

**Stand:** 26. August 2026 · **Status:** analysiert, **noch nicht modelliert**
**Quellsystem:** i-SE (Innosolv), Modul Fakturierung/Abrechnung
**Aktuelle Anbindung:** `stg.ext_ise_absatzstatistik` auf `datavault-dev` (External Table, kein Staging/Vault)

**Verwandt:** [`../ise/overview.md`](../ise/overview.md) (Zeitreihen/Lastgänge) ·
[`../../edm-ise-cube-architecture.mmd`](../../edm-ise-cube-architecture.mmd) (Infrastruktur) ·
[`../../../docs/ise-pruefabfragen.md`](../../../docs/ise-pruefabfragen.md) (Prüfabfragen) ·
[`../../../TASKS.md`](../../../TASKS.md)

---

## 1. Worum es fachlich geht

Die Absatzstatistik ist die **Rechnungspositions-Statistik der Energieabrechnung**. Jede Zeile
ist eine fakturierte Position: „Kunde X, Tarif Y, Verrechnungstyp Z, Termin T → soundsoviel
kWh Basis, soundsoviel Franken".

Sie beantwortet die Frage **„Womit verdient EWB in welcher Sparte wie viel Geld?"** — aufgeschlüsselt
nach Sparte, Tarif, Verrechnungstyp, Abnehmerkategorie und Netzebene.

### Warum das eine Lücke schliesst

Die Fakturierung erreicht die Finanzbuchhaltung (Abacus) **nur als Monats-Sammelbuchung** mit dem
Text „Debitoren-Rechnungen" — ohne Debitor, ohne Belegnummer, `kundennummer = 0` in 100 % der Fälle.
Beispiel 2025: Konto 30100 „Ertrag Strom-Energie" erhält 9.3 Mio CHF in **147 Buchungen**.

Die Absatzstatistik ist die Detailauflösung genau dieser Beträge. Der Nachweis, dass es dieselben
Geschäftsvorfälle sind:

| Sparte | Jahr | i-SE netto | Abacus-Ertragskonto | Differenz |
|---|---|---|---|---|
| Wasser | 2025 | 2'912'707.07 | 30200 + 30250 → 2'912'825.96 | **119 CHF (0.004 %)** |
| Strom Messkosten | 2026 | 352'990.12 | 30155 → 352'969.11 | **21 CHF (0.006 %)** |

---

## 2. Was fachlich verfügbar ist

### 2.1 Kennzahlen

| Feld | Bedeutung |
|---|---|
| `rechpos_basis` | Verrechnete **Menge** — kWh, m³, Anzahl Tage, Stück; je nach Verrechnungstyp |
| `rechpos_basis_verbrauch` / `_leistung` / `_blind` | Aufteilung der Basis nach Messart |
| `rechpos_betrag` | **Netto**betrag (exkl. MwSt.) |
| `rechpos_mwst_betrag` | MwSt.-Betrag |
| `rechpos_betrag_inkl_mwst` | Bruttobetrag |

> Die MwSt.-Quoten bestätigen die Netto-Semantik: 8.100–8.106 % für Strom/Abwasser, 2.597–2.598 %
> für Wasser — exakt die Schweizer Sätze (Normalsatz 8.1 %, reduzierter Satz 2.6 %).
> `rechpos_betrag` ist damit direkt mit den Abacus-Ertragskonten vergleichbar.

### 2.2 Sparten (`gruppe`) — die oberste fachliche Gliederung

Ein Snapshot, ~1'009'000 Positionen:

| Sparte | Positionen | Betrag netto | Tarife | Verrechnungstypen |
|---|---|---|---|---|
| Strom Netznutzung | 433'812 | 9'735'976.58 | 16 | 14 |
| Strom Abgaben | 209'251 | 3'137'900.19 | 16 | 5 |
| Strom Energie | 133'743 | 6'863'060.84 | 31 | 18 |
| Wasser | 64'971 | 4'409'422.32 | 15 | 5 |
| Strom Messkosten | 55'299 | 352'990.12 | 15 | 4 |
| *(leer)* | 46'820 | −6.12 | 1 | 1 |
| Abwasser | 43'309 | 3'213'267.03 | 2 | 4 |
| Strom Eigenverbrauch | 8'632 | 7'024.69 | 122 | 4 |
| Strom Dienstleistung | 5'422 | 55'265.75 | 3 | 12 |
| Strom ZEV | 3'806 | 197'082.76 | 4 | 6 |
| Strom Ökologischer Mehrwert | 2'020 | −69'248.83 | 2 | 1 |
| Strom E-Mobilität | 1'071 | 55'020.91 | 3 | 5 |
| Übrige Positionen | 847 | −9'614.33 | 1 | 3 |

Negative Beträge sind Rückvergütungen an Produzenten (Einspeisung), keine Fehler.

### 2.3 Rechnungsarten — wer wie abgerechnet wird

| Rechnungsart | Positionen | Betrag netto |
|---|---|---|
| Haushaltkunden | 805'405 | 16'582'454.64 |
| Eigenverbrauchsgemeinschaft | 78'831 | 1'438'672.50 |
| Abwasser jährlich | 47'767 | 2'921'754.68 |
| Grossbezüger | 26'728 | 7'087'940.57 |
| **Produktion (Kreditor)** | 19'024 | **−2'584'740.35** |
| Leistung < 100'000 | 15'048 | 1'615'228.82 |
| Zusammenschlüsse zum Eigenverbrauch | 4'386 | 236'673.56 |
| Prov. Anschlüsse | 3'945 | 246'571.59 |
| Eigenverbrauch | 3'757 | 479'933.15 |
| Abwasser monatlich | 2'904 | 291'509.27 |
| Rückvergütung (Kreditor) | 860 | −367'856.52 |
| Produktionen (Beleg) | 348 | 0.00 |

Die beiden „(Kreditor)"-Arten sind **Auszahlungen** an Energieproduzenten — bei Auswertungen
bewusst ein- oder ausschliessen, sie kehren das Vorzeichen um.

### 2.4 Verrechnungstyp — die dreistufige Klassifikation

`verrechnungstyp` (77 Ausprägungen) wird über drei Attribute gegliedert:

| Kategorie | Art | Messart | Positionen |
|---|---|---|---|
| Netznutzung | Strom | *(Grundpreis/Pauschale)* | 581'950 |
| Energie | Strom | Verbrauch | 138'487 |
| Netznutzung | Strom | Verbrauch | 113'620 |
| *(leer)* | Wasser | — | 48'681 |
| *(leer)* | Abwasser | — | 43'309 |
| *(leer)* | Wasser | Verbrauch | 16'290 |
| *(leer)* | Dienstleistung | — | 5'422 |
| Netznutzung | Strom | Leistungsspitzen | 2'456 |
| Netznutzung | Strom | Blindstrom | 336 |

**Messart** ist der Schlüssel zum Verständnis der Basis: bei „Verbrauch" ist `rechpos_basis` kWh
bzw. m³, bei „Leistungsspitzen" kW, bei „Blindstrom" kVarh, bei leerer Messart eine Pauschale
oder ein Tagespreis.

### 2.5 Weitere Dimensionen

| Dimension | Ausprägungen | Inhalt |
|---|---|---|
| `tarif` / `id_leistkat` | 200 | Tarif = Leistungskategorie; `id_leistkat` ist die zugehörige ID (1:1) |
| `abnehmerkategorie` | 51 | Kundensegment (BFE/ElCom-Systematik) |
| `verbrauchergruppe` | 5 | Gröbere Gruppierung (BEW) |
| `fakturierungsvariante` | 12 | Abrechnungsrhythmus/-verfahren |
| `energielieferant` | 18 | bei freien Kunden der beliefernde Lieferant |
| `netzbetreiber` | 3 | i. d. R. EWB selbst |
| `vertragsart` | 7 | Vertragstyp |
| `bereichsebene` | 3 | Netzebene (NE5 / NE7 …) |
| `kundenkennzeichnung` | 5 | Kundenmerkmal |
| `marktprodukt` | 3 | Marktprodukt am Tarif |
| `ruecklieferung` | 3 | Liefer-/Rücklieferrichtung |
| `zev_evg_nummer` / `_rolle` | 64 | ZEV-/EVG-Zuordnung — nur bei **2.8 %** der Positionen gefüllt |
| `statistikgruppe` | **0** | durchgehend leer → nicht ins Modell übernehmen |

### 2.6 Zeitachse

`termin` ist der **Rechnungstermin** (Periodenende, z. B. `30.06.2025`), nicht das Buchungsdatum.
Abgeleitet mitgeliefert: `termin_jahr`, `termin_semester`, `termin_quartal`.

Der Export umfasst **23 Termine**, effektiv 2025–2026; 2024 ist nur mit zwei Terminen und
1'489 Positionen vertreten. Die Verteilung ist stark ungleich: Quartalstermine (31.03., 30.06.,
30.09., 31.12.) tragen 130'000–196'000 Positionen, die übrigen Monate je ~4'000–5'000.
Das spiegelt den Abrechnungsrhythmus — Haushaltkunden quartalsweise, Grossbezüger monatlich.

---

## 3. Die drei möglichen Quellen — und warum das die zentrale Entscheidung ist

| | CSV-Export (heute) | OLAP-Cube | **`DataMart_EVU.RechnungFakten`** |
|---|---|---|---|
| Zugriff | `stg.ext_ise_absatzstatistik` | MDX via `Cube_Explore_TEST` | relational via `ISE_Prod`-Muster |
| Spalten | 34 | 49 Dimensionen + 10 Measures | **61** |
| Zeilen | ~1'009'000 je Snapshot | — | **3'399'415** |
| Historie | ab 2025 | **ab 2021** | **ab 2021** |
| Umlaute | ⛔ zerstört (U+FFFD) | ✅ | ✅ |
| Duplikate | ⛔ 11 Vollsnapshots | ✅ | ✅ |
| **Fremdschlüssel** | ⛔ **keine** | Dimensionen vorhanden | ✅ **alle** |
| Eignung | Notlösung | Prüfung/Abstimmung | **Landung** |

### 3.1 Der entscheidende Unterschied: Fremdschlüssel

`RechnungFakten` trägt je Rechnungsposition Schlüssel, die der CSV-Export **nicht** enthält:

| Spalte | Verweist auf | Nachgewiesene Überlappung |
|---|---|---|
| `HBKonto_ID` → `Konto_Kostenart.Kontonummer` | **Abacus-Kontonummer** | **144 von 153 in `vault.hub_konto` (94.1 %)** |
| `Kostenstelle1/2/3_HBKonto_ID` | Abacus-Kostenstellen | 23 Ausprägungen |
| `FIBU_Belegdatum_ID` | FiBu-Belegdatum | — |
| `MeteringCode_ID` | Messpunkt = `Techanl.ZEITREIHE.ReferenzID` (`ReferenzTyp=19`) | **10'727 von 12'988 (82.6 %)** haben eine Zeitreihe |
| `Vertrag_ID` | Energievertrag | 56'724 |
| `Subjekt_ID` | Energiekunde | 15'492 |
| `Objekt_ID` / `Standort_ID` / `Vertragspartner_ID` | Liegenschaft / Standort / Partner | — |

> **Signifikanzprüfung zur Kontonummer:** `vault.hub_konto` belegt 534 Werte im Bereich
> 10000–99981, also 0.59 % Dichte. Bei Zufall wäre **ein** Treffer zu erwarten — beobachtet
> sind **144**. Faktor ~160 über dem Zufall → echter Fremdschlüssel.
>
> Gegenbeispiel aus derselben Analyse: `id_leistkat` traf 185 von 199 `hub_kreditor`-Schlüsseln
> (93 %) — bei 93 % Nummernkreis-Dichte. Trefferquote = Dichte → **reines Rauschen**.
> Diese Prüfung gehört zu jedem Schlüsselvergleich.

---

## 4. Modellierungsvorschlag (noch nicht umgesetzt)

Gültig **unter der Annahme, dass relational geladen wird**. Beim CSV-Export entfallen alle Links.

```
hub_rechnungsposition          BK: fachlicher Schlüssel der Position
 └── sat_rechnungsposition__ise    Basis, Beträge, Tage/Monate, Gültigkeit

Referenz-/Dimensions-Hubs (aus den id_*-Spalten):
  hub_verrechnungstyp   ├── sat_… (Kategorie, Art, Messart)
  hub_tarif             ├── sat_… (Marktprodukt, Bereichsebene)
  hub_rechnungsart      └── sat_…
  hub_abnehmerkategorie     sat_… (Verbrauchergruppe)

Links in bestehende Domänen  ⟵ nur mit relationaler Quelle möglich:
  link_rechnungsposition_konto      → vault.hub_konto        (HBKonto_ID)
  link_rechnungsposition_messpunkt  → vault_ise (Messpunkt)  (MeteringCode_ID)
  link_rechnungsposition_vertrag    → hub_energievertrag     (Vertrag_ID)   ⟵ Hub fehlt heute
  link_rechnungsposition_subjekt    → hub_energiekunde       (Subjekt_ID)   ⟵ Hub fehlt heute
```

**Zu beachten:**

- `hub_kunde` und `hub_vertrag` im Schema `vault` stammen aus **Compax/Telecom**, nicht aus der
  Energieabrechnung. Für `Subjekt_ID`/`Vertrag_ID` braucht es **eigene** Hubs — nicht an die
  bestehenden anhängen.
- Die Verbindung zu den Lastgängen läuft über den **Messpunkt**, nicht über die Zeitreihe direkt.
  Im heutigen Vault-Umfang (41 Serien, davon 3 messpunktbezogen) treffen nur 88 Positionen —
  der Join skaliert erst mit weiteren Zeitreihegruppen.
- Alle Kennzahlen stehen in der External Table als `NVARCHAR(4000)` → `TRY_CONVERT(decimal(19,4), …)`.
  Dezimaltrennzeichen `.`, kein Tausendertrennzeichen.

---

## 5. Bekannte Mängel des CSV-Exports

| # | Mangel | Umfang |
|---|---|---|
| 1 | **11 identische Vollsnapshots** in der Wildcard-External-Table (Export läuft 2× täglich) | alle Summen ×11 |
| 2 | **Umlaute irreversibel zerstört** — `Zählermiete` → `Z�hlermiete` (echtes U+FFFD, Hex-belegt) | durchgehend |
| 3 | **CSV-Quoting defekt** — unmaskierte Anführungszeichen verschieben Spalten | 4'622 Zeilen (0.46 %) |
| 4 | `statistikgruppe` durchgehend leer | 100 % |
| 5 | Historie nur ab 2025 | Cube/DWH haben ab 2021 |
| 6 | 🐞 **Temp-Ordner an der Quelle** (`drive-d/absatzstatistik/Temp/`) — bei `recursive: true` würde er als zusätzlicher Snapshot mitgeladen | noch nicht eingetreten |

Mangel 2 und 3 sind an den Beispielen in diesem Dokument sichtbar („Strom Ökologischer Mehrwert",
„Abwasser jährlich") — sie stammen aus der Quelle, nicht aus der Dokumentation.

---

## 6. Offene fachliche Fragen

| # | Frage | An wen |
|---|---|---|
| 1 | Nach welcher Regel wird `gruppe` (13 Sparten) gebildet? Im Cube gibt es keine entsprechende Dimension — vermutlich im Export berechnet. | Innosolv |
| 2 | Kann `[Energiegemeinschaft]` an die Measure Group „Fakten Rechnungsstatistik" angebunden werden? Betrifft ZEV/EVG bei 2.8 % der Positionen. | Innosolv |
| 3 | Ist `termin` immer Periodenende, auch bei unterjährigen Schlussrechnungen? | Fachbereich |
| 4 | Sollen „Produktion (Kreditor)" und „Rückvergütung (Kreditor)" in Umsatzauswertungen enthalten sein? Sie kehren das Vorzeichen um. | Fachbereich |
| 5 | Welche Auswertungen sind konkret gewünscht? Davon hängt ab, wie tief modelliert werden muss. | Fachbereich |
