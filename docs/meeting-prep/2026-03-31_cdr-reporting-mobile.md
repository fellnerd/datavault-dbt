# Meeting-Vorbereitung: CDR-Reporting Mobile
**Datum:** 31. März 2026  
**Teilnehmer:** Daniel Fellner (PPMC), Roger Bless (EWB), Marco Prosch (EWB), ggf. Luzia  
**Ziel:** Scope, Architektur und Vorgehen für das CDR-Schulungsprojekt klären

---

## 1. Entscheidungspunkt: Architektur

Marco hat eine **Microsoft Fabric**-Architektur (Bronze/Silver/Gold Lakehouse + Power BI + Real-Time Intelligence) skizziert.  
Die bestehende EWB-Datenplattform läuft auf **Azure SQL + dbt (Data Vault 2.1)**.

### Gegenüberstellung

| Kriterium | Marco's Fabric-Vorschlag | Bestehende Plattform (Azure SQL + dbt) |
|---|---|---|
| Technologie | Microsoft Fabric (neu) | Azure SQL + dbt (bereits produktiv) |
| Aufwand Setup | ~2–3 Wochen | ~1–2 Tage (Erweiterung bestehend) |
| Real-Time | Real-Time Intelligence (Activator) | Lambda Vault Pattern (near-real-time) |
| Schulungsaufwand | Neue Plattform lernen | Gleiche Toolchain wie Abacus-Projekt |
| Kosten | Neue Fabric Capacity notwendig | Bestehende SQL-Ressourcen |
| BSS/OSS-Migration | Nochmals Migration nötig | Nur Staging-Schicht anpassen |
| Power BI | Direktanbindung | DirectQuery auf Azure SQL (bereits konfiguriert) |

**Empfehlung für Meeting:** Bestehende Plattform erweitern — Fabric erst nach BSS/OSS-Einführung (Ende 2026) evaluieren. Die entkoppelte DV-Architektur macht eine spätere Migration trivial.

---

## 2. Lambda Vault Pattern — Erklärung für Marco/Roger

Das Problem: CDR-Daten kommen **alle 10 Minuten** (Realtime-Delta) + einmal täglich ein vollständiger **Stammdaten-Abzug** (RSN_services).

```
                    ┌──────────────────────────────────┐
                    │         Lambda Vault              │
                    │                                   │
 RSN_CDRS           │  ┌────────────────────────────┐   │
 (alle 10 min) ───► │  │  Raw Vault (Batch Layer)   │   │
                    │  │  hub_mobilvertrag           │   │
                    │  │  sat_cdr_datenvolumen       │   │
 RSN_services       │  └────────────┬───────────────┘   │
 (täglich 7am) ──►  │               │ vereint            │
                    │  ┌────────────▼───────────────┐   │
                    │  │  Serving Layer (Power BI)  │   │
                    │  │  "aktueller Verbrauch       │   │
                    │  │   pro Kunde heute"          │   │
                    │  └────────────────────────────┘   │
                    └──────────────────────────────────┘
```

**Praktisch:** Das Produktmanagement sieht in Power BI nicht nur den gestrigen Stand (Batch), sondern den kumulierten Verbrauch bis vor 10 Minuten.

---

## 3. CDR-Datenmodell (erster Entwurf)

Basierend auf den von Marco gelieferten Dateistrukturen:

### Quelldateien

| Datei | Frequenz | Volumen | Business Key |
|---|---|---|---|
| `RSN_CDRS_DDMMYYYYhhmmss.csv` | alle 10 min (~150/Tag) | ~900 Zeilen/Datei → **~135.000 Zeilen/Tag** | `id` (CDR-Ereignis) |
| `RSN_services_DDMMYYYYhhmmss.csv` | 1×/Tag um 7 Uhr | **8.000+ Zeilen** | `vertrags_nummer` |

### Data Vault Objekte (Vorschlag)

```
hub_mobilvertrag      BK: vertrags_nummer (= contract_id in CDR)
  └── sat_mobilvertrag    abo_option_name, rufnummer, aktivierungsdatum, kundigungsdatum
  └── sat_cdr_datenvolumen  bytes_in, bytes_out, duration, call_type, service_type, tarif
                            (pro Ereignis aus RSN_CDRS)

hub_simkarte          BK: iccid (= icc in services)

link_vertrag_simkarte  contract_id ↔ iccid (aus CDR/services)

hub_mobilkunde        BK: customer_id
  └── sat_mobilkunde    external_customer_id, abo_option_name
```

### Schlüssel-Join zwischen den Dateien

```
RSN_CDRS.contract_id  = RSN_services.vertrags_nummer   ← primärer Link
RSN_CDRS.iccid        = RSN_services.icc               ← Verifikation SIM-Karte
```

### Zentrale Business-Metrik (Reporting-Ziel)

