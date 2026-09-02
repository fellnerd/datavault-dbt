# Schulung: Neues Business-Objekt im Data Vault Projekt erstellen

> **Zielgruppe:** Einsteiger ohne Data Vault Vorkenntnisse  
> **Beispiel:** IDMS Adressen (`IDMS/address/Main.parquet`)  
> **Stand:** 2026-06-17

---

## 📑 Inhaltsverzeichnis

1. [Was machen wir hier eigentlich?](#1-was-machen-wir-hier-eigentlich)
2. [Architektur auf einen Blick](#2-architektur-auf-einen-blick)
3. [Data Vault Grundbegriffe](#3-data-vault-grundbegriffe)
4. [Schritt 1 — Parquet-Datei finden](#schritt-1--parquet-datei-finden)
5. [Schritt 2 — Schema der Parquet-Datei abfragen](#schritt-2--schema-der-parquet-datei-abfragen)
6. [Schritt 3 — External Table definieren (sources.yml)](#schritt-3--external-table-definieren-sourcesyml)
7. [**Schritt 3.5 — Vault-Modell planen (Analyse)**](#schritt-35--vault-modell-planen-analyse)
8. [Schritt 4 — Staging-Modell erstellen](#schritt-4--staging-modell-erstellen)
9. [Schritt 5 — Dokumentation (_staging__models.yml)](#schritt-5--dokumentation-_staging__modelsyml)
10. [Schritt 6 — Deployen und testen](#schritt-6--deployen-und-testen)
11. [Schritt 7 — Raw Vault: Hub & Satellite erstellen](#schritt-7--raw-vault-hub--satellite-erstellen)
12. [Schritt 7.5 — Link nachrüsten (Option B Upgrade)](#schritt-75--link-nachrüsten-option-b-upgrade)
13. [Schritt 7.6 — Multi-Source Hub (Cross-Source Integration)](#schritt-76--multi-source-hub-cross-source-integration)
14. [Schritt 8 — Mart: Dimension & Fakt erstellen](#schritt-8--mart-dimension--fakt-erstellen)
15. [Gesamtcheckliste](#gesamtcheckliste)
16. [Schema-Evolution: Neue Spalte zu einem Satellite hinzufügen](#schema-evolution-neue-spalte-zu-einem-satellite-hinzufügen)

---

## 1. Was machen wir hier eigentlich?

Wir nehmen **rohe Daten aus einem Quellsystem** (hier: IDMS Adressen) und bauen daraus eine vollständige **Data Vault Pipeline** — von der Rohdatei bis zur fertigen Dimension für Power BI.

**Warum Data Vault?**
- Historisierung: Wir speichern **jede Änderung** an einem Datensatz (wer hat sich wann geändert?)
- Quellenunabhängigkeit: Mehrere Quellsysteme können dieselbe Entität beschreiben
- Auditierbarkeit: Jeder Datensatz ist auf seinen Ursprung zurückführbar

---

## 2. Architektur auf einen Blick

```
Azure Data Lake Storage (ADLS)
         │
         │  Parquet-Dateien
         ▼
External Table  (stg.ext_idms_address_main)
         │
         │  dbt view — Rohdaten + Hash-Berechnung
         ▼
Staging View  (stg.idms_address_main)
         │
         ├─── Hub  (vault.hub_idms_address)
         │           ↓ Business Key gespeichert
         │
         └─── Satellite  (vault.sat_idms_address__idms)
                         ↓ Attribute + Historisierung
                         ↓
              Current View  (vault.sat_idms_address_current_v)
                         ↓ nur aktueller Stand
                         ↓
              Dimension  (mart.dim_idms_address_v)
                         ↓
                    Power BI
```

**Kurz erklärt:**
| Schicht | Was ist das? | Beispiel |
|---------|-------------|---------|
| **External Table** | Direkter Zugriff auf die Parquet-Datei | `stg.ext_idms_address_main` |
| **Staging** | Rohdaten + Hashes berechnet | `stg.idms_address_main` |
| **Hub** | Nur der Business Key + Metadaten | `vault.hub_idms_address` |
| **Satellite** | Attribute + Historisierung | `vault.sat_idms_address__idms` |
| **Current View** | Nur der aktuellste Stand | `vault.sat_idms_address_current_v` |
| **Dimension** | Aufbereitete Sicht für BI | `mart.dim_idms_address_v` |

---

## 3. Data Vault Grundbegriffe

### 🔑 Hub — "Was existiert?"
Ein Hub speichert **nur den Business Key** — also die eindeutige Identifikation einer Entität.  
- Kein History, keine Attribute
- Einmal drin, immer drin (immutable)
- Beispiel: Die Adresse mit `id = 42` existiert → ein Eintrag im Hub

### 📋 Satellite — "Wie sieht es aus und wie hat es sich verändert?"
Ein Satellite speichert **alle Attribute** einer Entität + die **komplette Geschichte**.
- Jede Änderung = neuer Datensatz
- Verknüpft mit dem Hub via Hash Key
- Beispiel: Adresse 42 hat die Strasse gewechselt → alter + neuer Eintrag im Satellite

### 🔗 Link — "Wie hängen zwei Entitäten zusammen?"
Ein Link verbindet zwei oder mehr Hubs.
- Beispiel: Adresse 42 gehört zu Kunde 7 → Link zwischen `hub_idms_address` und `hub_kunde`

### #️⃣ Hash Key
Ein **Hash Key** (hk_) ist ein technischer Schlüssel, der aus dem Business Key berechnet wird.  
Format: SHA2-256, 64 Zeichen Hex-String.  
Warum? → Einheitliche Schlüssellänge, unabhängig vom Quellsystem.

### ≠ Hash Diff
Ein **Hash Diff** (hd_) wird aus allen Attributen des Satellites berechnet.  
Er dient zur **Änderungserkennung**: Hat sich irgendetwas geändert? → neuer Hash Diff → neuer Satellite-Eintrag.

---

## Schritt 1 — Parquet-Datei finden

### Was ist eine Parquet-Datei?
Parquet ist ein effizientes Dateiformat für tabellarische Daten. Unsere Quellsysteme liefern Daten als Parquet-Dateien in den Azure Data Lake Storage (ADLS).

### Wo finden wir sie?
Im Azure Storage Explorer oder via Azure Portal.  
Wir benötigen folgende Informationen:
- **Container**: z.B. `landing-zone`
- **Pfad**: z.B. `IDMS/address/Main.parquet`
- **Data Source Name**: Der Name der SQL External Data Source, z.B. `LandingZoneFS`

**Unser Beispiel:**
```
Container:    landing-zone
Pfad:         IDMS/address/Main.parquet
Data Source:  LandingZoneFS
```

> 💡 **Tipp:** Der Pfad im Azure Storage Explorer URL (`path=...`) ergibt, URL-decoded, den Pfad den wir brauchen.

---

## Schritt 2 — Schema der Parquet-Datei abfragen

Bevor wir irgendwas bauen, müssen wir wissen: **Welche Spalten hat die Parquet-Datei?**  
Dafür gibt es das dbt-Macro `get_parquet_schema`.

### Befehl
```bash
# Virtuelle Umgebung aktivieren (einmalig pro Terminal-Session)
source .venv/bin/activate        # Linux/Mac
.venv\Scripts\activate.ps1       # Windows PowerShell

# Schema abfragen
dbt run-operation get_parquet_schema \
  --args '{folder_path: "IDMS/address", file_name: "Main.parquet", data_source: "LandingZoneFS"}' \
  --target ewb-dev
```

### Was passiert dabei?
Das Macro verbindet sich zur Datenbank, liest das Schema der Parquet-Datei via `OPENROWSET` und gibt die Spalten als YAML aus — fertig formatiert für den nächsten Schritt.

### Ausgabe (Beispiel IDMS/address/Main.parquet)
```
      - name: ext_idms_address_main
        description: "Auto-generated from Main.parquet"
        external:
          location: "IDMS/address/Main.parquet"
          file_format: ParquetFormat
          data_source: LandingZoneFS
        columns:
          - name: id
            data_type: INT
          - name: cust_id
            data_type: INT
          - name: ref
            data_type: NVARCHAR(4000)
          - name: flags
            data_type: INT
          - name: mandate_id
            data_type: INT
          - name: free_field
            data_type: NVARCHAR(4000)
          - name: firma
            data_type: NVARCHAR(4000)
          - name: anrede
            data_type: INT
          - name: nachname
            data_type: NVARCHAR(4000)
          - name: vorname
            data_type: NVARCHAR(4000)
          - name: zusatz
            data_type: NVARCHAR(4000)
          - name: strasse
            data_type: NVARCHAR(4000)
          - name: strasse_nr
            data_type: NVARCHAR(4000)
          - name: postfach
            data_type: NVARCHAR(4000)
          - name: plzort
            data_type: INT
          - name: tel
            data_type: NVARCHAR(4000)
          - name: fax
            data_type: NVARCHAR(4000)
          - name: telg
            data_type: NVARCHAR(4000)
          - name: telm
            data_type: NVARCHAR(4000)
          - name: emailaddr
            data_type: NVARCHAR(4000)
          - name: status
            data_type: INT
          - name: ts
            data_type: NVARCHAR(4000)
          - name: egid
            data_type: INT
          - name: timestamp_landing-zone
            data_type: NVARCHAR(4000)

# Spalten: 24
```

### ⚠️ Typkorrekturen prüfen
Das Macro macht ein automatisches Type-Mapping, aber einige Typen müssen manuell angepasst werden:

| Macro-Output | Korrekter Typ | Wann? |
|---|---|---|
| `DECIMAL(38,10)` | `DECIMAL(38,18)` | Bei Abacus APPNUM-Spalten |
| `NVARCHAR(4000)` | `VARBINARY(8000)` | Bei Abacus APPSTR-Spalten (Binärdaten!) |

> Für IDMS sind keine Korrekturen notwendig — alle Typen sind korrekt.

---

## Schritt 3 — External Table definieren (sources.yml)

Die **External Table** ist der direkte Zugriff auf die Parquet-Datei aus Azure SQL heraus.  
Sie wird in `models/staging/sources.yml` definiert.

### Warum eine External Table?
Azure SQL kann nicht direkt Parquet-Dateien lesen. Die External Table ist eine Art "virtueller Zeiger" auf die Parquet-Datei — SQL Server liest die Datei beim Query live aus dem ADLS.

### Naming Convention
```
ext_<quellsystem>_<entität>_<suffix>

Beispiel:  ext_idms_address_main
           ^^^^ ^^^^^^^ ^^^^^^^ ^^^^
           ext  idms    address main (aus Dateiname)
```

### Eintrag in sources.yml
Füge den Output aus Schritt 2 unter `# === IDMS ===` in `models/staging/sources.yml` ein.  
Die Datei befindet sich in: `models/staging/sources.yml`

```yaml
      # === IDMS (Integriertes Datenmanagementsystem) ===
      - "name": "ext_idms_address_main"
        "description": "IDMS Address Main (Parquet). BK: id"
        "external":
          "location": "IDMS/address/Main.parquet"
          "file_format": "ParquetFormat"
          "data_source": "LandingZoneFS"
        "columns":
          - "name": "id"
            "data_type": "INT"
          - "name": "cust_id"
            "data_type": "INT"
          - "name": "ref"
            "data_type": "NVARCHAR(4000)"
          - "name": "flags"
            "data_type": "INT"
          - "name": "mandate_id"
            "data_type": "INT"
          - "name": "free_field"
            "data_type": "NVARCHAR(4000)"
          - "name": "firma"
            "data_type": "NVARCHAR(4000)"
          - "name": "anrede"
            "data_type": "INT"
          - "name": "nachname"
            "data_type": "NVARCHAR(4000)"
          - "name": "vorname"
            "data_type": "NVARCHAR(4000)"
          - "name": "zusatz"
            "data_type": "NVARCHAR(4000)"
          - "name": "strasse"
            "data_type": "NVARCHAR(4000)"
          - "name": "strasse_nr"
            "data_type": "NVARCHAR(4000)"
          - "name": "postfach"
            "data_type": "NVARCHAR(4000)"
          - "name": "plzort"
            "data_type": "INT"
          - "name": "tel"
            "data_type": "NVARCHAR(4000)"
          - "name": "fax"
            "data_type": "NVARCHAR(4000)"
          - "name": "telg"
            "data_type": "NVARCHAR(4000)"
          - "name": "telm"
            "data_type": "NVARCHAR(4000)"
          - "name": "emailaddr"
            "data_type": "NVARCHAR(4000)"
          - "name": "status"
            "data_type": "INT"
          - "name": "ts"
            "data_type": "NVARCHAR(4000)"
          - "name": "egid"
            "data_type": "INT"
          - "name": "timestamp_landing-zone"
            "data_type": "NVARCHAR(4000)"
```

> 💡 **Tipp:** Den Tabellenname (`ext_idms_address_main`) aus dem Macro-Output übernehmen.  
> Den Beschreibungstext manuell anpassen: Business Key hinzufügen.

---

## Schritt 3.5 — Vault-Modell planen (Analyse)

> ⚠️ **Dieser Schritt wird oft übersprungen — das ist ein Fehler.**  
> Das Staging baut direkt auf dem Vault-Plan auf. Ohne Plan weiss man nicht, welche Hashes man im Staging berechnen muss.

### Was müssen wir planen?

Bevor wir eine einzige Zeile Code schreiben, beantworten wir diese 4 Fragen anhand der Spalten aus Schritt 2:

```
1. Was ist der Business Key?          → bestimmt den Hub + Hash Key (hk_)
2. Gibt es Foreign Keys?              → bestimmt ob wir Links brauchen
3. Welche Spalten sind Attribute?     → bestimmt den Satellite + Hash Diff (hd_)
4. Gibt es Spalten die wir ignorieren → Systemfelder, die nicht ins DV gehören
```

### Die Analyse-Methode: Spalten klassifizieren

Nimm die Spalten aus Schritt 2 und ordne jede Spalte einer Kategorie zu:

| Kategorie | Bedeutung | Wird zu... |
|---|---|---|
| 🔑 **Business Key (BK)** | Eindeutiger, stabiler Identifikator dieser Entität | Hash Key `hk_` im Hub |
| 🔗 **Foreign Key (FK)** | Verweis auf eine andere Entität | Hash Key `hk_` im Staging (für Links) |
| 📋 **Attribut** | Fachliche Eigenschaft, die sich ändern kann | Payload im Satellite, Teil des `hd_` |
| 🚫 **Systemfeld** | Technische Metadaten des Quellsystems | Nicht ins DV, nicht in `hd_` |

### Beispiel: IDMS Address analysieren

Hier ist die komplette Spaltenanalyse für `IDMS/address/Main.parquet`:

| Spalte | Typ | Kategorie | Begründung |
|---|---|---|---|
| `id` | INT | 🔑 **Business Key** | Eindeutige Adress-ID — identifiziert die Adresse eindeutig |
| `cust_id` | INT | 🔗 **Foreign Key → Option A** | Verweis auf Kunden. **Behandlung:** im Hashdiff (Option A) — Änderung erzeugt neuen Satellite-Eintrag |
| `mandate_id` | INT | 🔗 **Foreign Key → Option A** | Verweis auf Mandant. **Behandlung:** im Hashdiff (Option A) |
| `ref` | NVARCHAR | 📋 Attribut | Referenztext zur Adresse |
| `flags` | INT | 📋 Attribut | Statusflags |
| `free_field` | NVARCHAR | 📋 Attribut | Freies Textfeld |
| `firma` | NVARCHAR | 📋 Attribut | Firmenname (ändert sich über Zeit) |
| `anrede` | INT | 📋 Attribut | Anredecode |
| `nachname` | NVARCHAR | 📋 Attribut | Nachname |
| `vorname` | NVARCHAR | 📋 Attribut | Vorname |
| `zusatz` | NVARCHAR | 📋 Attribut | Adresszusatz |
| `strasse` | NVARCHAR | 📋 Attribut | Strasse (kann sich ändern!) |
| `strasse_nr` | NVARCHAR | 📋 Attribut | Hausnummer |
| `postfach` | NVARCHAR | 📋 Attribut | Postfach |
| `plzort` | INT | 📋 Attribut | PLZ/Ort-Referenz |
| `tel` | NVARCHAR | 📋 Attribut | Telefon |
| `fax` | NVARCHAR | 📋 Attribut | Fax |
| `telg` | NVARCHAR | 📋 Attribut | Telefon Geschäft |
| `telm` | NVARCHAR | 📋 Attribut | Telefon Mobil |
| `emailaddr` | NVARCHAR | 📋 Attribut | E-Mail |
| `status` | INT | 📋 Attribut | Status der Adresse |
| `egid` | INT | 📋 Attribut | Gebäudeidentifikator (CH-spezifisch) |
| `ts` | NVARCHAR | 🚫 Systemfeld | Quellsystem-Timestamp — ändert sich ständig, kein fachlicher Wert |
| `timestamp_landing-zone` | NVARCHAR | 🚫 Systemfeld | ADF-Ladezeitpunkt — kein fachliches Attribut |

### Resultat: Vault-Modell-Plan

Aus der Analyse ergibt sich dieser Plan:

```
┌─────────────────────────────────────────────────────────┐
│  hub_idms_address                                       │
│  BK: id                                                 │
│  HK: hk_idms_address                                    │
└───────────────────┬─────────────────────────────────────┘
                   │ hk_idms_address
                   ▼
┌─────────────────────────────────────────────────────────┐
│  sat_idms_address__idms                                 │
│  Attribute: firma, nachname, vorname, strasse,          │
│             strasse_nr, plzort, tel, fax, telg, telm,   │
│             emailaddr, anrede, zusatz, postfach,        │
│             ref, flags, free_field, status, egid,       │
│             cust_id, mandate_id  ← FKs (Option A)      │
│  HD: hd_idms_address                                    │
└─────────────────────────────────────────────────────────┘

FKs (Option A — im Hashdiff, kein Link):
 cust_id    → bleibt als Attribut im Satellite
 mandate_id → bleibt als Attribut im Satellite

Wenn Links später gebraucht werden (Option B Upgrade):
 link_idms_address_kunde    (cust_id → hub_kunde)
 link_idms_address_mandant  (mandate_id → hub_mandant)
```

> **Warum nur ein Satellite?**  
> Alle Attribute beschreiben dasselbe Thema ("Adressdaten") und ändern sich mit ähnlicher Frequenz. Ein Satellite reicht. Bei grossen Tabellen mit klar unterschiedlichen Themen (z.B. Stammdaten vs. Kontaktdaten) würde man splitten.

### Die 3 Entscheidungsfragen für den Business Key

> **Wie erkenne ich den Business Key?**

Ein guter Business Key ist:
1. **Stabil** — ändert sich nie (oder sehr selten)
2. **Eindeutig** — identifiziert genau ein Objekt
3. **Fachlich** — kommt aus dem Quellsystem, nicht technisch generiert

**Typische BK-Kandidaten:** Laufnummern (`id`, `nr`, `recnum`), Codes (`code`, `ref`), externe Nummern  
**Kein BK:** Spalten die auf andere Tabellen verweisen (`_id` Suffix → FK!), Timestamps, Flags

**Im Zweifel:** Welche Spalte würde ein Fachbenutzer nutzen um diesen Datensatz im Quellsystem zu finden?

### Was passiert mit den Foreign Keys?

Foreign Keys können im Staging auf **3 verschiedene Arten** behandelt werden:

```
┌────────────────────────────────────────────────────────────────────┐
│  FK-Behandlung im Staging — 3 Optionen                            │
│                                                                    │
│  Option A: FK im Hashdiff (pragmatisch)                           │
│  → cust_id landet in hd_idms_address                              │
│  → Eine Änderung des Kunden erzeugt neuen Satellite-Eintrag       │
│  → Kein Link nötig, einfach umzusetzen                            │
│  → ⚠️ Nicht "reines" DV2.1 — Beziehung steckt im Satellite       │
│                                                                    │
│  Option B: FK als separater Hash Key (DV2.1 konform)              │
│  → 3 Hashes werden berechnet: hk_eigene_entity,                   │
│    hk_andere_entity (aus dem FK), hk_link_... (Kombination beider)│
│  → Beziehung wird korrekt im Link modelliert                      │
│  → Mehr Aufwand, aber sauberere Architektur                       │
│                                                                    │
│  Option C: FK ignorieren                                          │
│  → FK nur als Rohspalte, weder hk_ noch im hd_                    │
│  → Beziehung wird gar nicht modelliert                            │
└────────────────────────────────────────────────────────────────────┘
```

#### Option B im Detail — das Link-Pattern

Das echte Link-Pattern (Option B) ist etwas komplexer aber wichtig zu verstehen.  
**Beispiel:** `PROJ.PRT` (Projektteile) hat eine eigene Identität (`RECNUM`) und einen FK auf ein Projekt (`PROJNR`).

In `ewb_proj_prt_main.sql` werden deshalb **3 Hashes + 1 Hashdiff** berechnet:

```yaml
hashed_columns:
  hk_projektteil: "RECNUM"          # ① Hash des eigenen BK → für hub_projektteil
  hk_projekt: "PROJNR"              # ② Hash des FK → für hub_projekt (FK-Seite)
  hk_link_projektteil_projekt:      # ③ Hash BEIDER BKs → für den Link (PK des Links)
    - "RECNUM"
    - "PROJNR"
  hd_projektteil:                   # ④ Nur echte Attribute — PROJNR ist NICHT drin!
    is_hashdiff: true
    columns:
      - "DATE"
      - "STAT1"
      - "STAT2"
      - "USER_F"
```

Visualisiert:
```
                HASH(RECNUM)     → hk_projektteil  → hub_projektteil
Quelldaten:     HASH(PROJNR)     → hk_projekt      → hub_projekt
RECNUM, PROJNR  HASH(RECNUM||PROJNR) → hk_link_...→ link_projektteil_projekt
DATE, STAT1...  HASH(DATE,STAT1,STAT2,USER_F) → hd_projektteil → sat_projektteil
```

**Warum 3 Hashes?**
- `hk_projektteil` — identifiziert den Projektteil in seinem eigenen Hub
- `hk_projekt` — dieselbe Berechnung wie in `npo_main` → gleicher Hash-Wert → kann direkt im Link verwendet werden
- `hk_link_...` — der **Link-Primary-Key** = Hash der Kombination beider BKs. Eindeutig pro Beziehung.

**Wichtig:** `PROJNR` ist **NICHT im Hashdiff** — es ist kein Attribut des Projektteils, sondern eine Beziehung. Wenn sich das zugeordnete Projekt ändert, ist das eine Link-Änderung, keine Satellite-Änderung.

**Wer berechnet den Link-Hash?**  
Immer die "Kind"-Seite — also die Tabelle die den FK enthält (`PRT`). Die "Eltern"-Seite (`NPO`) kennt nur ihren eigenen BK und berechnet keine Link-Hashes.

> **Für IDMS Address:** Wir verwenden **Option A** — `cust_id` und `mandate_id` sind im Hashdiff.  
> Das bedeutet: Wenn sich die Kunden-Zuordnung ändert, entsteht ein neuer Satellite-Eintrag.  
> Dies ist eine bewusste Vereinfachung für den Einstieg. Links können später nachgerüstet werden  
> indem man Option B nachrüstet: `hk_kunde: "cust_id"` + `hk_link_address_kunde: ["id", "cust_id"]`.

---

## Schritt 4 — Staging-Modell erstellen

Das **Staging-Modell** ist eine dbt View, die:
1. Die Rohdaten aus der External Table liest
2. Metadaten-Spalten hinzufügt (`dss_record_source`, `dss_load_date`, etc.)
3. **Hash Keys und Hash Diffs berechnet** (via `automate_dv.stage()` Macro)

> 💡 **Voraussetzung:** Schritt 3.5 muss abgeschlossen sein — wir brauchen den Vault-Plan um zu wissen welche Hashes wir berechnen müssen.

### Was ist immer gleich (Template) — und was wird angepasst?

Das Staging-Modell folgt immer demselben Template. Die meisten Teile sind fest — nur wenige Stellen werden pro Business-Objekt angepasst:

```
┌─────────────────────────────────────────────────────────────────────┐
│  STAGING TEMPLATE                                                   │
│                                                                     │
│  source_model              ← 🔧 ANPASSEN: External Table Name      │
│                                                                     │
│  derived_columns:                                                   │
│    dss_record_source       ← 🔧 ANPASSEN: Quellsystem-Name         │
│    dss_load_date           ← 🔧 ANPASSEN: Woher kommt der Timestamp│
│    dss_create_datetime     ← ✅ IMMER GLEICH: GETDATE()             │
│    dss_business_key        ← 🔧 ANPASSEN: Welche Spalte ist der BK │
│    _escape                 ← 🔧 ANPASSEN: Welche Spalten escaped?  │
│                                                                     │
│  hashed_columns:                                                    │
│    hk_<entity>             ← 🔧 ANPASSEN: Name + BK-Spalte         │
│    hd_<entity>             ← 🔧 ANPASSEN: Name + Attribut-Liste    │
│      is_hashdiff: true     ← ✅ IMMER GLEICH                        │
│      columns: [...]        ← 🔧 ANPASSEN: Alle fachlichen Attribute│
│                                                                     │
│  automate_dv.stage(        ← ✅ IMMER GLEICH                        │
│    include_source_columns=true, ...)                                │
└─────────────────────────────────────────────────────────────────────┘
```

### Die 5 Dinge die immer angepasst werden

Aus dem Vault-Plan (Schritt 3.5) leiten sich diese 5 Angaben direkt ab:

| Was | Woher | Beispiel IDMS |
|---|---|---|
| **1. `source_model`** | External Table Name aus Schritt 3 | `ext_idms_address_main` |
| **2. `dss_record_source`** | Name des Quellsystems (frei wählbar, aber konsistent) | `!ewb_idms` |
| **3. `dss_business_key`** | BK-Spalte aus Schritt 3.5 | `CAST(id AS NVARCHAR(MAX))` |
| **4. `hk_<entity>`** | Hash Key Name + BK-Spalte aus Schritt 3.5 | `hk_idms_address: "id"` |
| **5. `hd_<entity>`** | Hash Diff Name + Attributliste aus Schritt 3.5 | `hd_idms_address: [firma, nachname, ...]` |

### `dss_load_date` — Woher kommt der Timestamp?

Je nach Quellsystem gibt es den Ladezeitpunkt an einem anderen Ort:

| Quellsystem | `dss_load_date` Quelle |
|---|---|
| **IDMS** | `[timestamp_landing-zone]` (ADF-Metadaten-Spalte) |
| **EWB Abacus** | `dss_load_date` (eigene Spalte in der Parquet-Datei) |

```yaml
# IDMS: aus timestamp_landing-zone
dss_load_date: "COALESCE(TRY_CAST([timestamp_landing-zone] AS DATETIME2), GETDATE())"

# Abacus: direkt aus der Spalte
dss_load_date: "COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE())"
```

Das `COALESCE(..., GETDATE())` ist ein Sicherheitsnetz: Falls der Timestamp NULL ist, wird die aktuelle Zeit genommen.

### Datei erstellen
Erstelle: `models/staging/idms_address_main.sql`

### Template (ausgefüllt für IDMS Address)

Die Stellen mit `← 🔧` zeigen wo etwas angepasst wurde, `← ✅` ist immer gleich:

```sql
/*
 * Staging Model: idms_address_main
 *
 * Source: ext_idms_address_main (IDMS Address Main.parquet)
 * Business Key: id                          ← aus Schritt 3.5
 * Hash Key: hk_idms_address                ← aus Schritt 3.5
 * Payload: 21 Spalten — Adress- und Personendaten
 *
 * ts und timestamp_landing-zone: Systemfelder, NICHT im Hashdiff.
 */

{%- set yaml_metadata -%}
source_model:
  staging: "ext_idms_address_main"        -- ← 🔧 External Table Name (Schritt 3)

derived_columns:
  dss_record_source: "!ewb_idms"          -- ← 🔧 Quellsystem-Name
  dss_load_date: "COALESCE(TRY_CAST([timestamp_landing-zone] AS DATETIME2), GETDATE())"
                                          -- ← 🔧 Timestamp-Quelle (je Quellsystem verschieden)
  dss_create_datetime: "GETDATE()"        -- ← ✅ IMMER GLEICH
  dss_business_key: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(id AS NVARCHAR(MAX)))), '-1'))"
                                          -- ← 🔧 Nur "id" anpassen (BK-Spalte aus Schritt 3.5)
  _escape:
    source_column:
      - "ts"                              -- ← 🔧 Spalten die escaped werden müssen
      - "timestamp_landing-zone"          -- ← 🔧 (mind. 2 Einträge wegen SQL Server)
    escape: true                          -- ← ✅ IMMER GLEICH

hashed_columns:
  hk_idms_address: "id"                   -- ← 🔧 Name (aus Plan) + BK-Spalte

  hd_idms_address:                        -- ← 🔧 Name (aus Plan)
    is_hashdiff: true                     -- ← ✅ IMMER GLEICH
    columns:                              -- ← 🔧 Alle fachlichen Attribute (aus Schritt 3.5)
      - "anrede"                          --    alphabetisch sortiert
      - "cust_id"
      - "egid"
      - "emailaddr"
      - "fax"
      - "firma"
      - "flags"
      - "free_field"
      - "mandate_id"
      - "nachname"
      - "plzort"
      - "postfach"
      - "ref"
      - "status"
      - "strasse"
      - "strasse_nr"
      - "tel"
      - "telg"
      - "telm"
      - "vorname"
      - "zusatz"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}    -- ← ✅ IMMER GLEICH

{{ automate_dv.stage(include_source_columns=true,    -- ← ✅ IMMER GLEICH
                     source_model=metadata_dict['source_model'],
                     derived_columns=metadata_dict['derived_columns'],
                     hashed_columns=metadata_dict['hashed_columns']) }}
```

### `dss_business_key` — Nur eine Stelle anpassen

Das Pattern ist immer identisch — nur der Spaltenname in der Mitte ändert sich:

```yaml
# Template (immer gleich, nur Spaltenname anpassen):
dss_business_key: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(<BK_SPALTE> AS NVARCHAR(MAX)))), '-1'))"

# Beispiele:
dss_business_key: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(id AS NVARCHAR(MAX)))), '-1'))"
dss_business_key: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(EMPL_NR AS NVARCHAR(MAX)))), '-1'))"
```

Bei **Composite Business Keys** (mehrere Spalten zusammen eindeutig) werden alle Teile aufgeführt:

```yaml
# Composite BK: Projekt-Nr + Satz-ID
dss_business_key: "CONCAT_WS('||', 'default', 'default', ISNULL(CAST(PROJNR AS NVARCHAR(MAX)), '-1'), ISNULL(CAST(SATZID AS NVARCHAR(MAX)), '-1'))"

# Und in hashed_columns als Array:
hk_projektsachkonto:
  - "PROJNR"
  - "SATZID"
```

### ⚠️ Was gehört NICHT in den Hashdiff?

| Ausschliessen | Warum |
|---|---|
| Business Key (`id`) | Ändert sich nie — würde nie zu einer neuen Version führen |
| System-Timestamps (`ts`, `timestamp_landing-zone`) | Ändert sich bei jedem Load → würde endlos neue Versionen erzeugen |
| `VARBINARY` / APPSTR Spalten | Können nicht gehasht werden (nur Abacus) |

> 🤔 **Faustregel:** Im Hashdiff sind nur Spalten, bei denen eine Änderung **fachlich relevant** ist und eine neue Version des Satellites rechtfertigt.

### ⚠️ `_escape` — Wann nötig?

Die `_escape` derived column braucht **mindestens 2 Einträge** (SQL Server Einschränkung).  
Falls nur eine Spalte escaped werden muss, einfach eine harmlose zweite Spalte dazunehmen:

```yaml
_escape:
  source_column:
    - "ts"                       # ← Füller (schadet nicht)
    - "timestamp_landing-zone"   # ← Eigentlich zu escapen (Bindestrich!)
  escape: true
```

**Welche Spalten müssen escaped werden?**
- Spalten mit **Bindestrichen** im Namen: `timestamp_landing-zone`
- SQL Server **Reserved Keywords**: `PLAN`, `LEVEL`, `BEFORE`, `AFTER`, `KEY`, `INDEX`

---

## Schritt 5 — Dokumentation (_staging__models.yml)

Jedes Staging-Modell wird in `models/staging/_staging__models.yml` dokumentiert.

### Warum?
- dbt nutzt diese Datei für automatische Tests (`not_null`, `unique`)
- Ermöglicht Spaltenbeschreibungen in der dbt-Dokumentation
- Pflicht für alle Modelle im Projekt

### Eintrag hinzufügen
Füge am Ende der Datei `models/staging/_staging__models.yml` ein:

```yaml
  - name: idms_address_main
    description: "Staging view for IDMS Address Main (IDMS/address/Main.parquet)"
    config:
      meta:
        entity_type: standard
        source_type: external_table
        external_table: ext_idms_address_main
        business_keys:
          - id
    columns:
      - name: hk_idms_address
        description: "Hash Key (Primary Key)"
        data_type: char(64)
        tests:
          - not_null
          - unique
      - name: hd_idms_address
        description: "Hash Diff for change detection"
        data_type: char(64)
        tests:
          - not_null
      - name: id
        description: "Business Key - Adress-ID"
        data_type: int
        tests:
          - not_null
      - name: firma
        description: "Firmenname"
        data_type: nvarchar(4000)
      - name: nachname
        description: "Nachname"
        data_type: nvarchar(4000)
      - name: vorname
        description: "Vorname"
        data_type: nvarchar(4000)
      # ... alle weiteren Spalten
      - name: dss_record_source
        description: "Data source identifier (ewb_idms)"
        data_type: varchar(100)
        tests:
          - not_null
      - name: dss_load_date
        description: "Load timestamp"
        data_type: datetime2(7)
        tests:
          - not_null
      - name: dss_create_datetime
        description: "dbt processing timestamp"
        data_type: datetime2(7)
      - name: dss_business_key
        description: "Concatenated business key string"
        data_type: nvarchar(4000)
```

---

## Schritt 6 — Deployen und testen

### 6.1 External Table deployen

```bash
# External Table in der Datenbank anlegen (oder aktualisieren)
dbt run-operation stage_external_sources --target ewb-dev
```

**Was passiert?** dbt erstellt das `CREATE EXTERNAL TABLE` Statement in Azure SQL.  
Die Tabelle zeigt direkt auf die Parquet-Datei im ADLS.

**Erwartete Ausgabe:**
```
26 of 26 START external source stg.ext_idms_address_main
26 of 26 (3) create external table "datavault-dev"."stg"."ext_idms_address_main" ...
```

### 6.2 Staging View deployen

```bash
# Staging View erstellen
dbt run --select staging.idms_address_main --target ewb-dev
```

**Erwartete Ausgabe:**
```
1 of 1 START sql view model stg.idms_address_main ...... [RUN]
1 of 1 OK created sql view model stg.idms_address_main . [OK in 1.42s]
```

### 6.3 Tests ausführen

```bash
# Tests für das Staging-Modell ausführen
dbt test --select staging.idms_address_main --target ewb-dev
```

Die Tests prüfen:
- `hk_idms_address`: not_null + unique (jede Adresse nur einmal)
- `id`: not_null (Business Key darf nicht leer sein)
- `dss_record_source`: not_null
- `dss_load_date`: not_null

### 6.4 Daten prüfen (optional)

```bash
# Wie viele Adressen sind in der Staging-View?
dbt run-operation run_sql \
  --args '{"sql": "SELECT COUNT(*) AS cnt FROM [stg].[idms_address_main]"}' \
  --target ewb-dev

# Erste 5 Zeilen anschauen
dbt run-operation run_sql \
  --args '{"sql": "SELECT TOP 5 id, firma, nachname, vorname, strasse FROM [stg].[idms_address_main]"}' \
  --target ewb-dev
```

### ✅ Status nach Schritt 6
Nach erfolgreichem Deploy existieren in der Datenbank:
- `stg.ext_idms_address_main` — External Table (Pointer auf Parquet)
- `stg.idms_address_main` — Staging View mit Hashes

---

## Schritt 7 — Raw Vault: Hub & Satellite erstellen

### Was entsteht hier?

```
vault.hub_idms_address          ← Tabelle: nur der Business Key + Metadaten
vault.sat_idms_address__idms    ← Tabelle: alle Attribute + Historisierung
vault.sat_idms_address_current_v ← View: nur der aktuellste Stand
```

Die Vault-Objekte sind `incremental` Tabellen — bei jedem dbt-Lauf werden nur **neue oder geänderte** Datensätze hinzugefügt. Die Staging-View ist die einzige Quelle.

---

### Was ist immer gleich — und was wird angepasst?

Genau wie beim Staging gibt es ein festes Template. Nur wenige Stellen ändern sich:

```
┌─────────────────────────────────────────────────────────────────────┐
│  HUB TEMPLATE                                                       │
│                                                                     │
│  config(materialized='incremental', as_columnstore=false)  ← ✅    │
│  post_hook: create_hash_index('<hk>')              ← 🔧 HK-Name     │
│                                                                     │
│  source_model: "<staging_modell>"                  ← 🔧 Staging     │
│  src_pk: "hk_<entity>"                            ← 🔧 HK-Name     │
│  src_nk: "<business_key_spalte>"                  ← 🔧 BK-Spalte   │
│  src_ldts / src_source / src_extra_columns        ← ✅ IMMER GLEICH │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  SATELLITE TEMPLATE                                                 │
│                                                                     │
│  config(materialized='incremental', as_columnstore=false)  ← ✅    │
│  post_hook: create_hash_index + update_satellite_current_flag ← ✅  │
│    (nur hk-Name anpassen)                                  ← 🔧    │
│                                                                     │
│  source_model: "<staging_modell>"                  ← 🔧 Staging     │
│  src_pk: "hk_<entity>"                            ← 🔧 HK-Name     │
│  src_hashdiff.source_column: "hd_<entity>"        ← 🔧 HD-Name     │
│  src_hashdiff.alias: "HASHDIFF"                   ← ✅ IMMER GLEICH │
│  src_payload: [alle fachlichen Attribute]         ← 🔧 Attributliste│
│  src_ldts / src_source / src_extra_columns        ← ✅ IMMER GLEICH │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  CURRENT VIEW — komplett fix, nur 2 Stellen anpassen               │
│                                                                     │
│  satellite_model: 'sat_<entity>__<quelle>'        ← 🔧             │
│  hashkey_column: 'hk_<entity>'                    ← 🔧             │
└─────────────────────────────────────────────────────────────────────┘
```

### Die 3 Dinge die immer angepasst werden

Alle Werte kommen direkt aus dem Vault-Plan (Schritt 3.5) und dem Staging-Modell:

| Was | Quelle | Beispiel IDMS |
|---|---|---|
| `source_model` | Name des Staging-Modells | `idms_address_main` |
| `hk_<entity>` | Hash Key Name aus Staging | `hk_idms_address` |
| `src_nk` / `src_payload` | BK / Attributliste aus Schritt 3.5 | `id` / `[firma, nachname, ...]` |

---

### Hub: `models/raw_vault/_common/hubs/hub_idms_address.sql`

```sql
{#
    Hub: hub_idms_address
    Source: idms_address_main
    Business Keys: id
#}

{{ config(
    materialized='incremental',          -- ← ✅ IMMER GLEICH
    as_columnstore=false,                -- ← ✅ IMMER GLEICH (Azure SQL Pflicht)
    post_hook=["{{ create_hash_index('hk_idms_address') }}"]  -- ← 🔧 HK-Name
) }}

{%- set yaml_metadata -%}
source_model: "idms_address_main"        -- ← 🔧 Staging-Modell Name

src_pk: "hk_idms_address"               -- ← 🔧 Hash Key Name

src_nk: "id"                            -- ← 🔧 Business Key Spalte (aus Schritt 3.5)

src_ldts: "dss_load_date"               -- ← ✅ IMMER GLEICH
src_source: "dss_record_source"         -- ← ✅ IMMER GLEICH
src_extra_columns:                       -- ← ✅ IMMER GLEICH
    - "dss_business_key"
    - "dss_create_datetime"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}   -- ← ✅ IMMER GLEICH

{{ automate_dv.hub(                                  -- ← ✅ IMMER GLEICH
    src_pk=metadata_dict["src_pk"],
    src_nk=metadata_dict["src_nk"],
    src_extra_columns=metadata_dict["src_extra_columns"],
    src_ldts=metadata_dict["src_ldts"],
    src_source=metadata_dict["src_source"],
    source_model=metadata_dict["source_model"]
) }}
```

**Was der Hub speichert:**
```
vault.hub_idms_address
├── hk_idms_address     ← Hash Key (PK) — technischer Schlüssel
├── id                  ← Business Key (Original-Wert aus IDMS)
├── dss_business_key    ← Normierter BK als Text
├── dss_load_date       ← Wann wurde dieser BK zum ersten Mal gesehen?
├── dss_create_datetime
└── dss_record_source   ← 'ewb_idms'
```

> 💡 Ein Eintrag im Hub bedeutet: "Diese Adresse existiert." Mehr nicht. Keine Attribute, keine Geschichte.

---

### Satellite: `models/raw_vault/_common/satellites/sat_idms_address__idms.sql`

```sql
{#
    Satellite: sat_idms_address__idms
    Parent Hub: hub_idms_address
    Source: idms_address_main
#}

{{ config(
    materialized='incremental',          -- ← ✅ IMMER GLEICH
    as_columnstore=false,                -- ← ✅ IMMER GLEICH
    post_hook=[
        "{{ create_hash_index('hk_idms_address') }}",              -- ← 🔧 HK-Name
        "{{ update_satellite_current_flag(this, 'hk_idms_address') }}" -- ← 🔧 HK-Name
    ]
) }}

{%- set yaml_metadata -%}
source_model: "idms_address_main"        -- ← 🔧 Staging-Modell Name

src_pk: "hk_idms_address"               -- ← 🔧 Hash Key Name (FK zum Hub)

src_hashdiff:
  source_column: "hd_idms_address"      -- ← 🔧 Hash Diff Name (aus Staging)
  alias: "HASHDIFF"                     -- ← ✅ IMMER GLEICH (uppercase!)

src_payload:                             -- ← 🔧 Alle fachlichen Attribute aus Schritt 3.5
    - "anrede"                           --    (alphabetisch, ohne BK und Systemfelder)
    - "cust_id"
    - "egid"
    - "emailaddr"
    - "fax"
    - "firma"
    - "flags"
    - "free_field"
    - "mandate_id"
    - "nachname"
    - "plzort"
    - "postfach"
    - "ref"
    - "status"
    - "strasse"
    - "strasse_nr"
    - "tel"
    - "telg"
    - "telm"
    - "vorname"
    - "zusatz"

src_ldts: "dss_load_date"               -- ← ✅ IMMER GLEICH
src_source: "dss_record_source"         -- ← ✅ IMMER GLEICH
src_extra_columns:                       -- ← ✅ IMMER GLEICH
    - "dss_create_datetime"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}   -- ← ✅ IMMER GLEICH

{{ automate_dv.sat(                                  -- ← ✅ IMMER GLEICH
    src_pk=metadata_dict["src_pk"],
    src_hashdiff=metadata_dict["src_hashdiff"],
    src_payload=metadata_dict["src_payload"],
    src_extra_columns=metadata_dict["src_extra_columns"],
    src_ldts=metadata_dict["src_ldts"],
    src_source=metadata_dict["src_source"],
    source_model=metadata_dict["source_model"]
) }}
```

**Was der Satellite speichert:**
```
vault.sat_idms_address__idms
├── hk_idms_address    ← FK zum Hub (Teil des PK)
├── dss_load_date      ← Ladezeitpunkt dieser Version (Teil des PK)
├── hd_idms_address    ← Hash Diff — hat sich etwas geändert?
├── firma, nachname, vorname, strasse ...  ← Alle fachlichen Attribute
├── dss_create_datetime
├── dss_record_source
├── dss_is_current     ← 'Y' = aktuell, 'N' = historisch (via post_hook)
└── dss_end_date       ← NULL = aktuell, sonst Ablaufdatum (via post_hook)
```

> 💡 `dss_is_current` und `dss_end_date` werden **nicht im SQL definiert** — sie werden automatisch durch den `post_hook` (`update_satellite_current_flag`) gesetzt.

---

### Current View: `models/raw_vault/_common/satellites/sat_idms_address_current_v.sql`

Die Current View ist die **einfachste Datei** im ganzen Projekt — 3 Zeilen, 2 Stellen anpassen:

```sql
{{ config(materialized='view') }}  -- ← ✅ IMMER GLEICH

{{ satellite_current_view(
    satellite_model='sat_idms_address__idms',  -- ← 🔧 Satellite-Name
    hashkey_column='hk_idms_address'           -- ← 🔧 Hash Key Name
) }}
```

**Wozu brauchen wir sie?**  
Der Satellite enthält die **komplette Geschichte** — jede Version jeder Adresse.  
Die Current View filtert automatisch auf `dss_is_current = 'Y'` — also nur den aktuellen Stand.  
Alle nachgelagerten Modelle (Mart, Power BI) nutzen immer die `_current_v` View, nie den Satellite direkt.

---

### Deploy

```bash
# Hub + Satellite + Current View deployen
# Das + vor dem Pfad bedeutet: auch alle Upstream-Modelle (Staging) mitladen
dbt run --select +raw_vault._common.hub_idms_address +raw_vault._common.sat_idms_address__idms --target ewb-dev

# Tests ausführen
dbt test --select raw_vault._common.hub_idms_address raw_vault._common.sat_idms_address__idms --target ewb-dev
```

### ✅ Ergebnis (IDMS Address, 17.06.2026)


| Objekt | Zeilen | Bedeutung |
|---|---:|---|
| `vault.hub_idms_address` | 65.288 | 65.288 distinkte IDMS-Adressen |
| `vault.sat_idms_address__idms` | 65.288 | Erste Ladung — alle Datensätze current |
| `vault.sat_idms_address_current_v` | 65.288 | Alle aktuell (`dss_is_current = 'Y'`) |

**11/11 Tests PASS** ✅

---

## Schritt 7.5 — Link nachrüsten (Option B Upgrade)

> ℹ️ **Dieser Schritt ist optional** — er zeigt wie man von Option A (FK im Hashdiff) auf Option B (echter DV2.1 Link) upgradet.  
> Voraussetzung: Beide beteiligten Hubs müssen existieren (`hub_adresse` + der Hub der Gegenseite).

### Was ändert sich?

Um einen Link zu bauen müssen wir:
1. **Staging anpassen** — `cust_id` aus dem Hashdiff entfernen, stattdessen 2 neue Hash Keys berechnen
2. **Link-Modell erstellen** — `link_adresse_kunde.sql`
3. **Staging neu deployen** — damit die neuen Hashes in der View verfügbar sind

### Schritt 7.5.1 — Staging upgraden

In `models/staging/idms_address_main.sql` werden 2 neue Hashes hinzugefügt und `cust_id` aus dem Hashdiff entfernt:

```yaml
hashed_columns:
  hk_adresse: "inr"               # ← bleibt gleich

  hk_kunde: "cust_id"                 # ← NEU: FK-Hash für hub_kunde
  hk_link_adresse_kunde:              # ← NEU: Link-Hash (Kombination beider BKs)
    - "inr"
    - "cust_id"

  hd_adresse__idms:
    is_hashdiff: true
    columns:
      - "anrede"
      # cust_id: ENTFERNT — ist jetzt im Link, nicht mehr Attribut
      - "egid"
      - "emailaddr"
      # ... weitere Attribute
```

**Was hat sich geändert:**

| Vorher (Option A) | Nachher (Option B) |
|---|---|
| `cust_id` im Hashdiff | `cust_id` aus Hashdiff entfernt |
| Kein `hk_kunde` | `hk_kunde: "cust_id"` berechnet |
| Kein Link-Hash | `hk_link_adresse_kunde: ["inr", "cust_id"]` berechnet |

### Schritt 7.5.2 — Link-Modell erstellen

Erstelle `models/raw_vault/_common/links/link_adresse_kunde.sql`:

```sql
{{ config(materialized='incremental', as_columnstore=false) }}

{%- set yaml_metadata -%}
source_model: "idms_address_main"
src_pk: "hk_link_adresse_kunde"       -- Link PK (Hash beider BKs)
src_fk:
  - "hk_adresse"                      -- FK zu hub_adresse
  - "hk_kunde"                        -- FK zu hub_kunde
src_ldts: "dss_load_date"
src_source: "dss_record_source"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}
{{ automate_dv.link(...) }}
```

> 💡 **Wer berechnet den Link-Hash?** Immer die "Kind"-Seite — also `idms_address_main`,  
> weil dies die Tabelle ist die den FK (`cust_id`) enthält. Der Kunden-Hub  
> berechnet keine Link-Hashes.

---

## Schritt 7.6 — Multi-Source Hub (Cross-Source Integration)

> ℹ️ **Dieser Schritt ist optional** — er zeigt wie man einen bestehenden Hub so umbaut,  
> dass er Daten aus mehreren Quellsystemen akzeptiert.

### Wann ist das nötig?

Wenn dieselbe Entität (z.B. eine Adresse) aus **mehreren Quellsystemen** kommt:

```
Abacus PUBL.ADR:    BK = INR   → beschreibt eine Adresse
IDMS address:       BK = id    → beschreibt dieselbe Art von Adresse
```

Statt zwei separate Hubs zu haben, gibt es **einen gemeinsamen Hub** und pro Quelle einen eigenen Satellite:

```
hub_adresse
├── sat_adresse_kontakt__abacus   (Abacus-Attribute: PLZ, ORT, STREET)
└── sat_adresse__idms             (IDMS-Attribute: firma, nachname, strasse, ...)
```

### Das Kernproblem: verschiedene BK-Spaltennamen

automate_dv's Hub-Macro erwartet **einen `src_nk` Spaltennamen**, der in **allen Quell-Staging-Views gleich heissen muss**.

| Quelle | Originalspalte | Lösung |
|---|---|---|
| `ewb_publ_adr_main` | `inr` | bleibt `inr` |
| `idms_address_main` | `id` | via `derived_columns` als `inr` aliasiert |

### Schritt 7.6.1 — Staging der zweiten Quelle anpassen

In `models/staging/idms_address_main.sql` einen Alias als `derived_column` hinzufügen:

```yaml
derived_columns:
  # ...bestehende derived_columns...
  inr: "CAST(id AS NVARCHAR(MAX))"   -- ← NEU: id → inr (gemeinsamer BK-Name)

hashed_columns:
  hk_adresse: "inr"                  -- ← war: hk_idms_address: "id"
  hd_adresse__idms:                  -- ← war: hd_idms_address
    is_hashdiff: true
    columns: [...]
```

> ⚠️ **Wichtig:** `dss_business_key` referenziert weiterhin `id` direkt — weil `derived_columns`
> alle im selben CTE berechnet werden und man sich nicht gegenseitig referenzieren kann.

### Schritt 7.6.2 — Hub auf Multi-Source umbauen

In `models/raw_vault/_common/hubs/hub_adresse.sql` `source_model` von String zu Liste ändern:

```yaml
# Vorher (Single-Source):
source_model: "ewb_publ_adr_main"

# Nachher (Multi-Source):
source_model:
  - "ewb_publ_adr_main"     -- ← Quelle 1: Abacus (inr = INR)
  - "idms_address_main"     -- ← Quelle 2: IDMS   (inr = CAST(id))
src_nk: "inr"               -- ← gemeinsamer BK-Name, in beiden Views vorhanden
```

automate_dv erledigt den Rest automatisch: Es baut für jede Quelle einen eigenen CTE, macht ein `UNION ALL` und dedupliziert danach.

### Schritt 7.6.3 — Neuen Satellite für die zweite Quelle erstellen

Erstelle `models/raw_vault/_common/satellites/sat_adresse__idms.sql` mit `hk_adresse` (nicht mehr `hk_idms_address`):

```yaml
source_model: "idms_address_main"
src_pk: "hk_adresse"             -- ← FK zum gemeinsamen Hub
src_hashdiff:
  source_column: "hd_adresse__idms"
  alias: "HASHDIFF"
src_payload: [firma, nachname, ...]
```

### ⚠️ Deploy-Reihenfolge — wichtig!

**Fehler der passiert wenn man die falsche Reihenfolge deployed:**
```
Invalid column name 'hk_adresse' / Invalid column name 'inr'
```

**Ursache:** Der Hub referenziert Spalten aus der Staging-View — aber die View wurde noch nicht neu deployt und hat noch die alten Spaltennamen.

**Korrekte Reihenfolge:**
```bash
# 1. Zuerst Staging neu deployen (neue Spalten hk_adresse, inr)
dbt run --select staging.idms_address_main --target ewb-dev

# 2. Erst dann Hub + Satellite deployen
dbt run --select +raw_vault._common.hub_adresse +raw_vault._common.sat_adresse__idms --target ewb-dev
```

> 💡 **Merksatz:** Staging immer zuerst — Vault-Objekte lesen aus dem Staging, nicht umgekehrt.

### Alte Datenbank-Objekte aufräumen

Wenn ein Hub oder Satellite umbenannt/ersetzt wird, müssen die alten Objekte manuell in der DB gelöscht werden — dbt löscht nichts automatisch:

```bash
# View zuerst droppen (keine Abhängigkeiten)
dbt run-operation run_sql --args '{"sql": "DROP VIEW IF EXISTS [vault].[sat_idms_address_current_v]"}' --target ewb-dev

# Dann Tabellen
dbt run-operation run_sql --args '{"sql": "DROP TABLE IF EXISTS [vault].[sat_idms_address__idms]"}' --target ewb-dev
dbt run-operation run_sql --args '{"sql": "DROP TABLE IF EXISTS [vault].[hub_idms_address]"}' --target ewb-dev
```

> ⚠️ **Reihenfolge:** View vor Tabellen droppen. Falls die View die Tabelle referenziert, schlägt der Table-Drop sonst fehl.

---

## Schema-Evolution: Neue Spalte zu einem Satellite hinzufügen

Wenn ein Satellite bereits in Produktion ist und eine neue Spalte hinzukommt, gibt es verschiedene Strategien. Die Wahl hängt davon ab ob die History wichtig ist.

### Was passiert bei `dbt run` (ohne Full Refresh)?

Per Default (`on_schema_change: ignore`) ignoriert dbt neue Spalten stillschweigend — kein Fehler, aber die Spalte kommt **nie in die DB-Tabelle**. Im EWB-Projekt ist `on_schema_change: append_new_columns` gesetzt, d.h. dbt macht automatisch ein `ALTER TABLE ADD COLUMN`. Bestehende Zeilen erhalten `NULL` für die neue Spalte.

```
Vorher:  hk_person | last_name | first_name
Nachher: hk_person | last_name | first_name | code_2 (NULL für alte Zeilen)
```

### Was passiert bei `--full-refresh`?

Die Tabelle wird komplett gedroppt und neu erstellt — alle Spalten korrekt befüllt, aber **die gesamte SCD2-History geht verloren**.

### Entscheidungsmatrix

| Situation | Empfehlung |
|-----------|-----------|
| Neue Spalte, History unwichtig / akzeptabel leer | `dbt run` — `append_new_columns` ergänzt Spalte, alte Zeilen = NULL |
| Neue Spalte, History muss vollständig sein | `--full-refresh` — einmalig, kontrolliert in Wartungsfenster |
| Neue Spalte aus anderer Quelle | Eigener separater Satellite (`sat_person_kostenstelle__abacus`) |
| Fundamentaler Themenbruch (z.B. Adresse vs. Vertrag) | Eigener separater Satellite |

### Wann ist ein eigener Satellite sinnvoll?

Nicht jede neue Spalte braucht einen eigenen Satellite — das wäre Over-Engineering. Ein separater Satellite ist sinnvoll wenn:

- Die neue Information kommt aus einer **anderen Quelle** (anderer `__source` Suffix)
- Die **Änderungsfrequenz** stark abweicht (z.B. Stammdaten ändern sich jährlich, Kontaktdaten täglich)
- Die History der bestehenden Zeilen **nicht verloren gehen darf** und ein Full Refresh nicht möglich ist

**Beispiel:** Kostenstelle pro Person kommt neu aus einem HR-System:
```
hub_person
    ├── sat_person__abacus            (Name, Adresse, Funktion — aus Abacus)
    └── sat_person_kostenstelle__hr   (Kostenstelle — aus HR-System)
```

Beide Satellites hängen am selben Hub — History ist getrennt, kein Full Refresh des bestehenden Satellites nötig.

### Deployment-Reihenfolge bei neuer Spalte (Produktionsumgebung)

```bash
# 1. Auf dev: Full Refresh des betroffenen Satellites
dbt run --full-refresh --select sat_person__abacus --target ewb-dev

# 2. Merge Request dev → test → prod erstellen
# 3. Auf test/prod: dbt run (kein Full Refresh)
#    → append_new_columns ergänzt die Spalte automatisch
#    → bestehende Zeilen haben NULL für neue Spalte (akzeptiert)
#    → neue Zeilen ab nächstem Load vollständig befüllt
dbt run --select sat_person__abacus --target ewb-test
```

> 💡 **Data Vault Prinzip:** Der Raw Vault bildet die Quelle ab was sie geliefert hat. Fehlende Werte in historischen Zeilen sind kein Fehler — sie bedeuten «zum damaligen Zeitpunkt nicht bekannt». Erst ab dem Deployment-Zeitpunkt wird die neue Spalte befüllt.


## Schritt 8 — Mart: Dimension & Fakt erstellen

Der **Mart Layer** ist die letzte Schicht — die "lesbare" Sicht für Business-User und Power BI.  
Während der Raw Vault auf Auditierbarkeit und Historisierung optimiert ist (Hash Keys, viele Tabellen), ist der Mart auf **Verständlichkeit und Abfrage-Performance** optimiert.

### 8.1 — Was ist dimensionale Modellierung? (Star Schema)

Der Mart folgt dem **Kimball Star Schema**. Es gibt nur zwei Arten von Objekten:

```
                    ┌──────────────────┐
                    │  dim_person_v    │   ← WER? (beschreibende Stammdaten)
                    └────────┬─────────┘
                             │ person_key
                             │
        ┌──────────────────┐ │ ┌──────────────────┐
        │  dim_projekt_v   │─┼─│  dim_date_v      │
        └──────────────────┘ │ └──────────────────┘
                  projekt_key │ date_key
                             ▼
                    ┌──────────────────┐
                    │  fakt_stunden_v  │   ← WAS/WIEVIEL? (messbare Fakten)
                    │  • projekt_key   │
                    │  • person_key    │
                    │  • date_key      │
                    │  • betrag (Measure)
                    └──────────────────┘
```

| Objekttyp | Frage | Inhalt | Beispiel |
|---|---|---|---|
| **Dimension** (`dim_*_v`) | WER / WAS / WO / WANN? | Beschreibende Attribute | Person, Projekt, Konto, Datum |
| **Faktentabelle** (`fakt_*_v`) | WIEVIEL / WIE OFT? | Messbare Kennzahlen + FKs zu Dimensionen | Stunden, Buchungen, Anrufe |

**Die zentrale Frage beim Modellieren:** Was will der Fachbereich **messen** (→ Fakt) und nach welchen **Kriterien** will er es aufschlüsseln (→ Dimensionen)?

> 💡 **Beispiel Finanz-Reporting:** Der Fachbereich will den **Betrag** (Measure) sehen, aufgeschlüsselt nach **Konto**, **Kostenstelle** und **Periode** (3 Dimensionen). → 1 Faktentabelle `fakt_buchungen_v` + 3 Dimensionen.

### 8.2 — Was vor dem Bauen zu klären ist

Bevor man eine Mart-View schreibt, klärt man **4 Designfragen**:

```
1. Dimension oder Fakt?       → Beschreibung = dim, Messung = fakt
2. Welche Granularität?       → Was ist 1 Zeile? (1 Buchung? 1 Person? 1 Tag?)
3. SCD1 oder SCD2?            → Aktueller Stand oder Historie? (siehe 8.3)
4. Welche Vault-Objekte?     → Welche Hubs/Sats/Links liefern die Daten?
```

#### Granularität (das Wichtigste bei Fakten!)

Die **Granularität** legt fest, was **eine Zeile** in der Faktentabelle bedeutet:

| Faktentabelle | 1 Zeile = | Granularität |
|---|---|---|
| `fakt_stunden_v` | 1 Projektsachkonto-Buchung | fein (atomar) |
| `fakt_cdr_v` | 1 Anruf / 1 Daten-Session | sehr fein (atomar) |
| `fakt_aktive_abos_v` | 1 Vertrag zu einem Stichtag | aggregiert |

> ⚠️ **Regel:** Alle Measures in einer Faktentabelle müssen **dieselbe Granularität** haben. Niemals Tages- und Monatssummen in derselben Tabelle mischen.

### 8.3 — SCD1 vs SCD2 (Slowly Changing Dimensions)

Eine der wichtigsten Designentscheidungen: Wie geht die Dimension mit **Änderungen über Zeit** um?

```
┌──────────────────────────────────────────────────────────────────┐
│  SCD Typ 1 — "Nur der aktuelle Stand"                            │
│                                                                  │
│  Person 42 zieht um: Bern → Zürich                              │
│  → dim zeigt nur: Zürich (alte Adresse überschrieben)           │
│  → 1 Zeile pro Person                                            │
│  → Quelle: sat_*_current_v  (WHERE dss_is_current = 'Y')        │
│  → STANDARD für die meisten Dimensionen                         │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  SCD Typ 2 — "Komplette Historie"                               │
│                                                                  │
│  Person 42 zieht um: Bern → Zürich                              │
│  → dim zeigt BEIDE Zeilen:                                       │
│      42 | Bern   | gültig 2020–2024 | is_current = N            │
│      42 | Zürich | gültig 2024–heute| is_current = Y            │
│  → mehrere Zeilen pro Person (je Gültigkeitszeitraum)           │
│  → Quelle: Satellite direkt (alle Records, mit dss_end_date)    │
│  → Nur wenn der Fachbereich Historie BRAUCHT                    │
└──────────────────────────────────────────────────────────────────┘
```

**Wie wählt man?**

| Frage | SCD1 | SCD2 |
|---|---|---|
| "Wie ist die Adresse **jetzt**?" | ✅ | |
| "Wo wohnte die Person **2022**?" | | ✅ |
| Reporting auf aktuellem Stand | ✅ | |
| Historische Auswertungen / Trends | | ✅ |

> 💡 **Faustregel:** Starte mit **SCD1** (`sat_*_current_v`). Das deckt 90% der Reporting-Anforderungen ab. SCD2 nur wenn der Fachbereich explizit Historie verlangt.

Der Mechanismus ist einfach: Der Raw Vault speichert **immer** die volle Historie (SCD2) im Satellite. Die `_current_v` View filtert auf `dss_is_current = 'Y'` → daraus wird SCD1. Du entscheidest also pro Dimension, ob du die `_current_v` View (SCD1) oder den Satellite direkt (SCD2) verwendest.

### 8.4 — Surrogate Keys

Power BI verknüpft Dimensionen und Fakten über **Surrogate Keys** — schmale BIGINT-Schlüssel statt der langen Hash Keys aus dem Vault.

```sql
{{ surrogate_key('lohnnr') }} AS person_key
-- generiert: ABS(CONVERT(BIGINT, HASHBYTES('MD5', CAST(lohnnr AS NVARCHAR(MAX)))))
```

**Die wichtigste Regel:** Dimension und Faktentabelle müssen **denselben** `surrogate_key()`-Aufruf auf **denselben** Business Key anwenden — sonst matchen die Joins nicht:

```sql
-- In dim_person_v.sql:
{{ surrogate_key('lohnnr') }} AS person_key       -- ← Dimension PK

-- In fakt_stunden_v.sql:
{{ surrogate_key('hp.projnr') }} AS projekt_key   -- ← Fakt FK (gleiche Logik!)
```

> 💡 Deterministisch: `surrogate_key('42')` ergibt **immer denselben** BIGINT — egal in welchem Modell. Deshalb funktioniert der Join.

### 8.5 — Dimension Pflicht-Spalten

Jede Dimension hat ein standardisiertes Spalten-Gerüst:

| Spalte | Typ | Beschreibung | Fallback |
|---|---|---|---|
| `{dim}_key` | BIGINT | Surrogate Key (PK) via `surrogate_key()` | — |
| `{dim}_id` | NVARCHAR(255) | Technische ID | — |
| `{dim}_code` | NVARCHAR(255) | Sprechender Schlüssel | = ID |
| `{dim}_name` | NVARCHAR(255) | Bezeichnung | = CODE oder `'UNKNOWN'` |
| `dss_load_date` | DATETIME2 | Ladezeitpunkt aus Vault | — |
| `dss_record_source` | NVARCHAR(255) | Quelle | — |

Die **NULL-Behandlung** mit Fallbacks ist Pflicht (verhindert leere Felder im Report):
```sql
ISNULL(NULLIF(code_col, ''), CAST(id_col AS NVARCHAR(255)))   AS {dim}_code
ISNULL(NULLIF(name_col, ''), ISNULL(code_col, 'UNKNOWN'))     AS {dim}_name
```

### 8.6 — Dimension Template (Beispiel `dim_adresse_v`)

Eine Dimension joint Hub + Current-View des Satellites. Für unsere IDMS-Adresse:

```sql
/*
 * Dimension: dim_adresse
 * Schema: mart (mart/_common/)
 * SCD1 — aktueller Stand via sat_adresse__idms_current_v
 */

{{ config(materialized='view', tags=['dimension']) }}   -- ← ✅ IMMER GLEICH

SELECT
    {{ surrogate_key('h.inr') }}                          AS adresse_key,   -- ← 🔧 BK
    CAST(h.inr AS NVARCHAR(255))                          AS adresse_id,
    ISNULL(NULLIF(s.firma, ''),
           CAST(h.inr AS NVARCHAR(255)))                  AS adresse_code,
    ISNULL(NULLIF(CONCAT_WS(', ', s.nachname, s.vorname), ''),
           ISNULL(s.firma, 'UNKNOWN'))                    AS adresse_name,
    -- Weitere beschreibende Attribute
    s.firma,
    s.strasse,
    s.strasse_nr,
    s.emailaddr,
    -- Metadaten
    s.dss_load_date,
    s.dss_record_source
FROM {{ ref('hub_adresse') }} h                            -- ← 🔧 Hub
INNER JOIN {{ ref('sat_adresse__idms_current_v') }} s     -- ← 🔧 Current View (SCD1!)
    ON h.hk_adresse = s.hk_adresse
```

| Stelle | Anpassen? |
|---|---|
| `config(materialized='view', tags=['dimension'])` | ✅ immer gleich |
| `surrogate_key('h.inr')` | 🔧 Business Key der Dimension |
| `{dim}_key/_id/_code/_name` | 🔧 Pflichtspalten benennen |
| `ref('hub_*')` + `ref('sat_*_current_v')` | 🔧 Vault-Quellen |
| `WHERE` / `current_v` | 🔧 SCD1 (current_v) vs SCD2 (Satellite direkt) |

### 8.7 — Faktentabelle Template

Eine Faktentabelle verbindet über **Links** mehrere Hubs und sammelt die **Measures** aus den Satellites:

```sql
/*
 * Faktentabelle: fakt_<content>
 * Granularität: 1 Zeile pro <event>
 */

{{ config(materialized='view', tags=['fact']) }}          -- ← ✅ IMMER GLEICH

SELECT
    -- Foreign Keys: GLEICHER surrogate_key()-Aufruf wie in den Dimensionen!
    {{ surrogate_key('h_proj.projnr') }}     AS projekt_key,    -- ← 🔧 FK zu dim_projekt
    {{ surrogate_key('h_pers.lohnnr') }}     AS person_key,     -- ← 🔧 FK zu dim_person
    -- Measures (die Kennzahlen)
    s.azbetint                                AS betrag,         -- ← 🔧 Measure
    -- Metadaten
    s.dss_load_date,
    s.dss_record_source
FROM {{ ref('hub_projektsachkonto') }} h                        -- ← 🔧 zentraler Hub
INNER JOIN {{ ref('sat_projektsachkonto__abacus_current_v') }} s
    ON h.hk_projektsachkonto = s.hk_projektsachkonto
INNER JOIN {{ ref('link_projektsachkonto_projekt') }} lnk       -- ← 🔧 Link für FKs
    ON h.hk_projektsachkonto = lnk.hk_projektsachkonto
INNER JOIN {{ ref('hub_projekt') }} h_proj
    ON lnk.hk_projekt = h_proj.hk_projekt
WHERE s.azbetint <> 0                                            -- ← 🔧 fachlicher Filter
```

### 8.8 — Materialisierung: View vs. Table

| Materialisierung | Wann? |
|---|---|
| `materialized='view'` | **Standard** — Virtualisierung, immer aktuell, keine Speicherung |
| `materialized='table'` | Nur bei Performance-Problemen (grosse Joins, viele Zeilen) |

> ⚠️ **Pflicht-Regel bei `table`:** Wenn ein Mart-Objekt als `table` materialisiert wird, MUSS eine 1:1 Wrapper-View `_v` existieren. Power BI nutzt immer die `_v` View, nie die interne Tabelle.

```
fakt_cdr.sql      → materialized='table'   (interner Performance-Cache)
fakt_cdr_v.sql    → materialized='view'    → SELECT * FROM {{ ref('fakt_cdr') }}
                                              ↑ Power BI nutzt diese
```

### 8.9 — Schema-YAML & Tests

Jede Mart-View wird in `models/mart/<concept>/_<concept>__models.yml` dokumentiert. Pflicht-Tests:

```yaml
models:
  - name: dim_adresse_v
    description: "Adress-Dimension (SCD1) aus hub_adresse + sat_adresse__idms"
    columns:
      - name: adresse_key
        tests: [not_null, unique]      # ← Surrogate Key muss eindeutig sein!
      - name: adresse_code
        tests: [not_null]
      - name: adresse_name
        tests: [not_null]
```

### 8.10 — Deploy

```bash
# Dimension deployen (mit allen Upstream-Vault-Objekten)
dbt run --select +mart._common.dim_adresse_v --target ewb-dev

# Tests
dbt test --select mart._common.dim_adresse_v --target ewb-dev
```

> 💡 **Schema-Konvention:** Geteilte Dimensionen liegen in `mart/_common/` (Schema `mart`).  
> Domain-spezifische Objekte liegen in `mart/<concept>/` (Schema `mart_<concept>`, z.B. `mart_finance`, `mart_telecom`).

---

## Gesamtcheckliste

Nutze diese Checkliste für jedes neue Business-Objekt:

### Staging (Schritte 1–6)
- [ ] **Schritt 1:** Parquet-Datei identifiziert (Container, Pfad, Data Source)
- [ ] **Schritt 2:** `get_parquet_schema` Macro ausgeführt, Typen geprüft
- [ ] **Schritt 3:** `sources.yml` Eintrag unter korrekter Sektion hinzugefügt
- [ ] **Schritt 4:** `models/staging/<name>.sql` mit `automate_dv.stage()` Pattern erstellt
  - [ ] Business Key identifiziert
  - [ ] `dss_record_source` korrekt gesetzt
  - [ ] `dss_load_date` korrekt gemappt
  - [ ] Alle Reserved Keywords / Bindestriche in `_escape` eingetragen (mind. 2 Einträge!)
  - [ ] Hashdiff enthält nur fachliche Attribute (kein BK, keine Timestamps)
- [ ] **Schritt 5:** `_staging__models.yml` Eintrag mit Tests hinzugefügt
- [ ] **Schritt 6:** External Table + Staging View deployed, Tests grün ✅

### Raw Vault (Schritt 7)
- [ ] `hub_<entity>.sql` erstellt
- [ ] `sat_<entity>__<quelle>.sql` erstellt
- [ ] `sat_<entity>_current_v.sql` erstellt
- [ ] `_common__models.yml` aktualisiert
- [ ] ER-Diagramm aktualisiert
- [ ] Alle Vault-Objekte deployed, Tests grün ✅

### Mart (Schritt 8)
- [ ] Designfragen geklärt: Dimension oder Fakt? Granularität? SCD1/SCD2?
- [ ] `dim_<entity>_v.sql` erstellt (Pflicht-Spalten: key/id/code/name + Metadaten)
- [ ] `surrogate_key()` für PK (Dimension) und FKs (Fakt) konsistent verwendet
- [ ] `fakt_<content>_v.sql` erstellt (bei messbaren Daten)
- [ ] `_<concept>__models.yml` mit Tests (`not_null`, `unique` auf `{dim}_key`)
- [ ] Bei `table`-Materialisierung: zusätzliche `_v` Wrapper-View
- [ ] Mart-Views deployed, Tests grün ✅

---

## Häufige Fehler

### ❌ `CONCAT_WS requires 3 to 254 arguments`
**Ursache:** `_escape` hat nur einen Eintrag in der `source_column` Liste.  
**Lösung:** Zweite Spalte hinzufügen (z.B. `ts`).

### ❌ `Invalid column name 'timestamp_landing-zone'`
**Ursache:** Spalte mit Bindestrich wird ohne eckige Klammern referenziert.  
**Lösung:** Spalte in `_escape` eintragen.

### ❌ External Table hat falsche Columns
**Ursache:** `sources.yml` Eintrag stimmt nicht mit der Parquet-Datei überein.  
**Lösung:** `get_parquet_schema` Macro erneut ausführen und `sources.yml` korrigieren. Dann `stage_external_sources` erneut ausführen.

### ❌ Staging View zeigt keine Daten
**Ursache:** External Table konnte die Parquet-Datei nicht finden.  
**Lösung:** Pfad und Data Source in `sources.yml` prüfen. Dateiname ist case-sensitive!

---

*Dieses Dokument wird parallel zur Implementierung gepflegt und erweitert.*  
*Nächste Erweiterung: Schritt 7 (Raw Vault) mit konkretem Code-Beispiel.*
