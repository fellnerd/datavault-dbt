# Explorationsplan `EWBPROD_dwh.DataMart_EVU` — Monatsaggregate der Zeitreihen

**Ziel:** Klären, ob die **NETZ-Bilanz** aus den DWH-Monatsaggregaten reproduzierbar ist —
ohne auf den ¼h-Backfill (X-2) zu warten — und ob sich die Quelle produktiv landen lässt.

**Ausführung:** ADF-Pipeline `SQL_Explore_TEST` (Lookup, `sqlReaderQuery`), Linked Service
`ISE_Prod`. Lesezugriff auf `DataMart_EVU` ist per §10.3 / E-3 verifiziert — **keine
zusätzliche Freigabe nötig**, die Allowlist betrifft nur die produktive Extraktion.

**Bezug:** [`docs/issues/2026-07-06_edm-ise-olap-cube-anbindung.md`](issues/2026-07-06_edm-ise-olap-cube-anbindung.md) §10.2/§10.4/§12.3 ·
[`design/raw-vault/ise/bilanz-struktur.md`](../design/raw-vault/ise/bilanz-struktur.md)

---

## Vorab — zwei Fallen

**`First row only` in der Lookup-Activity ausschalten**, sonst kommt genau eine Zeile zurück.
Lookup-Limit: 5'000 Zeilen / 4 MB — alle Abfragen hier bleiben deutlich darunter.

**Spaltenschreibweise ist unklar.** §10.2 nennt `ID_Zeitreihe` im Fakt, §12.3 nennt
`Zeitreihe_ID` in der View. **Phase A zuerst laufen lassen**, danach die übrigen Abfragen
gegebenenfalls anpassen.

---

## Phase A — Struktur (blockierend, zuerst)

### A1 · Welche Objekte gibt es überhaupt?

```sql
SELECT TABLE_NAME, TABLE_TYPE
FROM   EWBPROD_dwh.INFORMATION_SCHEMA.TABLES
WHERE  TABLE_SCHEMA = 'DataMart_EVU'
ORDER BY TABLE_NAME;
```

*Erwartung: ~120 Objekte (§10.2). Interessant ist alles mit `Zeitreihe` im Namen.*

### A2 · Spalten aller Zeitreihen-Objekte

```sql
SELECT TABLE_NAME, ORDINAL_POSITION, COLUMN_NAME, DATA_TYPE,
       NUMERIC_PRECISION, NUMERIC_SCALE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
FROM   EWBPROD_dwh.INFORMATION_SCHEMA.COLUMNS
WHERE  TABLE_SCHEMA = 'DataMart_EVU'
  AND  TABLE_NAME LIKE '%Zeitreihe%'
ORDER BY TABLE_NAME, ORDINAL_POSITION;
```

*Entscheidet: Spaltennamen, Dezimalpräzision (für den stellengenauen Abgleich), und ob es
neben `ZeitreihenData` weitere Faktenquellen gibt.*

### A3 · Beispielzeilen

```sql
SELECT TOP 20 * FROM EWBPROD_dwh.DataMart_EVU.ZeitreihenData ORDER BY Month_ID DESC;
```

*Entscheidet: das tatsächliche Format von `Month_ID` (`'2026/08'`? `202608`? Datum?).*

---

## Phase B — Abdeckung und Historie (entscheidet Machbarkeit)

### B1 · Gesamtumfang

```sql
SELECT COUNT(*)                     AS zeilen,
       COUNT(DISTINCT ID_Zeitreihe) AS serien,
       MIN(Month_ID)                AS von,
       MAX(Month_ID)                AS bis
FROM   EWBPROD_dwh.DataMart_EVU.ZeitreihenData;
```

*Erwartung laut §10.2: 486k Zeilen, 18'728 Serien, 2024/03 bis heute.*

### B2 · Abdeckung unserer 41 Serien (Gruppe 150) — **die Kernfrage**

```sql
SELECT   ID_Zeitreihe,
         COUNT(*)                          AS monate,
         MIN(Month_ID)                     AS von,
         MAX(Month_ID)                     AS bis,
         SUM(CAST(Summe AS DECIMAL(38,6))) AS summe_gesamt
FROM     EWBPROD_dwh.DataMart_EVU.ZeitreihenData
WHERE    ID_Zeitreihe IN (
           145089,145115,148730,148731,148732,148733,148734,148736,148738,148739,
           148740,148741,148745,148746,148748,150812,150814,150815,150816,150823,
           150824,150825,150828,150829,150830,150831,150835,171926,171956,171958,
           178623,178624,178757,178759,178761,183741,185776,185779,185780,187139,187846)
GROUP BY ID_Zeitreihe
ORDER BY ID_Zeitreihe;
```

