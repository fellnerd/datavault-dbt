# Schulung: Data Vault 2.1 & Datenplattform EWB — Grundlagen & Architektur

> **Kunde:** Energie Wasser Buchs (EWB)
> **Anbieter:** ppmc analytics ag
> **Termin:** 3. Juli 2026 · Online · 120 Minuten
> **Teilnehmende:** Luzia, Krisztina, Roger
> **Referent:** Daniel Fellner, MSc
> **Stand:** 2026-06-27
>
> Begleitendes **Handout** zu **Block A** des Schulungsplans (Module **M0 — Data Vault Grundlagen**
> und **M1 — Architektur Datenplattform EWB**). Zum Mitlesen während der Schulung und zum
> Nachschlagen danach.

---

## 📑 Inhaltsverzeichnis

**Teil 1 — Data Vault 2.1 Grundlagen**
1. [Warum Data Vault 2.1?](#1-warum-data-vault-21)
2. [Die drei Kernobjekte: Hub, Satellite, Link](#2-die-drei-kernobjekte-hub-satellite-link)
3. [Hash Keys & Hash Diffs](#3-hash-keys--hash-diffs)
4. [Entscheidungslogik — welches Objekt wann?](#4-entscheidungslogik--welches-objekt-wann)
5. [Abgrenzung zum klassischen Star Schema](#5-abgrenzung-zum-klassischen-star-schema)
6. [Gesamtbild Teil 1](#6-gesamtbild-teil-1)

**Teil 2 — Architektur Datenplattform EWB**
7. [Gesamtbild: Die vier Schichten](#7-gesamtbild-die-vier-schichten)
8. [Die Schichten und ihre Aufgaben](#8-die-schichten-und-ihre-aufgaben)
9. [Schema-Konventionen (stg / vault / mart)](#9-schema-konventionen-stg--vault--mart)
10. [Werkzeuge: dbt Core, automate_dv, Azure SQL](#10-werkzeuge-dbt-core-automate_dv-azure-sql)
11. [Live-Tour durch das bestehende EWB-Modell](#11-live-tour-durch-das-bestehende-ewb-modell)
12. [Zusammenfassung & Ausblick](#12-zusammenfassung--ausblick)

[Glossar — Kurzreferenz](#glossar--kurzreferenz) · [Weiterführendes](#weiterführendes)

---

## Über dieses Handout

Diese Schulung legt das **gemeinsame Fundament** für alle weiteren Module: ein gemeinsames
Vokabular und das Verständnis, *wie* und *warum* die EWB-Datenplattform so aufgebaut ist.
Sie ist bewusst **konzeptionell** gehalten — die praktische Umsetzung (Objekte selbst bauen,
Reporting) folgt in den Modulen M2–M5. Inhaltlich ist dieses Handout das **technische Fundament** der
PPMC-„Data Vault Analytics Plattform"; die zugehörige Produkt-Präsentation liefert die ergänzende
Management-Perspektive.

### Lernziele

Nach dieser Schulung können Sie …

- … erklären, **warum** EWB auf Data Vault 2.1 setzt und welche Probleme es löst.
- … die drei Kernobjekte **Hub, Satellite, Link** unterscheiden und benennen, wozu sie dienen.
- … erklären, was **Hash Keys** und **Hash Diffs** sind und warum es sie gibt.
- … die **vier Schichten** der Plattform (Staging, Raw Vault, Mart, Power BI) und ihre Aufgaben einordnen.
- … die **Namens- und Schema-Konventionen** lesen und sich im bestehenden EWB-Modell orientieren.

### Agenda (120 Minuten)

| Zeit | Inhalt |
|------|--------|
| 5 min | Begrüßung, Lernziele, Agenda |
| 55 min | **Teil 1 — Data Vault 2.1 Grundlagen** (Kapitel 1–6) |
| 5 min | Pause |
| 45 min | **Teil 2 — Architektur Datenplattform EWB** (Kapitel 7–11) |
| 10 min | Zusammenfassung, Ausblick M2–M5, Fragen |

> 🎯 **So lesen Sie dieses Handout:** Jedes Kapitel beginnt mit einer **Kernbotschaft** (🎯) —
> der einen Satz, den Sie mitnehmen sollten. Darunter folgt die ausführliche Erklärung mit
> Beispielen aus dem **echten EWB-Modell**.

---

# Teil 1 — Data Vault 2.1 Grundlagen

## 1. Warum Data Vault 2.1?

> 🎯 **Kernbotschaft:** Data Vault trennt *Integration* (Rohdaten revisionssicher sammeln) von
> *Auswertung* (Daten konsumfertig aufbereiten) — und gewinnt dadurch Historisierung,
> Auditierbarkeit und die Fähigkeit, jederzeit neue Quellen anzubauen.

### Das Problem klassischer Data Warehouses

Ein klassisches Data Warehouse modelliert die Auswertungssicht (Star Schema) **direkt** auf den
Quelldaten. Das funktioniert, solange sich wenig ändert. In der Realität ändert sich aber laufend
etwas:

- Eine **neue Quelle** kommt dazu (z. B. IDMS zusätzlich zu Abacus) → das Modell muss umgebaut werden.
- Eine **Struktur ändert sich** im Quellsystem → nachgelagerte Tabellen brechen.
- Es wird gefragt: **„Wie sah dieser Datensatz vor drei Monaten aus?"** → die Antwort fehlt, weil nur der aktuelle Stand gespeichert wurde.

> 💡 **Aus der Praxis — vier typische Schmerzpunkte** (aus der EWB-Plattform-Präsentation):
> - **„Welche Zahl stimmt?"** — Sales sagt 3,2 Mio., Finance 2,9 Mio. Jede Abteilung hat ihre eigene Excel-Auswertung; das Management verliert das Vertrauen in die Daten.
> - **„Ein Update — und alles steht still."** — Ein ERP-Release trifft 14 direkte Schnittstellen; statt Innovation ein 6-Wochen-Notfall-Sprint.
> - **„Neuer Report? Dauert drei Monate."** — Daten aus vier Systemen müssen erst manuell konsolidiert werden.
> - **„Wo liegen eigentlich die Daten?"** — Der Datenpfad eines Kunden ist nicht lückenlos belegbar — es fehlt die *Lineage*.
>
> Gemeinsame Ursache: **keine zentrale Integrationsschicht** (Point-to-Point statt Plattform). Genau diese Lücke schließt Data Vault.

### Die Antwort von Data Vault 2.1

Data Vault führt eine **Integrationsschicht** (den *Raw Vault*) ein, die nach festen Regeln aufgebaut
ist. Diese Schicht hat vier Eigenschaften, die für EWB den Ausschlag geben:

| Eigenschaft | Was es bedeutet | Nutzen für EWB |
|---|---|---|
| **Historisierung** | Jede Änderung wird als neue Version gespeichert, nichts wird überschrieben | „Wie war der Kontostand / die Buchung im März?" ist beantwortbar |
| **Auditierbarkeit** | Jeder Datensatz trägt Herkunft (`dss_record_source`) und Ladezeitpunkt (`dss_load_date`) | Nachvollziehbar, woher eine Zahl im Bericht stammt |
| **Quellenunabhängigkeit** | Mehrere Quellen können dieselbe Entität beschreiben | Abacus, IDMS, Compax nebeneinander — ohne Umbau |
| **Erweiterbarkeit** | Neue Quellen/Attribute werden *angebaut*, nicht eingebaut | Neue Anforderungen ohne Bruch am Bestehenden |

> 💡 **EWB-Kontext:** Die Plattform löst die bisherige Synapse-„structured-tables"-Lösung ab.
> Statt fester, schwer änderbarer Tabellen entsteht eine schichtweise, erweiterbare Architektur —
> der zentrale Grund für den Umstieg.

### Der Leitsatz

> **„Single version of the facts, not a single version of the truth."**
> Der Raw Vault speichert die Daten **so wie sie aus der Quelle kamen** (die *Fakten*) — inklusive
> Widersprüchen und Historie. Die *Wahrheit* (Bereinigung, Geschäftsregeln) entsteht erst später
> im Mart. Das macht den Vault revisionssicher und neutral.

In der Plattform-Sprache der EWB: Der Vault ist der **Single Point of Facts** — die *gemeinsame
Wahrheit* (Single Source of Truth) als Core-Data-Warehouse, das alle dispositiven Datenströme
zusammenführt.

### Stärken & Trade-offs — ehrlich betrachtet

Data Vault 2.1 (entwickelt von Dan Linstedt) ist auf **skalierbare, agile** Enterprise-Warehouses
ausgelegt. Die Stärken …

| Stärke | Bedeutung |
|---|---|
| **Agilität** | Regressionsfreie Modell-Erweiterung — Bestehendes wird **nie** verändert |
| **Quellintegration** | Heterogene Quellen (Abacus, IDMS, Compax …) nahtlos integrierbar |
| **Skalierbarkeit** | Volumen- und strukturseitig praktisch unbegrenzt |
| **Historie** | Lückenlose Historisierung aller Attribute über die Zeit |
| **Testbarkeit** | Automatisierbare Regressionstests über dbt |

… und die Trade-offs, die die Architektur **bewusst kompensiert**:

| Trade-off | Kompensation in der Plattform |
|---|---|
| Komplexes Core-Modell, viele Objekte | Generierung statt Handarbeit (dbt + automate_dv) |
| Join-Overhead bei Direktabfragen auf den Core | **Direktabfragen auf den Core sind nicht zugelassen** — Zugriff nur über Information Marts / PIT-Objekte |

> 💡 Der Aufwand entsteht **einmalig im Setup** und wird durch Wiederverwendbarkeit, Agilität und
> garantierte Datenqualität im laufenden Betrieb vielfach kompensiert.

---

## 2. Die drei Kernobjekte: Hub, Satellite, Link

> 🎯 **Kernbotschaft:** Data Vault zerlegt jede Entität in genau drei Bausteine — **Hub** (der
> Schlüssel/„was existiert"), **Satellite** (die Attribute & ihre Geschichte) und **Link** (die
> Beziehung). Mehr braucht der Raw Vault nicht.

### 🔑 Hub — „Was existiert?"

Ein **Hub** speichert **nur den Business Key** — die eindeutige fachliche Identifikation einer Entität.

- Keine Attribute, keine Historie — nur „dieses Objekt existiert".
- Einmal drin, immer drin (immutable).
- **EWB-Beispiel:** `vault.hub_hauptbuch` enthält pro Buchungszeile den Schlüssel `RECNUM`.
  `vault.hub_konto` enthält jede Konto-Nummer (`KTO`).

### 📋 Satellite — „Wie sieht es aus, und wie hat es sich verändert?"

Ein **Satellite** speichert **alle beschreibenden Attribute** einer Entität **plus die komplette Geschichte**.

- Jede inhaltliche Änderung = ein neuer Datensatz (alte Version bleibt erhalten).
- Hängt über den Hash Key am Hub.
- **EWB-Beispiel:** `vault.sat_hauptbuch__abacus` trägt die 36 Buchungsattribute
  (Betrag, Datum, Text, MwSt …). `vault.sat_person__abacus` trägt die Personenattribute
  (Name, Vorname, Eintrittsdatum …).

> 💡 Ein Hub kann **mehrere Satelliten** haben — z. B. je Quellsystem einen (`__abacus`, `__idms`,
> `__compax`). Genau das ist die *Quellenunabhängigkeit*: dieselbe Entität, beschrieben aus
> mehreren Quellen.

### 🔗 Link — „Wie hängen zwei Entitäten zusammen?"

Ein **Link** verbindet zwei (oder mehr) Hubs und modelliert eine **Beziehung**.

- Enthält selbst keine Attribute (nur die verknüpften Schlüssel).
- Kann **M:N**-Beziehungen abbilden — ohne Modelländerung.
- **EWB-Beispiel:** `vault.link_hauptbuch_konto` verbindet eine Buchungszeile (`hub_hauptbuch`)
  mit ihrem Konto (`hub_konto`).

### Das Zusammenspiel auf einen Blick

```
        🔑 hub_hauptbuch            🔗 link_hauptbuch_konto           🔑 hub_konto
        (RECNUM)          ◄────────  (RECNUM ↔ KTO)  ────────►        (KTO)
            │                                                            │
            │ hk_hauptbuch                                               │ hk_konto
            ▼                                                            ▼
    📋 sat_hauptbuch__abacus                                    📋 (Stammdaten via
       (Betrag, Datum, Text,                                       ref_konto / Sharepoint)
        MwSt … + Historie)
```

> ⚠️ **Wichtig:** Hubs und Links enthalten **nie** beschreibende Attribute, Satelliten enthalten
> **nie** Schlüssel anderer Entitäten. Diese strikte Trennung ist es, die das Modell stabil und
> erweiterbar hält.

---

## 3. Hash Keys & Hash Diffs

> 🎯 **Kernbotschaft:** Der **Hash Key** ist ein berechneter, einheitlicher Ersatzschlüssel (aus dem
> Business Key) — er verbindet die Objekte. Der **Hash Diff** ist ein Fingerabdruck aller Attribute
> — er erkennt Änderungen.

### #️⃣ Hash Key (`hk_…`)

Ein **Hash Key** ist ein technischer Schlüssel, der per **SHA-256** aus dem Business Key berechnet wird
(64-Zeichen-Hex-String).

**Warum nicht einfach den Business Key verwenden?**

- **Einheitliche Länge & Typ** — egal ob der Quell-BK eine Zahl, ein Text oder zusammengesetzt ist.
- **Vorab berechenbar** — jede Quelle kann denselben Hash unabhängig berechnen; gleiche Eingabe → gleicher Hash. Dadurch lassen sich Objekte **ohne Lookup** verknüpfen.
- **Performant** — Joins laufen über einen schmalen, indizierbaren Schlüssel.

```
BK "RECNUM = 4711"   ──SHA-256──►   hk_hauptbuch = "9F2A…(64 Zeichen)"
```

### ≠ Hash Diff (`hd_…`)

Ein **Hash Diff** ist der SHA-256-Fingerabdruck **aller fachlichen Attribute** eines Satelliten.

Beim Laden wird verglichen: Ist der Hash Diff identisch zum letzten Stand? → **keine Änderung**, kein
neuer Eintrag. Hat sich ein Attribut geändert? → **neuer Hash Diff** → neue Satelliten-Version.

```
Attribute (Betrag, Text, …)  ──SHA-256──►  hd_hauptbuch
   gleich wie zuletzt?  → nein  → neue Version im Satellite
                        → ja    → nichts tun
```

> 💡 **Echtes EWB-Beispiel für „was gehört NICHT in den Hash Diff":** Im Personen-Satelliten
> `sat_person__abacus` sind die Lohnperioden-Felder `LPE_YEAR` / `LPE_MONTH` **bewusst ausgeschlossen**.
> Sonst würde jeder Monatswechsel eine neue Personen-Version erzeugen — obwohl sich an der Person
> nichts geändert hat. Im Hash Diff stehen nur Felder, deren Änderung **fachlich** eine neue Version
> rechtfertigt.

---

## 4. Entscheidungslogik — welches Objekt wann?

> 🎯 **Kernbotschaft:** Jede Quellspalte bekommt genau eine Rolle — Business Key → Hub, Beziehung →
> Link, Attribut → Satellite, Technik → ignorieren. Diese Klassifikation *ist* der Modellentwurf.

### Spalten klassifizieren

Vor dem Bauen wird jede Spalte einer Kategorie zugeordnet:

| Kategorie | Bedeutung | Wird zu … |
|---|---|---|
| 🔑 **Business Key (BK)** | Eindeutiger, stabiler fachlicher Identifikator | Hash Key `hk_` im **Hub** |
| 🔗 **Foreign Key (FK)** | Verweis auf eine andere Entität | Hash Key für einen **Link** |
| 📋 **Attribut** | Fachliche Eigenschaft, die sich ändern kann | Payload im **Satellite** (Teil des `hd_`) |
| 🚫 **Systemfeld** | Technische Metadaten der Quelle | **Nicht** ins Data Vault |

### Wie erkenne ich den Business Key?

Ein guter Business Key ist **stabil** (ändert sich nie), **eindeutig** (identifiziert genau ein Objekt)
und **fachlich** (kommt aus der Quelle).

> 💡 **Echtes EWB-Beispiel — eine echte BK-Entscheidung:** Beim `hub_hauptbuch` war zunächst
> `DKBELEGNUMMER + KTO` als Schlüssel angedacht. Die Datenanalyse zeigte: **nicht eindeutig** —
> 62 % Nullwerte, bis zu 96 Duplikate je Kombination. `RECNUM` war eindeutig auf Zeilenebene — aber
> nur *innerhalb* einer Jahresscheibe (`E15`…`E26` vergeben `RECNUM` je neu ab 1). Der finale
> Business Key ist deshalb **zusammengesetzt: `RECNUM + dss_source_file_name`** (944 534/944 534
> eindeutig). *So sieht BK-Findung in der Praxis aus — iterativ und datenbasiert.*

### Entscheidungsbaum

```
Spalte X aus der Quelle
      │
      ├─ Identifiziert sie das Objekt eindeutig & stabil?   → 🔑 Business Key  → Hub
      │
      ├─ Verweist sie auf eine andere Entität (…_id, …nr)?  → 🔗 Foreign Key   → Link
      │
      ├─ Beschreibt sie das Objekt fachlich?                → 📋 Attribut      → Satellite
      │
      └─ Rein technisch (Timestamps, Flags, Debug)?         → 🚫 Systemfeld    → ignorieren
```

> ⚠️ **Faustregel FK:** Spalten mit `_id`- oder `_nr`-Endung, die auf eine *andere* Tabelle zeigen,
> sind fast immer Foreign Keys — Kandidaten für einen Link, kein Attribut.

---

## 5. Abgrenzung zum klassischen Star Schema

> 🎯 **Kernbotschaft:** Data Vault und Star Schema sind **kein Entweder-oder**. Der Vault ist die
> *Integrationsschicht* (revisionssicher sammeln), das Star Schema der *Konsumlayer* (einfach
> auswerten). Bei EWB liegen beide übereinander.

| Aspekt | Data Vault (Raw Vault) | Star Schema (Mart) |
|---|---|---|
| **Zweck** | Integrieren, historisieren, auditieren | Auswerten, reporten |
| **Optimiert für** | Laden & Nachvollziehbarkeit | Lesen & Verständlichkeit |
| **Änderungen** | Voll historisiert (jede Version) | Meist nur aktueller Stand (SCD1) |
| **Struktur** | Hub / Satellite / Link | Dimension / Fakt |
| **Stabilität** | Sehr hoch (neue Quellen anbaubar) | Auf konkrete Auswertung zugeschnitten |
| **Zielgruppe** | Data Engineering | Power BI / Fachbereich |

### Warum nicht direkt nur ein Star Schema?

Weil das Star Schema **auf eine konkrete Auswertung optimiert** ist. Kommt eine neue Quelle oder Frage,
muss es umgebaut werden. Der Vault dagegen bleibt stabil — und aus ihm werden **beliebig viele** Marts
abgeleitet, je nach Bedarf.

```
            ┌────────────────────────────┐
 Quellen →  │   RAW VAULT (Integration)  │  ← einmal sauber, historisiert, stabil
            └─────────────┬──────────────┘
                          │  abgeleitet
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
   ⭐ Mart Finance   ⭐ Mart Project    ⭐ Mart Telecom   ← je Auswertung ein Star Schema
```

> 💡 **EWB-Konkret:** Aus *einem* Raw Vault entstehen heute schon die Marts `mart_finance`,
> `mart_project` und `mart_telecom` — jeder ein eigenes Star Schema für seinen Fachbereich.

### Modellierungs-Strategie: datengetrieben vs. anforderungsgetrieben

Hinter dem Unterschied steht eine andere Bau-Philosophie:

| | **Datengetrieben** (Data Vault 2.1) | **Anforderungsgetrieben** (klassisch Inmon/Kimball) |
|---|---|---|
| Core-Modell abgeleitet aus … | den **Strukturen der Quellsysteme** | den **bekannten Fachbereichs-Anforderungen** |
| Passt, wenn … | Anforderungen iterativ/unklar sind | Anforderungen vorab klar sind |
| Quellsystem ändert sich → | Core wird **additiv erweitert** (genau dafür gebaut) | Modell muss oft umgebaut werden |
| Charakter | flexibel, agil, erweiterbar | statisch, schwerer erweiterbar |

> 💡 EWB setzt bewusst auf den **datengetriebenen** Ansatz: Der Raw Vault bildet die Quellen neutral
> ab, fachliche Anforderungen werden Schritt für Schritt in Business Vault und Marts umgesetzt — ohne
> den Core anzutasten.

---

## 6. Gesamtbild Teil 1

> 🎯 **Kernbotschaft:** Hub + Satellite + Link + Hashes ergeben zusammen ein Modell, das gleichzeitig
> revisionssicher, quellenunabhängig und erweiterbar ist — die Basis für alles Weitere.

```
                         Eine Entität im Data Vault
                         ───────────────────────────

   🔑 HUB                     📋 SATELLITE(S)                  🔗 LINK
   ┌──────────────┐          ┌────────────────────┐          ┌────────────────────┐
   │ Business Key │── hk ──►  │ Attribute + Historie│         │ Beziehung zu       │
   │ "was         │          │ "wie sieht es aus,  │          │ anderem Hub        │
   │  existiert"  │          │  wie änderte es sich"│         │ (M:N möglich)      │
   └──────────────┘          └────────────────────┘          └────────────────────┘
        │  hk_ = SHA-256(Business Key)        hd_ = SHA-256(Attribute)
        └──────────────── verbindet & erkennt Änderungen ───────────────┘

   + dss_load_date (wann geladen)   + dss_record_source (woher)   → Audit & Historie
```

**Die fünf Kernaussagen von Teil 1:**

1. Data Vault trennt **Integration** (Vault) von **Auswertung** (Mart).
2. Drei Bausteine genügen: **Hub** (Key), **Satellite** (Attribute + Historie), **Link** (Beziehung).
3. **Hash Keys** verbinden, **Hash Diffs** erkennen Änderungen.
4. Jede Spalte bekommt **eine Rolle** — das ist der Modellentwurf.
5. Vault und Star Schema sind **komplementär**, kein Gegensatz.

---

# Teil 2 — Architektur Datenplattform EWB

## 7. Gesamtbild: Die vier Schichten

> 🎯 **Kernbotschaft:** Die Plattform ist streng in **vier Schichten** organisiert — Staging, Raw
> Vault (Core), Business Vault und Information Mart. Jede Schicht hat einen klaren technischen Zweck;
> gesteuert wird alles über dbt + automate_dv.

```
   Quellsysteme (Abacus · IDMS · Compax …)
            │   Azure Data Factory / Synapse — delta-basiert, inkrementell
            ▼
   Azure Data Lake Storage (ADLS) — Parquet-Dateien
            │
            ▼
   ┌────────────────────────────────────────────────────────────────────┐
   │ ① STAGING            stg.ext_* (External Table) · stg.* (View)       │ Rohzugriff + Hash-Keys
   ├────────────────────────────────────────────────────────────────────┤
   │ ② RAW VAULT (Core)   vault.hub_* / sat_* / link_*                    │ Integration + Historie
   │    nur HARD RULES (Datentyp, Systemfelder)                           │ „Single Point of Facts"
   ├────────────────────────────────────────────────────────────────────┤
   │ ③ BUSINESS VAULT     abgeleitete Objekte · sat_*_current_v           │ SOFT RULES (Fachlogik)
   ├────────────────────────────────────────────────────────────────────┤
   │ ④ INFORMATION MART   mart.* / mart_<concept>.* (dim_* / fakt_*)      │ Star Schema (BI-Zugriff)
   └────────────────────────────────────────────────────────────────────┘
            │                              ▲ kein Direktzugriff auf den Core!
            ▼
   📊 Power BI (DirectQuery · ZebraBI) — offen auch für Qlik, Tableau, Excel …

   Steuerung aller Schichten:  dbt + automate_dv  (Git · Lineage-Graph · CI/CD über DEV/TEST/PROD)
```

> 💡 Ein Diagramm der konkreten EWB-Architektur liegt im Repository unter `docs/architektur.png`
> (identisch zur Architektur-Übersicht in der Plattform-Präsentation).

---

## 8. Die Schichten und ihre Aufgaben

> 🎯 **Kernbotschaft:** Jede Schicht macht **eine** Sache — Staging berechnet Hashes, der Raw Vault
> integriert/historisiert (nur Hard Rules), der Business Vault interpretiert fachlich (Soft Rules),
> der Mart bereitet für die Auswertung auf.

| Schicht | Aufgabe | Regeln | EWB-Beispiel |
|---|---|---|---|
| **External Table** | Direkter Lesezugriff auf die Parquet-Datei aus Azure SQL | — | `stg.ext_ewb_fibu_gl` |
| **① Staging** | Rohdaten + Metadaten + **Hash-Berechnung** | technisch | `stg.ewb_fibu_gl` |
| **② Raw Vault (Core)** | **Integration & Historisierung** (Hub/Sat/Link), „Single Point of Facts" | **nur Hard Rules** | `vault.hub_hauptbuch`, `vault.sat_hauptbuch__abacus` |
| **③ Business Vault** | Fachliche Anreicherung, quellenübergreifende Konsolidierung, Current Views | **Soft Rules** | `sat_*_current_v`, abgeleitete Objekte |
| **④ Information Mart** | **Star Schema** für die Auswertung (Dimension/Fakt) | konsumorientiert | `mart_finance.fakt_buchungen_v`, `dim_konto_v` |

### Hard Rules vs. Soft Rules — die wichtigste Schicht-Trennung

| | **Hard Rules** (Raw Vault) | **Soft Rules** (Business Vault) |
|---|---|---|
| Was erlaubt | Datentyp-Anpassung, Systemfelder, Hashing | fachliche Interpretation & Berechnung |
| Was **nicht** | keine fachliche Logik, keine Bereinigung | — |
| Beispiele | „lade die Quelle 1:1, nur technisch normiert" | Adressnormalisierung, Feldkonsolidierung über Quellsysteme, Format-Standardisierung, abgeleitete Kennzahlen |

> 💡 **Warum diese Trennung?** Hard Rules verändern die fachliche Aussage der Daten **nicht** — der
> Core bleibt damit eine neutrale, revisionssichere Wahrheit. Erst der Business Vault interpretiert.
> So bleibt jederzeit nachvollziehbar, *was kam aus der Quelle* und *was haben wir daraus gemacht*.

> 💡 **Current Views als Soft-Rule-Beispiel:** Zwischen Satellit und Mart liegt je eine
> `*_current_v`-View (z. B. `sat_hauptbuch__abacus_current_v`). Sie filtert auf den **aktuellen Stand**
> (`dss_is_current = 'Y'`). Marts und Power BI lesen **immer** die Current View — **nie** den
> historisierten Satelliten direkt.

> ⚠️ **Kein Direktzugriff auf den Core (Plattform-Designprinzip):** Wegen des Join-Overheads sind
> Direktabfragen auf Hubs/Sats/Links **nicht zugelassen**. Daten werden ausschließlich über
> **Information Marts, PIT-Tabellen oder optimierte Hilfsobjekte** konsumiert.

> ⚠️ **ETL vs. ELT:** Es gibt kein klassisches ETL-Tool. Jede Schicht ist **SQL in dbt** — die
> Transformation passiert *in* der Datenbank (ELT). Das Modell **ist** der Code.

---

## 9. Schema-Konventionen (stg / vault / mart)

> 🎯 **Kernbotschaft:** Namen sind kein Zufall — aus Schema und Präfix lesen Sie sofort ab, in welcher
> Schicht ein Objekt liegt und was es ist.

### Datenbank-Schemata

| Schema | Inhalt |
|---|---|
| `stg` | Staging: External Tables (`ext_*`) und Staging Views |
| `vault` | Übergreifende Raw-Vault-Objekte (aus mehreren Quellen, „_common") |
| `vault_<concept>` | Quell-/domänenspezifische Vault-Objekte, z. B. `vault_telecom` |
| `mart` | Übergreifende Mart-Objekte |
| `mart_<concept>` | Domänen-Mart, z. B. `mart_finance`, `mart_project`, `mart_telecom` |

### Namensmuster der Objekte

```
   ext_<quelle>_<entität>       External Table     → ext_ewb_fibu_gl
   <quelle>_<entität>           Staging View       → ewb_fibu_gl
   hub_<entität>                Hub                → hub_hauptbuch, hub_konto, hub_person
   sat_<entität>__<quelle>      Satellite          → sat_hauptbuch__abacus
   sat_<entität>__<quelle>_current_v   Current View → sat_hauptbuch__abacus_current_v
   link_<entitätA>_<entitätB>   Link               → link_hauptbuch_konto
   ref_<entität>_v              Referenz/Stammdaten → ref_konto_v (Sharepoint-Kontenplan)
   dim_<entität>_v / fakt_<…>_v Mart-Dimension/Fakt → dim_konto_v, fakt_buchungen_v
```

> 💡 **Der doppelte Unterstrich** `__<quelle>` am Satelliten zeigt das **Quellsystem** an
> (`__abacus`, `__idms`, `__compax`). So sehen Sie sofort, woher die Attribute stammen — und
> dass ein Hub durchaus mehrere quellenspezifische Satelliten tragen kann.

---

## 10. Werkzeuge: dbt Core, automate_dv, Azure SQL

> 🎯 **Kernbotschaft:** **dbt Core** ist der Motor (transformiert, testet, dokumentiert, versioniert),
> **automate_dv** der Data-Vault-Generator darauf, **Azure SQL** der Speicher. Zusammen bilden sie den
> **ELT-Code-Generator**, der den manuellen Entwicklungsaufwand eliminiert.

| Werkzeug | Rolle |
|---|---|
| **Azure SQL** | Die Datenbank — speichert alle Schichten, liest Parquet via External Tables |
| **dbt Core** | Transformations-Framework — jedes Modell ist eine `.sql`-Datei; dbt baut die Objekte in Abhängigkeitsreihenfolge, testet und dokumentiert |
| **automate_dv** | dbt-Paket, das aus wenigen Metadaten die Hub/Sat/Link-SQL **generiert** |
| **ADLS Gen2** | Azure Data Lake — Landungszone der Parquet-Dateien |
| **Azure Data Factory / Synapse** | Pipelines, die Quelldaten delta-basiert als Parquet in den Lake bringen |
| **Power BI (+ ZebraBI)** | Reporting auf dem Mart (DirectQuery) — offen auch für Qlik, Tableau, Excel |

### dbt Core — der Transformations-Motor

dbt (data build tool) ist ein **ELT-Framework**: Jedes Modell ist ein `SELECT` in einer `.sql`-Datei;
dbt erzeugt daraus das nötige DDL/DML in der Datenbank. Was dbt für die Plattform leistet:

- **`ref()` & `source()`** — Modelle verweisen aufeinander. Daraus baut dbt automatisch den
  **Lineage-Graph (DAG)** und die **korrekte Build-Reihenfolge** (Staging → Vault → Mart).
- **Materialisierungen** — pro Schicht passend: `view` (Staging, Marts), `table`
  (Performance-Caches), `incremental` (Vault — lädt nur Neues/Geändertes), `ephemeral`.
- **Tests** — `not_null`, `unique`, `accepted_values`, `relationships` + eigene Tests. Datenqualität
  als Code (z. B. `hk_*` ist `not_null` + `unique`).
- **Dokumentation & Lineage** — `dbt docs` erzeugt durchsuchbare Doku samt Graph.
- **Jinja-Makros, Packages, Snapshots, Seeds, Sources** — Wiederverwendung und Erweiterung (automate_dv ist ein solches Package).
- **Umgebungen / Targets** — derselbe Code, mehrere Mandanten/DBs.

| dbt-Konzept | Im EWB-Projekt |
|---|---|
| Modell (`.sql`) | jede Hub-/Sat-/Link-/Mart-Datei |
| `ref()` / `source()` | Abhängigkeiten Staging → Vault → Mart |
| Materialisierung | Staging = `view`, Vault = `incremental`, Mart = `view`/`table` |
| Tests | `not_null` / `unique` auf `hk_*`, Beziehungstests |
| Targets (`profiles.yml`) | `dev` (DB Vault) · `jira` (Vault_Jira) · `ewb` (datavault) |
| `on-run-end` Hook | `log_load_status()` schreibt den Lade-Status |
| `dispatch` | **eigene Makros haben Vorrang vor automate_dv** |

> 💡 **Wichtige Befehle:** `dbt run` (baut Modelle) · `dbt test` (prüft) · `dbt build` (run + test in
> einem) · `dbt docs generate` (Doku/Lineage) · `dbt run-operation` (Makros wie `get_parquet_schema`).
> Vertiefung: der **dbt-Lernkatalog** unter `learn.getdbt.com/catalog` (u. a. *dbt Fundamentals*,
> *Jinja & Macros*, *Advanced Materializations*).

### automate_dv — der Data-Vault-Code-Generator

`automate_dv` (von Datavault-UK) generiert aus **wenigen Zeilen Metadaten** die komplette
Data-Vault-SQL. Statt hunderte Zeilen Lade-Logik von Hand zu schreiben, beschreibt man nur *was*
gebaut werden soll — das Makro erzeugt das *wie*.

**Die Makro-Familie:**

| Makro | Erzeugt |
|---|---|
| `stage()` | Staging-View mit Hash-Keys, Hash-Diffs, Metadaten |
| `hub()` | Hub (Business Keys) |
| `link()` | Link (Beziehung) |
| `t_link()` | Transaktions-Link (nicht-historisiert, z. B. CDR-Events) |
| `sat()` | Satellite (Attribute + Historie) |
| `eff_sat()` · `multi_active_satellite()` · `xts()` | Effectivity-, Multi-Active-, Extended-Tracking-Satelliten |
| `pit()` · `bridge()` · `ref_table()` | Performance-Hilfsobjekte (Point-in-Time, Bridge, Referenztabellen) |

**Das Prinzip — Metadaten rein, SQL raus.** Schematisch nach dem echten Staging `ewb_fibu_gl`:

```sql
{{ config(materialized='view') }}            -- Staging: i. d. R. als View

{%- set yaml_metadata -%}
source_model: "psa_ewb_fibu_gl_rolling"       -- woher die Rohdaten kommen

derived_columns:                              -- zusätzliche Metadaten-Spalten
  dss_record_source: "!ewb_abacus"            -- '!' = Konstante (automate_dv-Syntax)
  dss_load_date: "COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE())"
  _escape:                                    -- SQL-Server Reserved Keywords schützen
    source_column: ["DATE", "TEXT", "timestamp_landing-zone"]
    escape: true

hashed_columns:                               -- hier entstehen die Hashes
  hk_hauptbuch: ["RECNUM", "dss_source_file_name"]            -- Hub-Hash (Composite-BK!)
  hk_konto: "KTO"                                             -- FK-Hash → hub_konto
  hk_link_hauptbuch_konto: ["RECNUM", "dss_source_file_name", "KTO"]  -- Link-Hash
  hd_hauptbuch:                               -- Hash Diff = alle fachlichen Attribute
    is_hashdiff: true
    columns: ["BELNR", "DATE", "BETRAG", "SH", "WAEHR", "TEXT", "…"]
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}
{{ automate_dv.stage(include_source_columns=true,
                     source_model=metadata_dict['source_model'],
                     derived_columns=metadata_dict['derived_columns'],
                     hashed_columns=metadata_dict['hashed_columns']) }}
```

→ Ergebnis: die View `stg.ewb_fibu_gl` mit allen Quellspalten + `hk_`/`hd_`-Spalten + Metadaten.
Daraus bauen `hub()`, `sat()` und `link()` die Vault-Objekte — je **~15 Zeilen Metadaten statt
hunderter Zeilen SQL**.

> 💡 **Best Practices von automate_dv** (und wie EWB sie umsetzt): **Hashing** (Projekt: SHA),
> **Escaping** (`[ ]` für Reserved Keywords wie `[DATE]`, `[TEXT]`), **NULL-Handling**
> (Platzhalter `-1`, Trennzeichen `||`), **Loading** (`incremental`), **Materialisations**.
> Eigene Projekt-Makros (`create_hash_index`, `update_satellite_current_flag`) ergänzen die
> Standard-Makros via `dispatch`. Tutorial: `automate-dv.readthedocs.io/en/latest/tutorial/`.

> 💡 **Composite Business Key in der Praxis:** `hk_hauptbuch` wird aus **`RECNUM + dss_source_file_name`**
> gebildet — weil `RECNUM` nur *innerhalb* einer Jahresscheibe (`E15`…`E26`) eindeutig ist. Erst die
> Dateischeibe macht den Schlüssel global eindeutig (944 534/944 534).

### Steuerung & Betrieb (Governance)

- **Git** — alles ist Code: jede Schicht, jede Regel versioniert und reviewbar.
- **Lineage-Graph** — dbt kennt jede Abhängigkeit von der Quelle bis zum Report (Impact-Analyse).
- **CI/CD über DEV / TEST / PROD** — automatisierte Builds und Tests je Umgebung.
- **Tests als Gate** — Regressionstests laufen automatisch; Fehler stoppen den Lauf.

> ⚠️ **„Das Modell ist der Code":** Es gibt keine versteckte Klick-Logik. Wer das dbt-Repository
> liest, sieht die **vollständige** Plattform — jede Schicht, jede Regel, versioniert in Git.

### Security — vier komplementäre Schutzschichten

Datenschutz ist in der Plattform **strukturell verankert** (aus der Plattform-Präsentation):

| Mechanismus | Regelt | Beispiel |
|---|---|---|
| **OLS** — Object-Level Security | „Was?" — Sichtbarkeit ganzer Objekte/Schemata je Rolle | Self-Service-User sehen nur `mart_*`, nicht den `vault` |
| **RLS** — Row-Level Security | „Welche Zeilen?" — zeilenbasierte Filterung | nur Daten der eigenen Kostenstelle/Region; zentral im Power-BI-Modell |
| **CLS** — Column-Level Security | „Welche Felder?" — Maskierung sensibler Spalten | Gehälter/PII rollenspezifisch ausgeblendet |
| **CLE** — Column-Level Encryption | „Wer entschlüsselt?" — Verschlüsselung *at rest* | auch DBAs sehen nur Chiffrate |

> 💡 Zusammenspiel: OLS regelt das *Ob*, RLS die *Zeilen*, CLS die *Felder*, CLE die *Entschlüsselung*
> — Audit-Trails dokumentieren jeden Zugriff. Erfüllt Compliance-Anforderungen (DSG/GDPR).

---

## 11. Live-Tour durch das bestehende EWB-Modell

> 🎯 **Kernbotschaft:** Wir verfolgen echte Daten **von der Quelle bis Power BI** — zuerst eine
> Person (Hub + Satellite), dann eine Buchung (mit Link über mehrere Hubs). An diesen zwei Spuren
> wird die ganze Architektur greifbar.

### 11a — Einstieg: Person *(Hub + Satellite)*

Das einfachste vollständige Muster — eine Entität, ein Schlüssel, ein Satellit:

```
  Abacus Lohn (LEN)                  EMPL_NR = Personalnummer (Business Key)
        │  Parquet → ADLS
        ▼
  stg.ext_ewb_lohn_len_main         External Table (Zugriff auf Parquet)
        │  (Dedup auf aktuelle Lohnperiode)
        ▼
  stg.ewb_lohn_len_main             Staging-View, berechnet hk_person + hd_person
        │
        ├─► vault.hub_person                 🔑 BK: EMPL_NR
        │
        └─► vault.sat_person__abacus         📋 Name, Vorname, Eintritt, … (+ Historie)
                  │
                  ▼  (…_current_v → aktueller Stand)
        mart_project.dim_person_v            ⭐ aktive Mitarbeitende, konsumfertig
```

- **Hub** `hub_person` hält nur die Personalnummer `EMPL_NR`.
- **Satellite** `sat_person__abacus` hält die Personenattribute. Die Lohnperioden `LPE_YEAR/MONTH`
  sind **bewusst nicht** im Hash Diff — ein Periodenwechsel soll keine neue Personen-Version erzeugen.
- **Mart** `dim_person_v` wendet die Geschäftslogik an (nur aktive Mitarbeitende: `LOHNJN='1'`,
  nicht gesperrt) — fertig für Power BI.

> 💡 Hier sehen Sie alle Konzepte aus Teil 1 in *einer* Spur: Business Key → Hub, Attribute →
> Satellite, Hash Diff steuert die Historie, Current View + Mart liefern die Auswertungssicht.

### 11b — Durchstich: Buchung *(Hub + Satellite + Link + Mart)*

Der vollständige Durchstich — mehrere Hubs, über einen Link verbunden. Dies ist zugleich der
**Priorität-1-Use-Case** (Finanz-Reporting / Erfolgsrechnung):

```
  Abacus FIBU (GL — Hauptbuch-Buchungszeilen)        BK: RECNUM + dss_source_file_name
        │  Parquet → ADLS
        ▼
  stg.ext_ewb_fibu_gl   External Table (Zugriff auf Parquet)
        │  (PSA → inkrementelle Beladung per High-Water-Mark)
        ▼
  stg.ewb_fibu_gl   Staging-View: hk_hauptbuch, hk_konto, hk_link_hauptbuch_konto, hd_hauptbuch
        │
        ├─► 🔑 vault.hub_hauptbuch         BK: RECNUM + Dateischeibe
        │        │
        │        └─► 📋 vault.sat_hauptbuch__abacus   Betrag, Datum, Text, MwSt … (36 Attribute)
        │
        ├─► 🔑 vault.hub_konto             BK: KTO  (Ghost Hub — aus Buchungen abgeleitet)
        │        │
        │        └─► 🔗 ref_konto_v        Kontenplan-Stammdaten (Sharepoint)
        │
        └─► 🔗 vault.link_hauptbuch_konto  verbindet RECNUM ↔ KTO
                  │
                  ▼
        mart_finance.fakt_buchungen_v   ⭐ Fakt (Betrag je Buchung)
        mart_finance.dim_konto_v        ⭐ Dimension (Konto-Hierarchie L2/L1/Detail)
                  │
                  ▼
        📊 Power BI — Erfolgsrechnung (Vorher/Nachher vs. Synapse)
```

**Was diese Spur zeigt:**

- **Mehrere Hubs** (`hub_hauptbuch`, `hub_konto`) entstehen aus **einer** Quelle (`ewb_fibu_gl`).
- Der **Link** `link_hauptbuch_konto` modelliert die Beziehung „Buchungszeile gehört zu Konto" —
  als eigenes Objekt, nicht als Attribut.
- **Ghost Hub:** `hub_konto` hat keine eigene Stammdaten-Quelle; die Konto-Nummern werden aus den
  Buchungszeilen abgeleitet, die Bezeichnungen kommen via `ref_konto_v` aus Sharepoint.
- Der **Mart** legt das Star Schema darüber: `fakt_buchungen_v` (Kennzahlen) + `dim_konto_v`
  (Kontenplan-Hierarchie für ZebraBI), konsumfertig für Power BI.

> 💡 **Performance-Detail:** `fakt_buchungen_v` ist ein dünner View über die materialisierte Tabelle
> `fakt_buchungen` — der Cache hält Power-BI-DirectQuery schnell. Konsumenten lesen immer den `_v`-View.

> ⚠️ **Reserved Keywords in der Praxis:** Im Buchungs-Satelliten heißen Spalten `DATE` und `TEXT` —
> beides SQL-Server-Schlüsselwörter. Sie werden im Staging mit `[ ]` escaped. Solche Details sind
> der Grund für die Escaping-Konvention aus Kapitel 10.

---

## 12. Zusammenfassung & Ausblick

> 🎯 **Kernbotschaft:** Sie kennen jetzt das Vokabular (Hub/Sat/Link, Hashes) und die vier Schichten
> der EWB-Plattform — das Fundament für alle weiteren Module.

### Die wichtigsten Punkte

- **Teil 1:** Data Vault trennt Integration von Auswertung. Drei Objekte — **Hub, Satellite, Link**.
  **Hash Keys** verbinden, **Hash Diffs** erkennen Änderungen. Jede Spalte bekommt eine Rolle.
- **Teil 2:** Vier Schichten — **Staging → Raw Vault (Hard Rules) → Business Vault (Soft Rules) →
  Information Mart**. Namen verraten Schicht und Typ. **dbt Core + automate_dv** generieren und steuern
  alles (Git, Lineage, CI/CD, Tests); Sicherheit über OLS/RLS/CLS/CLE. Zwei echte Spuren (Person,
  Buchung) zeigen den Weg von der Quelle bis zum Bericht.

### Ausblick — die weiteren Module

| Modul | Inhalt |
|---|---|
| **M2** | ADF-Beladungslogik — wie die Daten ins System kommen |
| **M3** | Staging & Raw Vault — Objekte **selbst** bauen (Begleitdoku: `SCHULUNG_NEUES_BUSINESS_OBJEKT.md`) |
| **M4** | Information Mart — dimensionale Modellierung (Dimension/Fakt) |
| **M5** | Reporting auf dem Vault — Power BI / ZebraBI |

> Nächste Schritte laut Schulungsplan: **Block B** (Reporting-Track, Finanz-Reporting — Priorität 1)
> und **Block C** (Implementierungs-Track, IDMS Telekom-Abos).

---

## Glossar — Kurzreferenz

| Begriff | Bedeutung |
|---|---|
| **Data Vault 2.1** | Modellierungsmethode für die Integrationsschicht (Hub/Sat/Link) |
| **Hub** | Speichert nur den Business Key — „was existiert" |
| **Satellite (Sat)** | Attribute + komplette Historie einer Entität |
| **Link** | Beziehung zwischen Hubs (M:N-fähig) |
| **Business Key (BK)** | Eindeutiger, stabiler fachlicher Schlüssel aus der Quelle |
| **Hash Key (`hk_`)** | SHA-256 aus dem BK — verbindet Objekte |
| **Hash Diff (`hd_`)** | SHA-256 aller Attribute — erkennt Änderungen |
| **Ghost Hub** | Hub ohne eigene Stammdaten-Quelle (BK aus anderen Daten abgeleitet, z. B. `hub_konto`) |
| **Current View (`_current_v`)** | View auf den aktuellen Satelliten-Stand (`dss_is_current = 'Y'`) |
| **Staging** | Schicht, die Rohdaten liest und Hashes berechnet |
| **Raw Vault** | Integrationsschicht (Hub/Sat/Link), historisiert |
| **Mart** | Auswertungsschicht (Star Schema: Dimension/Fakt) |
| **`dss_load_date`** | Metadaten: Ladezeitpunkt |
| **`dss_record_source`** | Metadaten: Herkunft des Datensatzes |
| **dbt Core** | Transformations-Framework (SQL-Modelle, Tests, Doku) |
| **automate_dv** | dbt-Paket, generiert Data-Vault-SQL |
| **External Table** | Direkter Azure-SQL-Zugriff auf eine Parquet-Datei im ADLS |
| **PSA** | Persistent Staging Area — persistente Zwischenschicht für inkrementelle Beladung |
| **HWM** | High Water Mark — Schwellwert (über `dss_load_date`), ab dem nur neue Daten geladen werden |
| **Business Vault** | Schicht für Soft Rules (fachliche Anreicherung/Konsolidierung) über dem Raw Vault |
| **Hard Rules** | Nur technische Transformationen im Raw Vault (Datentyp, Systemfelder) — keine Fachlogik |
| **Soft Rules** | Fachlich interpretierende Transformationen (Business Vault / Mart) |
| **ELT-Code-Generator** | dbt + automate_dv — generiert die Lade-SQL aus Metadaten |
| **Lineage** | Abhängigkeits-/Herkunftsgraph aller Modelle (dbt) |
| **Materialisierung** | Wie dbt ein Modell baut: `view`, `table`, `incremental`, `ephemeral` |
| **PIT-Tabelle** | Point-in-Time-Hilfsobjekt zur performanten Vault-Abfrage |
| **OLS / RLS / CLS / CLE** | Object-/Row-/Column-Level Security bzw. Column-Level Encryption |

## Weiterführendes

- **Begleitdokument (Praxis):** `docs/SCHULUNG_NEUES_BUSINESS_OBJEKT.md` — Schritt-für-Schritt vom
  Parquet bis zum Mart (Module M3/M4).
- **Schulungsplan:** `docs/SCHULUNGSPLAN_EWB.md` — Module, Use-Cases, Terminblöcke.
- **Architekturdiagramm:** `docs/architektur.png`.
- **Plattform-Präsentation (Management-Sicht):** Repo `fellnerd/presentation-engine`,
  `public/presentations/datavault-analytics-platform` — PPMC „Data Vault Analytics Plattform".
- **dbt-Lernkatalog:** `learn.getdbt.com/catalog` (u. a. *dbt Fundamentals*, *Jinja & Macros*).
- **automate_dv-Tutorial:** `automate-dv.readthedocs.io/en/latest/tutorial/`.
- **Buchempfehlung:** *Building a Scalable Data Warehouse with Data Vault 2.0* — Linstedt / Olschimke.

---

*Dieses Handout ist die Lesefassung für Block A. Aus ihm wird die Präsentation für den 3.7.2026
abgeleitet.*
