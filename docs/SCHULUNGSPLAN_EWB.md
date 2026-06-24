# Schulungskonzept — Data Vault 2.1 & dbt Datenplattform EWB

> **Kunde:** Energie Wasser Buchs (EWB)
> **Anbieter:** ppmc analytics ag
> **Stand:** 2026-06-17
> **Ansprechpartner:** Daniel Fellner, MSc

---

## 1. Ausgangslage & Ziel

Die EWB stellt ihre Datenplattform von Synapse «structured-tables» auf eine
**Data Vault 2.1 Architektur mit dbt** auf Azure SQL um. Diese Schulung vermittelt
den Mitarbeitenden das nötige Wissen, um die neue Plattform zu **verstehen**, zu
**erweitern** und darauf **zu reportieren**.

**Übergeordnetes Ziel:**
Fachbereichs-Abnahme und Akzeptanz durch die Geschäftsleitung — und die
Befähigung des EWB-Teams, die Plattform eigenständig zu betreiben und auszubauen.

---

## 2. Drei Zielgruppen — drei Lernpfade

Nicht jede:r benötigt die gleiche Tiefe. Wir unterscheiden **drei Rollen**:

| Rolle | Braucht … | Fokus |
|-------|-----------|-------|
| 🏛️ **Architektur-Verständnis** | Das Gesamtbild der Plattform | «Wie funktioniert das System?» |
| 🛠️ **Implementierung** | Objekte selbst erstellen können | «Wie baue ich Staging → Vault → Mart?» |
| 📊 **Reporting** | Auf dem Vault reportieren | «Wie erstelle ich Power-BI-Berichte?» |

Die Module sind so geschnitten, dass jede Rolle nur die relevanten Bausteine besucht.

---

## 3. Modul-Baukasten

Die Schulung besteht aus **6 Modulen**. Sie bauen aufeinander auf, können aber je
nach Zielgruppe einzeln kombiniert werden.

| Modul | Titel | Dauer | Typ | 🏛️ | 🛠️ | 📊 |
|-------|-------|-------|-----|----|----|----|
| **M0** | Data Vault 2.1 — Grundlagen | 2–3 h | Theorie | ✅ | ✅ | ✅ |
| **M1** | Architektur Datenplattform EWB | 1–2 h | Theorie | ✅ | ✅ | ✅ |
| **M2** | ADF Beladungslogik | 1 h | Theorie/Demo | ✅ | ✅ | — |
| **M3** | Staging & Raw Vault | 2 h | Hands-on | — | ✅ | — |
| **M4** | Information Mart (Dimensionale Modellierung) | 1–2 h | Hands-on | — | ✅ | ✅ |
| **M5** | Reporting auf dem Vault (Power BI) | 2–3 h | Hands-on | — | — | ✅ |

✅ = empfohlen für diese Zielgruppe

### Modulinhalte im Detail

**M0 — Data Vault 2.1 Grundlagen** *(Theorie, 2–3 h)*
- Warum Data Vault? Auditierbarkeit, Historisierung, Quellenunabhängigkeit
- Die drei Kernobjekte: Hub, Satellite, Link
- Hash Keys & Hash Diffs — wozu?
- Entscheidungslogik: Welches Objekt wann?
- Abgrenzung zu klassischem Star Schema

**M1 — Architektur Datenplattform EWB** *(Theorie, 1–2 h)*
- Gesamtbild: ADLS → External Table → Staging → Raw Vault → Mart → Power BI
- Schichten und ihre Aufgaben
- Schema-Konventionen (stg / vault / mart)
- Werkzeuge: dbt Core, automate_dv, Azure SQL
- Live-Tour durch das bestehende EWB-Modell

**M2 — ADF Beladungslogik** *(Theorie/Demo, 1 h)*
- Wie kommen die Daten ins System? (Abacus / IDMS → Parquet → ADLS)
- Azure Data Factory Pipelines
- Lade-Frequenz, Inkrement, Monitoring

**M3 — Staging & Raw Vault** *(Hands-on, 2 h)*
- Parquet-Schema abfragen → External Table → Staging-View
- Hub, Satellite, Link selbst erstellen
- Multi-Source Hubs (eine Entität aus mehreren Quellen)
- Begleitdokument: `SCHULUNG_NEUES_BUSINESS_OBJEKT.md` (Schritte 1–7)

**M4 — Information Mart** *(Hands-on, 1–2 h)*
- Dimensionale Modellierung (Star Schema): Dimension vs. Fakt
- Granularität, SCD1 vs. SCD2
- Surrogate Keys
- Begleitdokument: `SCHULUNG_NEUES_BUSINESS_OBJEKT.md` (Schritt 8)

**M5 — Reporting auf dem Vault (Power BI)** *(Hands-on, 2–3 h)*
- Power BI an den Mart anbinden
- Semantisches Modell, Beziehungen, Measures
- Vorher/Nachher-Vergleich gegen Synapse-Reporting
- Visualisierung (ZebraBI vs. native Power-BI-Visuals)