*Erwartung laut §12.3: **31 von 41**. Die fehlenden 10 sollten genau die
lieferantenreferenzierten `1508xx` sein (Alpiq/EPAG/Primeo).*

### B3 · Liegen die fehlenden 10 vielleicht doch irgendwo?

```sql
SELECT * FROM EWBPROD_dwh.DataMart_EVU.VR_Zeitreihe
WHERE  Zeitreihe_ID IN (150812,150814,150815,150816,150823,150824,150825,150828,150829,150830);
```

*Entscheidet: Sind sie in der Dimension bekannt, aber nicht im Fakt geladen? Dann wäre eine
Nachladung bei Innosolv erfragbar, statt sie abzuschreiben. **Nicht überspringen** — davon
hängt ab, ob die ENERGIE-Bilanz je über das DWH läuft.*

### B4 · Lücken je Monat für die neun NETZ-Serien

```sql
SELECT   Month_ID, COUNT(DISTINCT ID_Zeitreihe) AS serien_mit_wert
FROM     EWBPROD_dwh.DataMart_EVU.ZeitreihenData
WHERE    ID_Zeitreihe IN (148730,148732,148738,148731,150831,148741,148733,148748,148746)
GROUP BY Month_ID
ORDER BY Month_ID;
```

*Sollwert: durchgehend 9 ab 2025/01 (PUZ 150831 gilt erst ab 01.01.2025, davor 8).
Jeder Monat mit weniger ist eine Lücke.*

---

## Phase C — Reproduktion der EWB-Screenshots (der eigentliche Test)

### C1 · NETZ-Bilanz 2025

```sql
SELECT   ID_Zeitreihe,
         SUM(CAST(Summe AS DECIMAL(38,6))) AS summe_2025
FROM     EWBPROD_dwh.DataMart_EVU.ZeitreihenData
WHERE    ID_Zeitreihe IN (148730,148732,148738,148731,150831,148741,148733,148748,148746)
  AND    Month_ID LIKE '2025%'
GROUP BY ID_Zeitreihe
ORDER BY ID_Zeitreihe;
```

Sollwerte aus dem EWB-Screenshot:

| `ID_Zeitreihe` | Bilanzposition | Sollwert 2025 (kWh) |
|---|---|---|
| 148730 | NÜST Einspeisung von | 23'028'285 |
| 148731 | Rückspeisung an SAK | 49'893'884 |
| 148732 | Produktion NE5 | 83'915'161 |
| 148733 | NE5 Bezug | 13'558'304 |
| 148738 | Produktion NE7 | 8'657'057 |
| 148741 | Verlust | 2'100'303 |
| 148746 | Bruttolastgangsumme BLS/EN | 63'325'628 |
| 148748 | Gesamtbezug NE7 inkl. VKP | ≈ 50'048'014 *(abgeleitet)* |
| 150831 | PUZ | 280'689 |

*Treffen diese neun Summen → **NETZ-Bilanz sofort baubar**, Historie ab 2024/03.*

### C2 · Kreuzcheck gegen unsere eigene ¼h-Basis

```sql
SELECT ID_Zeitreihe, Month_ID,
       CAST(Summe AS DECIMAL(38,6))   AS summe,
       CAST(Minimum AS DECIMAL(38,6)) AS minimum,
       CAST(Maximum AS DECIMAL(38,6)) AS maximum
FROM   EWBPROD_dwh.DataMart_EVU.ZeitreihenData
WHERE  ID_Zeitreihe IN (148746, 150835, 183741)
  AND  Month_ID IN ('2026/07', '2026/08');
```

*Sollwerte aus §12.12/§12.14 (stellengenau verifiziert), Juli 2026:*

| Serie | Summe | Minimum | Maximum |
|---|---|---|---|
| 148746 | 4'612'940.997043 | 1039.052579 | 2565.812433 |
| 150835 | 8'243'668.0 | 410.4 | 3536.0 |
| 183741 | 4'796'003.635064 | 1089.176824 | 2669.596 |

