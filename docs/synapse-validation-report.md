# Synapse Validation Report — Spalten-für-Spalten Lückenanalyse

**Datum:** 2026-07-22  
**Validator:** synapse-validator  
**Verglichen:** `docs/synapse-structured-tables-logic.md` ↔ `design/raw-vault/_common/implementierungsplan.md`

---

## Executive Summary

| Kategorie | Anzahl |
|---|---:|
| 🔴 KRITISCH (verhindert Implementierung) | 4 |
| 🟠 HOCH (unvollständige Payloads) | 5 |
| 🟡 MITTEL (Dokumentation) | 3 |
| 🟢 NIEDRIG (kosmetisch) | 1 |
| **Total Lücken** | **13** |

---

## 1. Finance.Buchungen (FIBU.GL)

### Synapse-Spalten → DV-Mapping

| # | Synapse-Output | GL-Spalte | DV-Ziel im Plan | Im Plan? | Anmerkung |
|---|---|---|---|---|---|
| 1 | `Datum` | `DATE` | sat_hauptbuch ("Belegdatum") | ✅ | |
| 2 | `Betrag` | `BETRAG + MWSTBETR` | sat_hauptbuch ("Betrag") | ⚠️ | Nur "Betrag" erwähnt, MWSTBETR fehlt |
| 3 | `Soll-Haben` | `SH` | ??? | 🔴 **FEHLT** | Kritisch für 4-way UNION |
| 4 | `SAM` | `SAM` | ??? | 🔴 **FEHLT** | Kritisch für Filter `SAM <> '#'` |
| 5 | `KostenstelleNr` | `KST` | link_hauptbuch_kostenstelle | ⚠️ | Link existiert, aber nur für KST |
| 6 | `KostenstelleNr-Gegen` | `KST2` | ??? | 🔴 **FEHLT** | Kein Link für KST2 (Gegen-KST) |
| 7 | `KontoNr` | `KTO` | hub_hauptbuch (BK: `DKBELEGNUMMER\|\|KTO`) | ✅ | Im BK enthalten |
| 8 | `KontoNr-Gegen` | `GKTO` | ??? | 🔴 **FEHLT** | Gegenkonto nirgends modelliert |
| 9 | `ProjektNr` | `PROJEBENE` | link_hauptbuch_projekt | ✅ | |
| 10 | `Mwst-Betrag` | `MWSTBETR` | ??? | 🔴 **FEHLT** | Kritisch für MWST-Anpassung |
| 11 | `Mwst-Typ` | `MWSTTYP` | ??? | 🔴 **FEHLT** | Kritisch für CASE WHEN Logik |
| 12 | `Mwst-Code` | `MWSTCODE` | ??? | 🔴 **FEHLT** | |
| 13 | `Mwst-Incl` | `MWSTINCL` | ??? | 🔴 **FEHLT** | Kritisch für CASE WHEN Logik |
| 14 | `Mwst-Satz` | `MWSTSATZ` | ??? | 🔴 **FEHLT** | |
| 15 | `Umschreibung` | `TEXT` | sat_hauptbuch ("Buchungstext") | ⚠️ | Unklar ob TEXT oder TEXT2 |
| 16 | `Umschreibung2` | `TEXT2` | ??? | 🔴 **FEHLT** | TEXT2 nicht erwähnt |
| 17 | `Kundennummer` | `DKKUNDENNUMMER` | ??? | 🔴 **FEHLT** | |
| 18 | `Belegnummer` | `DKBELEGNUMMER` | hub_hauptbuch (BK) | ✅ | |

### Fazit Finance.Buchungen

**sat_hauptbuch Payload im Plan:** "Betrag, Periode, Währung, Buchungstext, Belegdatum" — **5 Begriffe**.  
**Benötigte Spalten laut Synapse:** **18 Output-Spalten** aus **~15 GL-Quellspalten**.

> 🔴 **10 von 18 Spalten fehlen oder sind unklar** im Implementierungsplan.  
> Die MWST-Spalten (MWSTBETR, MWSTTYP, MWSTINCL, MWSTCODE, MWSTSATZ) sind **kritisch** für die in Section 10b dokumentierte Vorzeichen-Logik. SH und SAM sind Filter/Perspektive-Spalten die die gesamte 4-way UNION steuern.