```sql
-- Datenvolumen pro Vertrag / Monat (für Tarif-Optimierung)
SELECT
    k.customer_id,
    k.external_customer_id,
    s.abo_option_name,
    SUM(c.bytes_in + c.bytes_out) / 1024.0 / 1024.0 / 1024.0 AS total_gb,
    CASE WHEN SUM(...) > 10*1024*1024*1024 THEN 'Flat lohnt sich' ELSE 'Daten-Tarif günstiger' END AS empfehlung
FROM vault.sat_cdr_datenvolumen c
JOIN vault.hub_mobilvertrag v ON ...
```

---

## 4. Scope Schulungsprojekt — Vorschlag für Diskussion

| Phase | Inhalt | Aufwand | Wer | Timing |
|---|---|---|---|---|
| **0 — Vorbereitung** | CDR-FTP-Anbindung via ADF (analog Abacus-Pattern), External Tables | 1 Tag | Daniel | Mai 2026 |
| **1 — Staging** | ewb_tel_cdr_main + ewb_tel_services_main Staging-Views | 1 Tag | Daniel + Marco/Luzia | Mai 2026 |
| **2 — Raw Vault** | Hubs, Satellites, Links, Lambda Vault Setup | 2 Tage | Daniel (Lead), Marco (lernt) | Mai/Juni 2026 |
| **3 — Mart + Reporting** | dim_mobilvertrag, fakt_datenvolumen, Power BI Dashboard | 1–2 Tage | Marco (Lead), Daniel (Begleitung) | Juni 2026 |
| **Total** | | **5–6 Tage** | | **Q2 2026** |

**Voraussetzung:** Stammdaten (Abacus Wave 1 abgeschlossen) → April/Mai 2026

---

## 5. Klärungsbedarf / Offene Fragen für Meeting

### Fachlich
- [ ] **Tarif-Logik:** Ab genau welchem GB-Schwellwert lohnt sich welcher Tarif? (Für Mart-Berechnung)
- [ ] **Auswertungszeitraum:** Pro Monat? Pro Abrechnungsperiode? Rollierend 30 Tage?
- [ ] **Kundenzuordnung:** Ist `customer_id` in RSN_services identisch mit Abacus-Kundennummer? (Möglicher Hub-Join mit `hub_person`)
- [ ] **Datenvolumen-Richtung:** bytes_in und bytes_out — aus Kundensicht oder Netzwerk-Sicht? Beide relevant?
- [ ] **call_type / service_type:** Welche Werte gibt es? (z.B. nur "GPR"/"S-CDR" oder auch Voice?)
- [ ] **record_type:** Gibt es verschiedene Typen die unterschiedlich behandelt werden müssen?

### Technisch / FTP
- [ ] **FTP-Zugang:** Welche Credentials/Infrastruktur? Direktzugang via ADF-SHIR (EWBSBI01) möglich?
- [ ] **Datei-Archivierung:** Werden alte CDR-Dateien auf dem FTP gelöscht? Wie lange Retention?
- [ ] **Vollständigkeit:** Gibt es eine Möglichkeit, verpasste Dateien zu erkennen (Sequenznummer?)?
- [ ] **Encoding:** UTF-8 oder Latin-1? (Wichtig für Sonderzeichen in Kundennamen)
- [ ] **Trennzeichen:** Semicolon-separiert, double-quote escaped — ist das konsistent?

### Projekt / Organisation
- [ ] **Luzia:** Ist sie Teil des Schulungsprojekts? Welche Rolle?
- [ ] **Marco's Vorkenntnisse:** SQL, Python, dbt — was ist bereits vorhanden?
- [ ] **Zeitbudget Marco:** Wie viel Zeit kann Marco pro Woche investieren?
- [ ] **Genehmigung/Budget:** Ist der Aufwand (5–6 Tage PPMC) bereits budgetiert oder braucht es ein Angebot?

---

## 6. Architektur-Diskussion: Fabric oder nicht?

**Falls in Meeting gefragt wird, warum nicht Fabric:**

> Fabric macht Sinn, wenn man *neu startet* oder Streaming-Anforderungen hat, die Azure SQL nicht abbilden kann. Für ~135k Zeilen/Tag mit 10-Minuten-Granularität ist Azure SQL völlig ausreichend. Fabric Real-Time Intelligence (Activator) wäre overkill für "täglich Tarif-Empfehlungen". Der echte Vorteil: Das Schulungsprojekt nutzt exakt dieselbe Toolchain und dasselbe Wissen wie das laufende Abacus-Projekt — Marco lernt dbt, Data Vault und Azure SQL, was er für alle zukünftigen Domains braucht. Mit Fabric würde er eine isolierte Insellösung bauen.

**Falls Roger / Marco trotzdem Fabric bevorzugen:**  
→ Empfehlung: Erst Scope auf Fabric Bronze/Silver/Gold konzentrieren (ohne Real-Time Intelligence aufzubauen), damit Marco lernt. Aber dann Fabric Capacity (F2/F4) einplanen und Kosten abklären.

---

## 7. Nächste Schritte nach Meeting