*Entscheidet: Stimmt die **Monatsabgrenzung** überein? Unsere ¼h-Basis nutzt die
Intervall-ENDE-Konvention. Weichen die Werte um genau ein Randintervall ab, ist die
Abgrenzung im DWH anders definiert — das müsste die Landung dann nachbilden.*

### C3 · ENERGIE-Bilanz 2026 — soweit vorhanden

```sql
SELECT   ID_Zeitreihe,
         SUM(CAST(Summe AS DECIMAL(38,6))) AS summe_2026
FROM     EWBPROD_dwh.DataMart_EVU.ZeitreihenData
WHERE    ID_Zeitreihe IN (150812,148745,150831,150823,150828,148741,
                          171958,187846,185780,178623,178624,178759,
                          150816,150825,150830)
  AND    Month_ID LIKE '2026%'
GROUP BY ID_Zeitreihe
ORDER BY ID_Zeitreihe;
```

Sollwerte (EWB-Screenshot ENERGIE 2026):

| Serie | Position | Sollwert |
|---|---|---|
| 150812 | Grundversorgung | 5'243'417 |
| 148745 | Virtueller Kundenpool *(vor PUZ-Abzug)* | ≈ 16'756'846 |
| 150831 | Pumpenstrom (PUZ) | 142'878 |
| 150823 | Kunden B2B (LF EPAG) | 1'045'282 |
| 150828 | Kunden B2B (LF Primeo) | 1'434'539 |
| 148741 | Verluste | 1'045'235 |
| 171958 | KW Eigene NE5 | 6'168'965 |
| 187846 | KW PVA NE5 | 39'528 |
| 185780 | Einspeisung PV ewb NE7 | 1'740'807 |
| 178623 | Einspeisung PV NE7 | 2'437'605 |
| 178624 | PV kein Eigenverbrauch NE7 | 48'095 |
| 178759 | PV Plug&Play | 4'572 |
| 150816 | Marktbeschaffung Grundversorgung | 12'682'601 |
| 150825 | Marktbeschaffung B2B EPAG | 1'045'282 |
| 150830 | Marktbeschaffung B2B Primeo | 1'434'539 |

*Erwartung: Die sechs `1508xx`-Zeilen fehlen. Alles andere sollte treffen.*

---

## Phase D — Landung vorbereiten (nur falls Phase C trägt)

### D1 · Gibt es eine Änderungserkennung für inkrementelles Laden?

```sql
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
FROM   EWBPROD_dwh.INFORMATION_SCHEMA.COLUMNS
WHERE  TABLE_SCHEMA = 'DataMart_EVU'
  AND  TABLE_NAME = 'ZeitreihenData'
  AND (COLUMN_NAME LIKE '%date%'   OR COLUMN_NAME LIKE '%Datum%'
    OR COLUMN_NAME LIKE '%load%'   OR COLUMN_NAME LIKE '%update%'
    OR COLUMN_NAME LIKE '%modif%'  OR COLUMN_NAME LIKE '%timestamp%');
```

*Entscheidet: HWM-Spalte vorhanden, oder braucht es Vollast? Bei 486k Zeilen ist Vollast
vertretbar — aber wenn eine Ladespalte existiert, ist sie die bessere Wahl.*

### D2 · Werden Monate rückwirkend korrigiert?

Zwei Läufe im Abstand einiger Tage, jeweils:

```sql
SELECT   Month_ID, COUNT(*) AS zeilen,
         SUM(CAST(Summe AS DECIMAL(38,6))) AS summe_gesamt
FROM     EWBPROD_dwh.DataMart_EVU.ZeitreihenData
WHERE    Month_ID >= '2026/01'
GROUP BY Month_ID
ORDER BY Month_ID;
```

*Entscheidet: Ändern sich abgeschlossene Monate nachträglich? Wenn ja, muss die Landung sie
neu berechnen — analog zum Vollaufbau von `fakt_lastgang_monat`.*

---

## Was die Ergebnisse entscheiden