### Empfehlung
`sat_hauptbuch` Payload muss explizit diese Spalten auflisten:
```
DATE, SH, SAM, KTO, GKTO, KST, KST2, BETRAG, MWSTBETR, MWSTTYP, MWSTCODE, 
MWSTINCL, MWSTSATZ, PROJEBENE, TEXT, TEXT2, DKBELEGNUMMER, DKKUNDENNUMMER
```

GKTO und KST2 brauchen **eigene Links** oder müssen als Satellite-Payload modelliert werden:
- `link_hauptbuch_gegenkonto` (hub_hauptbuch ↔ hub_konto via GKTO)
- `link_hauptbuch_gegenkostenstelle` (hub_hauptbuch ↔ hub_kostenstelle via KST2)

---

## 2. Finance.Belege (KRED.KBL + KRED.KVL)

### Synapse-Spalten → DV-Mapping

| # | Synapse-Output | Quell-Spalte | Quell-Tabelle | DV-Ziel im Plan | Im Plan? |
|---|---|---|---|---|---|
| 1 | `Belegnummer` | `BELNR` | KBL | hub_kreditorenbeleg (BK) | ✅ |
| 2 | `Kundennummer` | `KNR` | KBL | ??? | 🔴 **FEHLT** |
| 3 | `Umschreibung3` | `BEMERK` | KBL | sat_kreditorenbeleg | ✅ |
| 4 | `Visierende-ID` | `ABACUS_USR_NAME` | **KVL** | sat_kreditorenbeleg ❌ | 🔴 **FALSCHE QUELLE** |
| 5 | `Visierende` | `ABACUS_USR_FULL_NAME` | **KVL** | sat_kreditorenbeleg ❌ | 🔴 **FALSCHE QUELLE** |

### Kritische Fehler

1. **sat_kreditorenbeleg listet KVL-Spalten**: "Visierende-ID" und "Visierende" kommen aus `KRED.KVL` (Zahlungen), NICHT aus `KRED.KBL` (Belege). Aber `sat_kreditorenbeleg` hat Staging-Quelle `ewb_kred_kbl_main`.
   - **Fix:** Visierende-Spalten gehören in `sat_zahlung` (Quelle: `ewb_kred_kvl_main`)

2. **sat_zahlung Payload unvollständig**: Listet "Zahlbetrag, Valuta, Zahlungsart, Konto, Status" — aber ABACUS_USR_NAME / ABACUS_USR_FULL_NAME fehlen.

3. **KNR (Kundennummer)** aus KBL ist nicht im sat_kreditorenbeleg Payload gelistet. Muss entweder:
   - Als Link `link_kreditorenbeleg_adresse` (KNR → hub_adresse) modelliert werden, oder
   - Als Payload in sat_kreditorenbeleg aufgenommen werden

4. **ADRID** (Kundenname) aus KBL — fehlt ebenfalls (wird in Finance.Kunden verwendet)

### Link-Modellierung KBL↔KVL

| Aspekt | Status |
|---|---|
| Link `link_kreditorenbeleg_zahlung` definiert | ✅ |
| JOIN-Bedingung `BELNR = DOCUMENTNR` dokumentiert | ✅ |
| Herkunft Visierende-Spalten korrekt zugeordnet | 🔴 Nein |

---

## 3. Finance.Kunden (KRED.KBL → hub_adresse)

### Synapse-Spalten → DV-Mapping

| # | Synapse-Output | Quell-Spalte | DV-Ziel im Plan | Im Plan? |
|---|---|---|---|---|
| 1 | `Kundennummer` | `KNR` | hub_adresse? | ⚠️ |
| 2 | `Kundenname` | `ADRID` | sat_person_adresse? | ⚠️ |

### Design-Entscheidung "Kein eigener Hub"

| Aspekt | Status |
|---|---|
| Entscheidung dokumentiert | ✅ (Zeile 70 im Plan) |
| Begründung vorhanden | ✅ "kein DISTINCT, keine valide Stammdaten-Quelle" |
| Alternative definiert | ✅ "Stammdaten aus PUBL.ADR" |

### 🔴 KRITISCH: hub_adresse BK-Spalte existiert nicht

Der Plan definiert:
```
hub_adresse | Adressnummer | ADRESSNR | ewb_publ_adr_main
```