---

## 4. Praktische Use-Cases

Die Theorie wird durchgängig an **drei realen EWB-Use-Cases** angewendet — vom
einfachen Einstieg bis zum vollständigen Architektur-Durchstich.

### UC1 — Mitarbeiterliste *(Einstieg, Reporting)*
> **Ziel:** Konsolidierte Liste aller Mitarbeitenden mit Funktionsbezeichnung und
> Kostenstelle — nutzbar für IT, HR und unternehmensweit.

- **Datenquelle:** Abacus (ERP)
- **Bereits im Vault:** `dim_person_v` (128 aktive MA), `dim_abteilung_v`, `dim_kostenstelle_v`
- **Zu erstellen:** konsolidierter View `dim_mitarbeiter_v` (Personal-Nr, Name, Funktion, Abteilung, Kostenstelle)
- **Eignung:** Idealer Einstieg — kleine, überschaubare Anforderung
- **Aufwand inkl. Schulung:** ca. **0.5–1 Tag**

### UC2 — Finanz-Reporting *(Priorität 1, Reporting)*
> **Ziel:** Power-BI-Umsetzung des «Finanz-Reportings» (Erfolgsrechnung) für die
> Geschäftsleitung — als Vorher/Nachher-Vergleich gegen das heutige Synapse-Reporting.

- **Datenquelle:** Abacus (FIBU) — bereits im Vault
- **Vergleichsbasis:** Bestehender Power-BI-Bericht «Erfolgsrechnung 2026 – 1.82» (Synapse structured-tables)
- **Bereits im Vault:** `mart_finance` (fakt_buchungen_v, dim_konto_v, dim_kostenstelle_v u.a.)
- **Schwerpunkt:** Reporting-Schicht, Power-BI-Modellierung, Visualisierung
- **Offener Punkt:** ZebraBI weiterverwenden oder native Power-BI-Visuals? *(siehe Abschnitt 7)*
- **Teilnehmende:** Luzia, Krisztina (Abteilungsleiterin Finanzen), Roger

### UC3 — IDMS Telekom-Abos «Abos 2.0» *(Vollständiger Architektur-Durchstich)*
> **Ziel:** Sales-Auswertung Telekom (Provider Rii Seez Net) mit aktiven Abo-Zahlen
> je Produkt (Internet, Festnetz, TV, Mobile) und Kundenkategorie (Privat/Business).
> Vergleichsbasis: bestehendes Qlik-Reporting «Abos 2.0».

- **Datenquellen:** IDMS (neu anzubinden) + bestehendes Concept «telecom»
- **Bereits vorhanden:** Concept «telecom» mit RSN Mobile (CDR, Datenvolumen, Mobilkunden, Mobilverträge — auf datavault-test); ADF-Service für IDMS eingerichtet (noch nicht produktiv)
- **Zu erstellen:**
  - IDMS-Onboarding: sources.yml, External Tables, Staging-Views, dann Hub/Sat/Link
  - Telecom-Concept erweitern: Internet, Festnetz, TV (Mobile vorhanden)
  - Privat/Business-Kategorisierung pro Vertrag
  - Mart-Views: `dim_produkt_v` (alle Spartentypen), `fakt_aktive_abos_v`
- **Eignung:** Ideal als Architektur-Use-Case — berührt **alle Schichten** vom Quellsystem-Onboarding bis zum Reporting
- **Teilnehmende:** Luzia, Roger

**Aufwand UC3 (grobe Schätzung):**
| Teilaufgabe | Aufwand |
|---|---|
| IDMS-Onboarding (Staging + Vault) | 2–3 Tage |
| Telecom-Concept-Erweiterung (Internet/Festnetz/TV/Kategorisierung) | 1–2 Tage |
| Mart-Views + Schulungsmaterial | 1–2 Tage |

---

## 5. Terminplan (Vorschlag)

Die Module werden auf **mehrere Termine** verteilt — gestaffelt nach Priorität und
Zielgruppe. Die Termine bauen didaktisch aufeinander auf.

### 📅 Block A — Gemeinsame Grundlagen *(alle Teilnehmenden)*

| Termin | Inhalt | Module | Dauer | Teilnehmende |
|--------|--------|--------|-------|--------------|
| **A1** | DV-Grundlagen & Architektur | M0 + M1 | ½ Tag | Luzia, Krisztina, Roger |

> Gemeinsamer Einstieg für alle. Schafft das gemeinsame Vokabular und Verständnis.

### 📅 Block B — Reporting-Track *(Priorität 1)*