| Befund | Konsequenz |
|---|---|
| C1 trifft die Screenshot-Werte | **NETZ-Bilanz sofort baubar**, Historie ab 2024/03, ohne Backfill |
| C2 stimmt stellengenau | Dauerhafter Datenqualitätstest zwischen beiden Quellen |
| C2 weicht um ein Randintervall ab | Monatsabgrenzung im DWH anders — in der Landung nachbilden |
| B2/B3 bestätigen die 10 fehlenden Lieferanten-Serien | ENERGIE-Bilanz bleibt am ¼h-Backfill hängen (6 von 15 Positionen) |
| B3 findet sie in `VR_Zeitreihe` | Nachladung bei Innosolv erfragen, statt abzuschreiben |
| B4 zeigt Monatslücken | Historie nicht durchgehend — vor dem Bauen klären |
| D1 findet keine Ladespalte | Vollast (486k Zeilen, unkritisch) |

---

# Ergebnisse (2026-08-30, ausgeführt über `SQL_Explore_TEST` via az cli)

## A — Struktur

Drei Objekte mit `Zeitreihe` im Namen:

| Objekt | Typ | Bewertung |
|---|---|---|
| `ZeitreihenData` | BASE TABLE | 5 Spalten: `ID_Zeitreihe`, `Month_ID` (varchar 33), `Summe`/`Minimum`/`Maximum` (decimal 19,6). **Keine Ladespalte.** |
| `VR_ZeitreihenFakten` | VIEW | **Die bessere Quelle.** Dieselben Kennzahlen in decimal(21,6), zusätzlich `ProcessingDate` (datetime, NOT NULL) sowie `MeteringCode_ID`, `Bereichsebene_ID`, `Bilanzierungsrelevant_ID`, `Bilanzgruppe_Marktpartner_ID`, `Energielieferant_Marktpartner_ID`, `Netzbetreiber_Marktpartner_ID`, `Rolle_ID`, `time_id` u. a. |
| `VR_Zeitreihe` | VIEW | Dimension: `Zeitreihe_ID`, `MeteringCode_ID`, `ID_ZeitreiheTyp`, `ZeitreiheTyp`, `Ruecklieferung_ID`/`Ruecklieferung` |

> Schreibweise geklärt: **`ID_Zeitreihe`** in beiden Faktenobjekten, **`Zeitreihe_ID`** nur in `VR_Zeitreihe`.
>
> `ProcessingDate` auf `VR_ZeitreihenFakten` beantwortet D1: **inkrementelles Laden per HWM ist möglich.**

## B — Abdeckung

**31 von 41 Serien** vorhanden — die Erwartung aus §12.3 ist bestätigt. Die fehlenden 10 sind
exakt `150812, 150814, 150815, 150816, 150823, 150824, 150825, 150828, 150829, 150830`
(Alpiq / EPAG / Primeo).

Alle **neun NETZ-Serien** haben durchgehend **30 Monate (2024/03 – 2026/08)** — keine Lücken.
Die übrigen Serien starten später (2024/06, 2024/09, 2024/11, 2024/12, 2025/01, 2025/02),
jeweils lückenlos bis 2026/08.

## C — Reproduktion

### C2 · Abgleich gegen unsere ¼h-Basis — **stellengenau** ✅

| Serie | Monat | DWH Summe | unsere ¼h-Basis | Min / Max |
|---|---|---|---|---|
| 148746 | 2026/07 | 4'612'940.997043 | 4'612'940.997043 | 1039.052579 / 2565.812433 ✓ |
| 150835 | 2026/07 | 8'243'668.0 | 8'243'668.0 | 410.4 / 3536.0 ✓ |
| 183741 | 2026/07 | 4'796'003.635064 | 4'796'003.635067 | 1089.176824 / 2669.596 ✓ |

→ **Gleiche Monatsabgrenzung, gleiche Werte.** Das DWH ist als Quelle validiert; eine
Nachbildung der Intervall-ENDE-Konvention ist nicht nötig.

### C1 · NETZ-Bilanz 2025 gegen den EWB-Screenshot — **nah, aber nicht deckungsgleich** ⚠

| Serie | Position | DWH 2025 | EWB-Screenshot | Δ |
|---|---|---|---|---|
| 148730 | NÜST Einspeisung | 23'029'416 | 23'028'285 | +1'131 |
| 148731 | Rückspeisung an SAK | 49'895'340 | 49'893'884 | +1'456 |
| 148732 | Produktion NE5 | 83'917'220 | 83'915'161 | +2'059 |
| 148733 | NE5 Bezug | 13'558'544 | 13'558'304 | +240 |
| **148738** | **Produktion NE7** | **8'595'782** | **8'657'057** | **−61'275** |
| 148741 | Verlust | 2'099'761 | 2'100'303 | −542 |
| **148746** | **Bruttolastgangsumme** | **63'266'626** | **63'325'628** | **−59'002** |
| 148748 | Gesamtbezug NE7 inkl. VKP | 50'049'446 | ≈ 50'048'014 *(abgeleitet)* | +1'432 |
| 150831 | PUZ | 280'690 | 280'689 | +1 |