**Aber:** Die Spalte `ADRESSNR` existiert **NICHT** in `sources.yml` für `ext_ewb_publ_adr_main`!

Vorhandene Kandidaten in PUBL.ADR:
| Spalte | Typ | Beschreibung |
|---|---|---|
| `RECNUM` | DECIMAL(38,10) | Technischer Record-Key |
| `INR` | DECIMAL(38,10) | Interne Nummer (wahrscheinlich = Adressnummer) |
| `LOHNNR` | DECIMAL(38,10) | Personalnummer (FK zu LEN) |
| `DEBINR` | DECIMAL(38,10) | Debitorennummer |
| `KREDINR` | DECIMAL(38,10) | Kreditorennummer |

> **Empfehlung:** BK für `hub_adresse` sollte `INR` sein (Abacus-interne Adressnummer), NICHT `ADRESSNR`.

---

## 4. Projekt.Personal (PUBL.ADR + LOHN.LEN)

### Synapse-Spalten → DV-Mapping

| # | Synapse-Output | Quell-Spalte | Quell-Tabelle | DV-Ziel im Plan | Im Plan? |
|---|---|---|---|---|---|
| 1 | `PersonalNr` | `LOHNNR` | ADR | hub_person (via EMPL_NR) | ⚠️ Indirekter Match |
| 2 | `Name` | `NAME` | ADR | sat_person_adresse | ✅ |
| 3 | `Vorname` | `VORNAME` | ADR | sat_person_adresse | ✅ |
| 4 | `Initialen` | `ABRV` | LEN | sat_person | ✅ |

### 🔴 KRITISCH: Fehlender Link hub_adresse ↔ hub_person

Die Synapse-View joint `ADR.LOHNNR = LEN.EMPL_NR`. Im DV-Plan:
- `hub_adresse` (BK: ADRESSNR/INR) ← ADR
- `hub_person` (BK: EMPL_NR) ← LEN

**Es fehlt ein Link zwischen beiden Hubs!** Ohne diesen Link kann die Mart-View `v_personal` die ADR+LEN Daten nicht zusammenführen.

> **Empfehlung:** `link_adresse_person` (hub_adresse ↔ hub_person, FK: ADR.LOHNNR = LEN.EMPL_NR)

### Business-Regeln (Section 10b)

| Regel | Dokumentiert? |
|---|---|
| Filter `LOHNJN = '1'` | ✅ |
| Filter `GESPERRT = '0'` | ✅ |
| Filter `LOHNNR <> 0` | ✅ |
| Initialen-Deduplizierung (ABRV) | ✅ |
| 3-stufige Dedup-Logik | ⚠️ Vereinfacht als ROW_NUMBER, Original ist COUNT OVER |

### Filter-Spalten im DV

| Filter-Spalte | In welchem Satellite? | Vorhanden? |
|---|---|---|
| `LOHNJN` | sat_person_adresse (ADR) | 🔴 **FEHLT** |
| `GESPERRT` | sat_person_adresse (ADR) | 🔴 **FEHLT** |
| `LOHNNR` | hub_adresse (als FK) | ⚠️ Nur wenn Link existiert |

> sat_person_adresse Payload: "Name, Vorname, Strasse, PLZ, Ort" — enthält NICHT die Filter-Spalten LOHNJN und GESPERRT, die für den Mart-Filter benötigt werden!

---

## 5. Projekt.Stunden (PROJ.NSA + PROJ.NTR + PUBL.ADR)

### Synapse-Spalten → DV-Mapping

| # | Synapse-Output | Quell-Spalte | Quell-Tabelle | DV-Ziel im Plan | Im Plan? |
|---|---|---|---|---|---|
| 1 | `PersonalNr` ⚠️ | `PROJNR` | NSA | hub_projektsachkonto (BK) | ✅ Korrigiert→ProjektNr |
| 2 | `LeistungsartNr` | `CODE` | NSA | hub_projektsachkonto (BK) | ✅ |
| 3 | `Leistungsart` | `DESCRIPTION` | NTR | ref_leistungsart | ✅ |
| 4 | `Betrag` | `AZBETINT` | NSA | sat_projektsachkonto | ✅ |
| 5 | `Datum` | `PERIYEAR/PERIMONTH` | NSA | hub_projektsachkonto (BK) | ✅ |