| Termin | Inhalt | Module / UC | Dauer | Teilnehmende |
|--------|--------|-------------|-------|--------------|
| **B1** | Mart-Grundlagen + Mitarbeiterliste | M4 + UC1 | ½ Tag | Luzia, Krisztina, Roger |
| **B2** | Finanz-Reporting Power BI (Teil 1) | M5 + UC2 | 1 Tag | Luzia, Krisztina, Roger |
| **B3** | Finanz-Reporting Power BI (Teil 2) + Abnahme-Vorbereitung | M5 + UC2 | ½–1 Tag | Luzia, Krisztina, Roger |

> Startet mit dem einfachen Einstieg (Mitarbeiterliste), dann der priorisierte
> Finanz-Reporting-Use-Case als Reporting-Schulung mit echtem Geschäftswert.

### 📅 Block C — Implementierungs-Track *(Architektur-Durchstich)*

| Termin | Inhalt | Module / UC | Dauer | Teilnehmende |
|--------|--------|-------------|-------|--------------|
| **C1** | ADF Beladungslogik + IDMS-Quelle | M2 + UC3 | ½ Tag | Luzia, Roger |
| **C2** | Staging & Raw Vault — IDMS-Onboarding | M3 + UC3 | 1 Tag | Luzia, Roger |
| **C3** | Telecom-Erweiterung + Mart (dim_produkt, fakt_aktive_abos) | M3 + M4 + UC3 | 1 Tag | Luzia, Roger |
| **C4** | Reporting «Abos 2.0» + Qlik-Vergleich | M5 + UC3 | ½ Tag | Luzia, Roger |

> Der vollständige Durchstich vom Quellsystem bis zum Reporting — die «Königsdisziplin».

---

## 6. Empfohlene Reihenfolge & Abhängigkeiten

```
Block A (Grundlagen — alle)
   │
   ├──────────────────────┬───────────────────────────┐
   ▼                      ▼                            ▼
Block B (Reporting)   Block C (Implementierung)
A1 → B1 → B2 → B3     A1 → C1 → C2 → C3 → C4

Priorität:  Block A  >  Block B (Finanz-Reporting!)  >  Block C
```

- **Block A** ist Voraussetzung für alles.
- **Block B** hat **Priorität 1** (Finanz-Reporting für GL-Abnahme).
- **Block C** kann parallel oder im Anschluss laufen (eigene Teilnehmergruppe).

---

## 7. Offene Punkte zur Abstimmung

1. **ZebraBI-Lizenz:** Soll die ZebraBI-Visualisierung (Lizenz für 100 MA)
   weiterverwendet werden, oder die Darstellung neu **ohne Zusatztool** mit nativen
   Power-BI-Visuals umgesetzt werden? → vor Block B zu klären.
2. **Schulungstiefe je Person:** Wer benötigt nur das Architektur-Gesamtbild, wer
   möchte Objekte implementieren, wer reines Reporting? → bestimmt die Modulauswahl.
3. **Umgebung:** Schulung auf `datavault-test` oder dedizierte Schulungsumgebung?
4. **IDMS produktiv:** ADF-Service für IDMS ist eingerichtet, aber noch nicht
   produktiv — Status vor Block C zu klären.

---

## 8. Begleitmaterial

| Material | Inhalt |
|----------|--------|
| `SCHULUNG_NEUES_BUSINESS_OBJEKT.md` | Schritt-für-Schritt-Leitfaden: External Table → Staging → Vault → Mart (Praxis für M3/M4) |
| Live-Modell EWB | Bestehende Hubs/Sats/Links/Marts als Anschauungsbeispiel |
| ER-Diagramme | Visualisierung Raw Vault & Mart |
| 📖 Buchempfehlung | *Building a Scalable Data Warehouse with Data Vault 2.0* (Linstedt/Olschimke) — für die vertiefte theoretische Auseinandersetzung |

> **Hinweis zur Schulungsform:** Ein vollständiger Online-Kurs wäre überdimensioniert.
> Empfohlen wird ein praxisorientierter Fokus auf die **tatsächlich verwendete
> Architektur** der EWB-Datenplattform — Theorie nur so viel wie nötig, kombiniert
> mit Hands-on an echten Use-Cases.

---

## 9. Aufwandsübersicht (grobe Schätzung)

| Block | Inhalt | Aufwand (Durchführung) |
|-------|--------|------------------------|
| A | Grundlagen & Architektur | ½ Tag |
| B | Reporting-Track (inkl. Finanz-Reporting) | 2–2.5 Tage |
| C | Implementierungs-Track (IDMS Telekom Abos) | 3 Tage Schulung + 4–7 Tage Implementierung* |

\* Die Implementierungs-Aufwände für UC3 (IDMS-Onboarding 2–3 T, Telecom-Erweiterung
1–2 T, Mart-Views 1–2 T) fallen teilweise als **Entwicklungsarbeit** an, die in der
Schulung gemeinsam erarbeitet wird.

---

*Dieses Konzept ist ein Vorschlag zur Abstimmung. Detaillierungsgrad, Reihenfolge und
Teilnehmerkreis können flexibel angepasst werden.*