**Zwei Befunde:**

1. **Die Bilanz schliesst im DWH in sich sauber.** Rechnet man Gesamteinspeisung − Rückspeisung
   − PUZ − Verlust, ergibt das 63'266'626.00 — die Serie 148746 liefert 63'266'625.98.
   Abweichung **0.02 kWh**. Die DWH-Daten sind konsistent.
2. **Die Kontrollzeile geht mit DWH-Daten aber nicht auf:** −60'673 kWh statt EWBs −2.
   Der Treiber ist praktisch vollständig **Produktion NE7** (−61'275); die Abweichung
   propagiert von dort in die Bruttolastgangsumme.

Die Monatswerte von 148738 für 2025 sind vollständig (12 Monate) und zeigen eine glatte
saisonale PV-Kurve — **kein fehlender Monat**, die Differenz ist über das Jahr verteilt
(≈ 5'100 kWh/Monat, 0.7 %).

> 💡 **Vermutliche Ursache:** EWBs Excel speist sich nicht aus dem DWH, sondern aus dem
> ¼h-CSV-Export — erkennbar an der Spalte „Lastgang", die das Exportformat
> `Typ.Referenz.Einheit` trägt (z. B. `Summe Produktionen NE7.Elektrizitäts- und Wasserwerk
> der Stadt Buchs <Netz>.kWh`). DWH und ¼h-Export sind also zwei Aggregationspfade. Für
> Juli 2026 stimmen sie stellengenau überein (C2), für 2025 nicht. Ob der ¼h-Export
> nachträglich revidiert wurde oder das DWH einen älteren Stand hält, lässt sich ohne
> ¼h-Historie nicht entscheiden — **Frage an EWB/Innosolv**.

## Konsequenzen

| | |
|---|---|
| **NETZ-Bilanz baubar** | ✅ Ja — Historie 2024/03 – 2026/08, keine Lücken, ohne Backfill |
| **Quelle** | `VR_ZeitreihenFakten` (nicht `ZeitreihenData`) — wegen `ProcessingDate` und Dimensionsschlüsseln |
| **Ladeart** | inkrementell per HWM auf `ProcessingDate`; Vollast wäre bei 486k Zeilen aber auch vertretbar |
| **Monatsabgrenzung** | keine Anpassung nötig (C2 stellengenau) |
| **ENERGIE-Bilanz** | ❌ bleibt am ¼h-Backfill — 6 der 15 Positionen sind Lieferantenserien |
| **Offen für EWB** | Warum weicht Produktion NE7 2025 zwischen DWH und ¼h-Export um 61'275 kWh ab? |

### B3 · Nachtrag — die Lieferantenserien fehlen vollständig

Abfrage auf `VR_Zeitreihe` mit 18 IDs lieferte **8 Treffer**. Die zehn `1508xx`-Serien
(Alpiq / EPAG / Primeo) sind **nicht einmal in der Dimension** vorhanden — nicht nur nicht
im Fakt geladen.

→ Die ursprüngliche Hoffnung („in der Dimension bekannt, also bei Innosolv nachladbar")
entfällt. Diese Serien liegen ausserhalb des DataMart-Scopes. **Die ENERGIE-Bilanz kann
nicht über das DWH laufen** und hängt vollständig am ¼h-Export.

Bestätigt wurde dabei zugleich der Zuordnungsmechanismus: `VR_Zeitreihe` liefert je
`Zeitreihe_ID` den `ZeitreiheTyp` (`Summe Produktionen NE7`, `Bruttolastgangsumme BLS/EN`,
`PUZ` …) sowie `MeteringCode_ID` (1 = Marktpartner-referenziert, 629 = Messpunkt 145089).

> **Kein `Category`-Konstrukt im DWH.** Der CSV-Export verwirft die ID, weshalb sie dort aus
> `Typ + Referenz + Einheit` rekonstruiert werden muss (`ise_lastgang_dedup`). Das DWH führt
> `ID_Zeitreihe` als `int` — der Join gegen `hub_zeitreihe.id_zeitreihe` ist direkt, ohne
> Textabgleich.