### 🔴 KRITISCH: 7 Spalten-Namen im Plan stimmen nicht mit sources.yml überein

| Plan-Name | Tatsächlicher Spaltenname (sources.yml) | Status |
|---|---|---|
| `AZBUDGET` | **`AZBUTINT`** | 🔴 FALSCH |
| `AZBETEXI` | **`AZBETEXT`** | 🔴 FALSCH |
| `AZVORTRAGINT` | **`AZVORTINT`** | 🔴 FALSCH |
| `AZVORTRAGEXI` | **`AZVORTEXT`** | 🔴 FALSCH |
| `BUDGETEXI` | **`BUDGETEXT`** | 🔴 FALSCH |
| `BETRAGEXI` | **`BETRAGEXT`** | 🔴 FALSCH |
| `VORTRAGEXI` | **`VORTRAGEXT`** | 🔴 FALSCH |

Korrekte Spalten (stimmen überein):
| Plan-Name | Korrekt? |
|---|---|
| `AZBETINT` | ✅ |
| `BUDGETINT` | ✅ |
| `BETRAGINT` | ✅ |
| `VORTRAGINT` | ✅ |

> **Empfehlung:** sat_projektsachkonto Payload korrigieren auf:
> `AZBUTINT, AZBETINT, AZBETEXT, AZVORTINT, AZVORTEXT, BUDGETINT, BUDGETEXT, BETRAGINT, BETRAGEXT, VORTRAGINT, VORTRAGEXT`

### Business-Regeln (Section 10b)

| Regel | Dokumentiert? |
|---|---|
| Synapse-Fehler `PROJNR = LOHNNR` | ✅ Ausführlich |
| DV-Korrektur `PROJNR = NPO.PROJNR` | ✅ |
| Filter `AZBETINT <> 0` | ✅ |
| Datum-Konstruktion DATEFROMPARTS | ✅ |
| ref_leistungsart (CODE→NTR.RECNUM) | ✅ |

---

## 6. Projekt.Projekt (PROJ.NPO + PROJ.PST + Sharepoint)

### Synapse-Spalten → DV-Mapping

| # | Synapse-Output | Quell-Spalte | Quell-Tabelle | DV-Ziel im Plan | Im Plan? |
|---|---|---|---|---|---|
| 1 | `ProjektNr` | `PROJNR` | NPO | hub_projekt (BK) | ✅ |
| 2 | `ProjektName` | `PROJNAME` | NPO | sat_projekt | ✅ |
| 3 | `Inaktiv` | `INAKTIV` | NPO | sat_projekt | ✅ |
| 4 | `GruppeNr` | `REFPROJNR` | NPO | sat_projekt | ✅ |
| 5 | `GruppeName` | `KostenstelleName` | SP.Kostenstellen | Mart-Level (Sharepoint JOIN) | ✅ |
| 6 | `Erstellt` | `CREATION` | NPO | sat_projekt | ✅ |
| 7 | `StatusNr` | `STATUS` | NPO | sat_projekt | ✅ |
| 8 | `Status` | `BEZEICHN` | PST | ref_projektstatus | ✅ |
| 9 | `StatusDatum` | `STATUS1` | NPO | sat_projekt | 🟠 **FEHLT** |
| 10 | `HauptgruppeNr` | `KategorieNr` | SP.ProjekteKategorien | Mart-Level (Sharepoint) | ✅ |
| 11 | `HauptgruppeName` | `KategorieName` | SP.ProjekteKategorien | Mart-Level (Sharepoint) | ✅ |

### Lücke: STATUS1 nicht in sat_projekt

`sat_projekt` Payload: "ProjektName, Inaktiv, GruppeNr, StatusNr, Erstellt"

`STATUS1` (DATETIME2) = StatusDatum aus NPO. Wird in Synapse als `StatusDatum` ausgegeben. **Fehlt im Payload!**

> `sat_projekt_status` hat "Status, StatusDatum, Beschreibung" — aber diese kommen aus PST, nicht NPO. NPO.STATUS1 ≠ PST.STATUS.

### Sharepoint-Tabellen

| Sharepoint-Quelle | In Section 11 dokumentiert? |
|---|---|
| Sharepoint.Kostenstellen | ✅ |
| Sharepoint.KategorisierungProjekte | ✅ |
| Sharepoint.ProjekteKategorien | ✅ |