- [ ] Entscheidung Architektur festhalten (Plattform-Erweiterung vs. Fabric)  
- [ ] Kickoff-Termin Q2 2026 fixieren  
- [ ] FTP-Zugangsdaten und technische Details von Marco erhalten  
- [ ] Kurze Aufwandsschätzung / Angebot erstellen (wenn Budget-Genehmigung nötig)  
- [ ] Schulungsplan für Marco/Luzia skizzieren

---

## Anhang: CDR-Felder Referenz

### RSN_CDRS (Call Detail Record)
| Feld | Typ | Beschreibung | DV-Verwendung |
|---|---|---|---|
| `id` | BIGINT | Eindeutige CDR-ID | Business Key Hub |
| `contract_id` | VARCHAR | Vertragsnummer → = `vertrags_nummer` in services | FK Hub |
| `signaling_start` | DATETIME | Beginn Signalisierung | Satellite |
| `connection_start` | DATETIME | Verbindungsbeginn | Satellite, Load Date |
| `duration` | INT | Gesprächsdauer (Sekunden?) | Satellite |
| `imsi` | VARCHAR | SIM-Identifikation (Netz) | Satellite |
| `iccid` | VARCHAR | SIM-Karten-ID → = `icc` in services | FK Hub Simkarte |
| `a` | VARCHAR | A-Rufnummer (Anrufer) | Satellite |
| `pai` | VARCHAR | P-Asserted-Identity | Satellite |
| `b` | VARCHAR | B-Rufnummer (Angerufener) | Satellite |
| `call_type` | VARCHAR | Anruftyp (z.B. leer = Data) | Satellite |
| `record_type` | VARCHAR | z.B. "S-CDR" | Satellite |
| `service_type` | VARCHAR | z.B. "GPR" (GPRS/Data) | Satellite, Filter |
| `bytes_in` | BIGINT | Empfangene Bytes | **Metrik Mart** |
| `bytes_out` | BIGINT | Gesendete Bytes | **Metrik Mart** |
| `data_packet` | VARCHAR | Datenpaket-Info | Satellite |
| `r_mcc_mnc` | VARCHAR | Roaming-Netz MCC/MNC | Satellite |
| `price` | DECIMAL | Preis | Satellite |
| `ws_price` | DECIMAL | Wholesale-Preis | Satellite |
| `tarif` | VARCHAR | z.B. "Data in National (CH + FL)" | **Mart Filter/Group** |

### RSN_services (Stammdaten / Abonnements)
| Feld | Typ | Beschreibung | DV-Verwendung |
|---|---|---|---|
| `customer_id` | VARCHAR | Interne Kunden-ID | Business Key Hub Kunde |
| `external_customer_id` | VARCHAR | Externe Kunden-ID (Abacus?) | Satellite, potenziell Hub-Join |
| `abo_option_name` | VARCHAR | z.B. "Mobile S 2018" | Satellite, Dimension |
| `rufnummer` | VARCHAR | Rufnummer | Satellite |
| `icc` | VARCHAR | SIM-Karten-ID → = `iccid` in CDR | FK Hub Simkarte |
| `aktivierungs_datum` | DATETIME | Vertragsbeginn | Satellite (SCD2) |
| `kundigungs_datum` | DATETIME | Vertragsende | Satellite |
| `mlz_datum` | DATETIME | Mindestlaufzeit-Ende | Satellite |
| `vertrags_nummer` | VARCHAR | Vertragsnummer → = `contract_id` in CDR | Business Key Hub Vertrag |
| `ist_option` | BIT/INT | Ist Zusatzoption? (0/1) | Satellite, Filter |




# Infos aus dem Termin
innehalb der vertragslaufzeit kann die rufnummer gewechselt werdern
Vertragnummer, Kundennummer bleibt gleich
Rufnummer ist auf den Haupvertrag gebunden... wir gehen davon aus das eine 1 nummer 1 vertrag entspricht --> die doppelten einträge aktuell sind alte einträge, sollte aber in zukunft nicht mehr vorkommen
datum bei Kündigungsdatun --> wann der Vertrag tatsächlich gekündigt wird
1 Kunde kann mehere vertragsnummer haben, 1 vertrag nur 1 rufnummer --> vertragsnummer ist link zu den cdr
iscm kann sich ändern, rufnummer kann kleich bleiben
bytes in sollte immer leer sein, bites_in_out ist aus Kundensicht was er empfangen und gesendet hat
r_mcc_mnc -> id in welchen land und welchen provider hat er ein verbindung hersgestellt (roaming)
nachdem jeden tag neue files kommen, muss eine history vorhanden sein um nachzuvollziehen wann der kunde zb. gekündigt hat.
zb kunde 71xxx kann in einem weiteren export nachdem er gekündigt hat nicht mehr vorkommen. Also Kündigungsdatum ist in der spalte eingetragen und in einen späteren export ist er nicht mehr in der liste
Bei der Beladung muss auf die historisierung im initialload aufgepasst werden