### Business-Regeln

| Regel | Dokumentiert? |
|---|---|
| PST Status-Dedup `LEN(TRIM(BEZEICHN)) > 2` | ✅ (Section 10b) |
| Kein WHERE-Filter (alle Projekte) | ✅ (implizit) |

---

## 7. Projekt.Abteilung (LOHN.LEN + LOHN.LTC)

### Synapse-Spalten → DV-Mapping

| # | Synapse-Output | Quell-Spalte | Quell-Tabelle | DV-Ziel im Plan | Im Plan? |
|---|---|---|---|---|---|
| 1 | `PersonalNr` | `EMPL_NR` | LEN | hub_person (BK) | ✅ |
| 2 | `AbteilungNr` | `HOME_DEPT_NR` | LEN | sat_person | ✅ |
| 3 | `Abteilung` | `TEXT` | LTC | ref_abteilung | ✅ |
| 4 | `MutationDate` | `MUTATION_DATE` | LEN | sat_person | 🟠 **FEHLT** |

### Lücke: MUTATION_DATE

`sat_person` Payload: "LAST_NAME, FIRST_NAME, ABRV, HOME_DEPT_NR, CALC_GROUP" — **kein MUTATION_DATE**.

MUTATION_DATE ist die Änderungshistorie der Abteilungszuordnung und wird in der Synapse-View als Output-Spalte ausgegeben.

### Business-Regeln

| Regel | Dokumentiert? |
|---|---|
| LTC Filter `GROUP = 1` | ✅ (Section 10b) |
| DISTINCT über Ergebnis | ✅ (implizit via DV-Dedup) |

---

## Business-Regeln Vollständigkeit (Section 10b)

| View | Regel | In 10b? | Status |
|---|---|---|---|
| Finance.Buchungen | 4-way UNION Vorzeichen-Logik | ✅ | Vollständig dokumentiert |
| Finance.Buchungen | MWST-Anpassung (CASE WHEN) | ✅ | SQL-Pseudocode vorhanden |
| Finance.Buchungen | Filter SAM/KST/KTO | ✅ | Alle 3 Bedingungen gelistet |
| Finance.Belege | LEFT JOIN KBL+KVL | ✅ | In 10a erwähnt |
| Finance.Belege | Kein Filter (alle Belege) | ⚠️ | Nicht explizit |
| Finance.Kunden | Kein DISTINCT (denorm) | ✅ | Zeile 70 |
| Projekt.Personal | Mitarbeiter-Filter (3 Bedingungen) | ✅ | Vollständig |
| Projekt.Personal | Initialen-Dedup (ABRV) | ✅ | ROW_NUMBER Variante |
| Projekt.Stunden | Synapse-Fehler PROJNR | ✅ | Ausführlich korrigiert |
| Projekt.Stunden | AZBETINT<>0 Filter | ✅ | |
| Projekt.Stunden | DATEFROMPARTS-Konstruktion | ✅ | SQL vorhanden |
| Projekt.Projekt | PST Status-Dedup `LEN(TRIM)>2` | ✅ | |
| Projekt.Abteilung | LTC GROUP=1 Filter | ✅ | |

---

## Gesamtübersicht: Fehlende Spalten

### 🔴 KRITISCHE Lücken (4)

| # | Lücke | Impact | Betroffene Views |
|---|---|---|---|
| K1 | **hub_adresse BK `ADRESSNR` existiert nicht** in PUBL.ADR — korrekt ist `INR` | Hub-Erstellung scheitert | Finance.Kunden, Projekt.Personal |
| K2 | **sat_kreditorenbeleg mischt KBL+KVL Spalten** — Visierende-ID/Visierende kommen aus KVL, nicht KBL | Falsche Staging-Zuordnung | Finance.Belege |
| K3 | **7 Spaltennamen falsch in sat_projektsachkonto** — stimmen nicht mit sources.yml überein | Staging-SQL generiert falsche Spalten | Projekt.Stunden |
| K4 | **Fehlender Link `link_adresse_person`** (ADR.LOHNNR ↔ LEN.EMPL_NR) | Mart-View v_personal kann ADR+LEN nicht joinen | Projekt.Personal, Finance.Kunden |

### 🟠 HOHE Lücken (5)

| # | Lücke | Impact | Betroffene Views |
|---|---|---|---|
| H1 | **sat_hauptbuch Payload unvollständig** — 10+ GL-Spalten fehlen (SH, SAM, GKTO, KST2, alle 5 MWST-Spalten, TEXT2, DKKUNDENNUMMER) | Mart-View v_buchungen nicht erstellbar | Finance.Buchungen |
| H2 | **sat_projekt fehlt STATUS1** (StatusDatum aus NPO) | Mart-View v_projekt unvollständig | Projekt.Projekt |
| H3 | **sat_person fehlt MUTATION_DATE** | Mart-View v_abteilung unvollständig | Projekt.Abteilung |
| H4 | **sat_kreditorenbeleg fehlt KNR** (Kundennummer) und ADRID | Kunden-Referenz aus Belegen fehlt | Finance.Belege, Finance.Kunden |
| H5 | **sat_zahlung fehlt ABACUS_USR_NAME/FULL_NAME** | Visa-Information nicht im DV | Finance.Belege |

### 🟡 MITTLERE Lücken (3)

| # | Lücke | Impact |
|---|---|---|
| M1 | **sat_person_adresse fehlt LOHNJN, GESPERRT** — Filter-Spalten für Mart v_personal nicht verfügbar | Mart-Filter muss auf Raw-Staging zugreifen |
| M2 | **GKTO/KST2 brauchen eigene Links** (link_hauptbuch_gegenkonto, link_hauptbuch_gegenkostenstelle) — oder als Sat-Payload | Buchungen-Perspektive-Tausch unmöglich |
| M3 | **Keine Entity-Designer JSONs** für EWB-Tabellen vorhanden — Satellite-Payloads nur als Prosa-Beschreibung | Automatisierte Code-Generierung nicht möglich |

### 🟢 NIEDRIGE Lücken (1)

| # | Lücke | Impact |
|---|---|---|
| L1 | hub_kreditorenbeleg BK heisst "BELEGNR" im Plan, tatsächliche Spalte ist "BELNR" | Kosmetisch, aber bei Code-Gen falsch |

---

## Korrektur-Aktionen

### Sofort (vor nächster Wave)

1. **hub_adresse BK korrigieren**: `ADRESSNR` → `INR` (oder RECNUM klären)
2. **sat_hauptbuch Payload erweitern**: Alle 18 Synapse-relevanten GL-Spalten explizit listen
3. **sat_kreditorenbeleg bereinigen**: Visierende-Spalten entfernen, KNR/ADRID hinzufügen
4. **sat_zahlung erweitern**: ABACUS_USR_NAME, ABACUS_USR_FULL_NAME hinzufügen
5. **sat_projektsachkonto Spaltennamen korrigieren**: 7 Namen an sources.yml anpassen
6. **link_adresse_person hinzufügen**: ADR.LOHNNR ↔ LEN.EMPL_NR
7. **sat_projekt um STATUS1 erweitern**
8. **sat_person um MUTATION_DATE erweitern**
9. **sat_person_adresse um LOHNJN, GESPERRT erweitern**

### Klären

10. **GKTO + KST2**: Als eigene Links oder als Satellite-Payload? (Architektur-Entscheidung)
11. **PUBL.ADR BK**: Ist `INR` die korrekte Abacus-Adressnummer? Datenanalyse empfohlen.
12. **Entity-Designer JSONs**: Sollen formale JSON-Definitionen erstellt werden?

---

## Anhang: Vollständige Spalten-Korrektur sat_projektsachkonto

```
Aktuell im Plan                 → Korrektur (sources.yml)
─────────────────────────────── → ──────────────────────
AZBUDGET                        → AZBUTINT
AZBETINT                        → AZBETINT (korrekt)
AZBETEXI                        → AZBETEXT
AZVORTRAGINT                    → AZVORTINT
AZVORTRAGEXI                    → AZVORTEXT
BUDGETINT                       → BUDGETINT (korrekt)
BUDGETEXI                       → BUDGETEXT
BETRAGINT                       → BETRAGINT (korrekt)
BETRAGEXI                       → BETRAGEXT
VORTRAGINT                      → VORTRAGINT (korrekt)
VORTRAGEXI                      → VORTRAGEXT
```

---

*EWB Analytics Platform | PPMC AG | Synapse Validation Report | 2026-07-22*
