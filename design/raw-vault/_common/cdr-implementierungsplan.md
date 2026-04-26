# CDR-Reporting Mobile — Implementierungsplan

**Erstellt:** 22. April 2026  
**Status:** 📋 PLAN (keine Umsetzung)  
**Scope:** Mobile-Telefonie CDR-Daten von Compax (RSN — Rii Seez Net)  
**Nicht im Scope:** Lambda Vault (Real-Time), Festnetz-CDR (später)

---

## 1. Fachlicher Kontext

### Quellsystem
**Compax** ist das Billing-/Provisioning-System für die EWB Mobile/MVNO-Services. Datenlieferant ist **Rii Seez Net (RSN)** als Netzbetreiber/Provider.

### Datenlieferung (bereits aktiv)
- **ADF Pipeline `Copy_CRD_Test`** (Test-Pipeline, noch kein Trigger)
  - Source: SFTP `10.40.101.10` (`ppmc_ewb`), Pfad `/services/` + `/cdrs/`
  - Sink: ADLS `load-fs/ewb/cdr/{services,udrs}/` als `.txt`
  - Additional Columns auf Source: `dss_load_date = @pipeline().TriggerTime`, `dss_record_source = ewb_compax` + 3 weitere DSS-Metadaten
- **Downstream:** Parquet-Konvertierung → `stage-fs/ewb/cdr/{services,udrs}/`

### Zwei Datensätze

| Dataset | Frequenz | Volumen (aktuell) | Business Key | Inhalt |
|---------|----------|-------------------|--------------|--------|
| **services** (Stammdaten) | 1×/Tag (07:00) | 650'112 Zeilen / 5'879 Verträge / 4'475 Kunden / 5'967 SIM-Karten | `vertrags_nummer` + `abo_option_name` | Abos, Optionen, SIM-Karten, Rufnummern, Aktivierungs-/Kündigungsdaten |
| **udrs** (Usage Events) | alle 10 min (~150/Tag) | ~135'000 Events/Tag (geschätzt; `id` ~2.7 Mrd → riesige Historie) | `id` | Einzelverbindungsnachweise (Voice, Data, SMS, Forwarding, Roaming) |

### Fachlicher Join
```
udrs.contract_id  ↔  services.vertrags_nummer   ← primärer Link (Format: 300xxxxxx)
udrs.iccid        ↔  services.icc               ← SIM-Verifikation
```

---

## 2. Inhaltsanalyse

### 2.1 Services (Stammdaten)

**Top-Abos/Optionen:**

| Abo/Option | Zeilen | Typ |
|---|---:|---|
| Mobile M | 155'368 | Haupt-Abo |
| Mobile S | 149'813 | Haupt-Abo |
| Mobile S 2018 | 122'958 | Haupt-Abo (Legacy) |
| Mobile GM | 36'396 | Haupt-Abo (Gemeinde) |
| 1GB Roaming Zone 2/3 | 31'700 | Option |
| Mobile GS | 25'211 | Haupt-Abo (Gemeinde) |
| Mobile Business M | 24'638 | Haupt-Abo |
| 5GB Roaming Zone 2/3 | 23'798 | Option |
| 100min Roaming Zone 2/3 | 16'690 | Option |
| Mobile Data 50 (Gemeinde) | 13'636 | Option |

- **85.5% Haupt-Abos** (`ist_option=0`), 14.5% Zusatz-Optionen
- **Kundenstruktur:** ~1.3 Verträge pro Kunde → einzelne Kunden mit mehreren Verträgen
- **SIM-Wechsel:** SIM-Kardinalität > Verträge → einzelne Verträge mit SIM-Wechsel in der Historie
- **Datumsbereiche:** aktivierungs_datum bis 9999-12-31 (Sentinel "offen/unbekannt"); kundigungs_datum enthält zukünftige Kündigungen

**Kunden-IDs:**
- `customer_id`: 6-stellig numerisch (z.B. 704253, 708583) — Compax-interne ID
- `external_customer_id`: teils numerisch, teils `CXL_xxxxx` (Compax-Legacy) — möglicher Join zu Abacus-Kunden (noch zu klären)

### 2.2 UDRs (Usage Events)

**Ereignis-Typen** (aus Sample-Daten):

| record_type | Bedeutung |
|---|---|
| MOC | Mobile Originated Call (ausgehender Anruf) |
| MTC | Mobile Terminated Call (eingehender Anruf) |
| FORW | Call Forwarding (Rufumleitung) |
| DATA | Datenverbindung (GPRS/LTE-Session) |
| SMS | Kurznachricht |

**Metriken:**
- `duration` — Gesprächsdauer in Sekunden
- `bytes_in` / `bytes_out` — Datenvolumen (Bytes)
- `price` / `ws_price` — Endkundenpreis vs. Wholesale-Preis
- `tarif` — Freitext-Tarif (z.B. "Voice MO in National (CH + FL) to National (CH + FL)")
- `r_mcc_mnc` — Roaming-Kennzeichnung (Mobile Country Code / Network Code)

**Identifier:**
- `a` — A-Rufnummer (Anrufer)
- `b` — B-Rufnummer (Angerufener)
- `imsi` — SIM-Netz-Identifikation (228-02 = Sunrise-Infrastruktur CH)
- `iccid` — Physikalische SIM-Karte

⚠️ **Performance-Hinweis:** External-Table Full-Scan über UDRs läuft >60 Min auch für einfache `COUNT(*)`. Native Azure SQL Table (PSA-Pattern) erforderlich.

---

## 3. Naming-Anpassung (Roger-Feedback)

### 3.1 Wunsch von Roger
> "Staging bitte die Namensgebung folgendermassen anpassen: `rsn_mobile_cdr_Main` + `rsn_mobile_services_main` — so können wir später Festnetz-CDRs unterscheiden. Thema betrifft unseren Provider Rii Seez Net, daher `rsn` statt `ewb`."

### 3.2 Abgleich mit unserer Konvention

Aktuelle Konvention: `<concept>_<modul>_<tabelle>_<suffix>` (z.B. `ewb_fibu_fhe_main`)

**Mapping:**

| Position | Aktuell | Neu (Roger) |
|----------|---------|-------------|
| concept | `ewb` (Kunde) | `rsn` (Provider) |
| modul | `cdr` | `mobile` |
| tabelle | `services` / `udrs` | `services` / `cdr` |
| suffix | `main` | `main` |

→ **Konvention bleibt gewahrt** (4-teiliger Name). Semantik ändert sich:
- `concept = rsn` = Quellsystem-Prefix (analog `ewb` für Abacus)
- `modul = mobile` = Fachbereich (künftig `festnetz` möglich)

### 3.3 Neue Namen

| Objekt | Alt (wegwerfen) | Neu |
|--------|-----------------|-----|
| External Table Stammdaten | `ext_ewb_cdr_services` | `ext_rsn_mobile_services_main` |
| External Table Events | `ext_ewb_cdr_udrs` | `ext_rsn_mobile_cdr_main` |
| Staging View Stammdaten | — (noch nicht erstellt) | `rsn_mobile_services_main` |
| Staging View Events | — (noch nicht erstellt) | `rsn_mobile_cdr_main` |
| PSA Events (native Table) | — | `psa_rsn_mobile_cdr_main` |
| ADLS Folder | `ewb/cdr/services/` + `ewb/cdr/udrs/` | ⚠️ **Folders in ADLS bleiben** — umbenennen wäre ADF-/SFTP-Rework; External Table Location wird unverändert übernommen |
| dss_record_source | `ewb_compax` (ADF) | `rsn_compax` — ⚠️ ADF-Pipeline muss ebenfalls angepasst werden |

### 3.4 Entscheidung nötig (offen für Meeting)

- [ ] **ADLS-Folder umbenennen?** Aktuell `load-fs/ewb/cdr/*` → logisch korrekter wäre `load-fs/rsn/mobile/*`. Aufwand: ADF-Pipeline + DataFlow + Stage-Converter anpassen. **Empfehlung: später** — jetzt nur DV-Schicht konsistent benennen, Lake-Layout später migrieren.
- [ ] **`dss_record_source` Wert:** `rsn_compax`, `compax_mobile` oder `ewb_compax`?

---

## 4. Architektur-Entscheidungen

### 4.1 UDRs als PSA-Tabelle (keine reine External-Table View)

**Warum:** External-Table Scan ist für UDRs-Volumen zu langsam (>60 Min für Aggregate).

**Pattern** (analog `psa_ewb_fibu_gl`):
```sql
-- psa_rsn_mobile_cdr_main.sql (native Table, incremental)
{{ config(
    materialized='incremental',
    incremental_strategy='delete+insert',
    unique_key=['id', 'dss_source_file_name'],
    as_columnstore=false
) }}

SELECT *, GETDATE() AS dss_create_datetime
FROM {{ source('staging', 'ext_rsn_mobile_cdr_main') }}
```

→ Staging View `rsn_mobile_cdr_main` liest dann aus PSA, nicht direkt aus External Table.

### 4.2 Services als direkte Staging-View

Volumen klein (650k) → kein PSA nötig, direkt View auf External Table.

### 4.3 Kein Lambda Vault (vorerst)

Laut User-Vorgabe: Lambda Vault erst im nächsten Schritt. Die 10-Minuten-Lieferung der UDRs wird vorerst als Batch behandelt — dbt-Lauf im definierten Intervall (z.B. stündlich oder täglich).

---

## 5. Data Vault Modellierung

> **Legende:** PK = Primärschlüssel, FK = Fremdschlüssel, CDK = Child Dependent Key, BK = Business Key  
> DSS-Spalten (`dss_*`) sind Pflichtfelder auf jedem DV-Objekt und werden nicht in jeder Tabelle einzeln aufgeführt (stehen am Schluss jedes Objekts).

---

### 5.1 Hubs

#### `hub_vertrag`
Zentrales Objekt — bindet Stammdaten (services) und Events (udrs). Source-agnostisch: künftige Festnetz-Verträge liefern ebenfalls in diesen Hub.

| Spalte | Typ | PK | Quelle | Beschreibung |
|--------|-----|----|--------|--------------|
| `hk_vertrag` | CHAR(64) | ✅ | Hash(`vertrag_id`) | Hash Key |
| `vertrag_id` | NVARCHAR(4000) | | services.`vertrags_nummer` / udrs.`contract_id` | Business Key — im Staging als `vertrag_id` aliasiert |
| `dss_business_key` | NVARCHAR | | `CONCAT_WS('||','default','default', vertrag_id)` | Normierter BK |
| `dss_load_date` | DATETIME2 | | ADF TriggerTime | Ladezeitpunkt |
| `dss_create_datetime` | DATETIME2 | | GETDATE() | Erstellungszeitpunkt |
| `dss_record_source` | NVARCHAR | | ADF configured | Quelle |

> **Feeds:** `rsn_mobile_services_main` (täglich) + `rsn_mobile_cdr_main` (alle 10 min via `contract_id`)  
> **Staging-Mapping:** `vertrags_nummer` → `vertrag_id` (services); `contract_id` → `vertrag_id` (cdr)

---

#### `hub_kunde`
Source-agnostischer Kunden-Hub. Compax liefert aktuell als einzige Quelle. Weitere Quellen (Abacus via `external_customer_id`, CRM) liefern in denselben Hub mit eigenem `dss_record_source`.

| Spalte | Typ | PK | Quelle | Beschreibung |
|--------|-----|----|--------|--------------|
| `hk_kunde` | CHAR(64) | ✅ | Hash(`kunde_id`) | Hash Key |
| `kunde_id` | NVARCHAR(4000) | | services.`customer_id` | Business Key — im Staging als `kunde_id` aliasiert |
| `dss_business_key` | NVARCHAR | | `CONCAT_WS('||','default','default', kunde_id)` | |
| `dss_load_date` | DATETIME2 | | | |
| `dss_create_datetime` | DATETIME2 | | | |
| `dss_record_source` | NVARCHAR | | | |

> **Staging-Mapping:** `customer_id` → `kunde_id`  
> **Zukünftig:** Abacus-Kunden (`ADRESSNR` → `kunde_id`, `dss_record_source='ewb_abacus'`) → Same-As Link wenn `external_customer_id = ADRESSNR`

---

#### `hub_sim`
SIM-Karte — ICCID ist global eindeutig (Industriestandard). Verbindet services (`icc`) und udrs (`iccid`).

| Spalte | Typ | PK | Quelle | Beschreibung |
|--------|-----|----|--------|--------------|
| `hk_sim` | CHAR(64) | ✅ | Hash(`icc`) | Hash Key |
| `icc` | NVARCHAR(4000) | | services.icc / udrs.iccid | Business Key (= ICCID, SIM-global-ID) |
| `dss_business_key` | NVARCHAR | | `CONCAT_WS('||','default','default', icc)` | |
| `dss_load_date` | DATETIME2 | | | |
| `dss_create_datetime` | DATETIME2 | | | |
| `dss_record_source` | NVARCHAR | | | |

---

#### `hub_msisdn`
Rufnummer (MSISDN). ⚠️ **Offene Entscheidung:** nur als Hub wenn Rufnummern-Portabilität (SIM ↔ Nummer) abgebildet werden soll. Sonst → Payload im Satellite.

| Spalte | Typ | PK | Quelle | Beschreibung |
|--------|-----|----|--------|--------------|
| `hk_msisdn` | CHAR(64) | ✅ | Hash(`rufnummer`) | Hash Key |
| `rufnummer` | NVARCHAR(4000) | | services.rufnummer | Business Key (Rufnummer) |
| `dss_business_key` | NVARCHAR | | `CONCAT_WS('||','default','default', rufnummer)` | |
| `dss_load_date` | DATETIME2 | | | |
| `dss_create_datetime` | DATETIME2 | | | |
| `dss_record_source` | NVARCHAR | | | |

**Nicht als Hub modelliert:**
- `tarif` (Freitext-String, instabil) → `ref_tarif_v` Reference Table
- `abo_option_name` → CDK im MA Satellite (keine eigene stabile Identität)
- `id` (CDR-Event) → Transaction Link, nicht Hub (100M+ Hubs wäre Overkill)

---

### 5.2 Satellites

#### `sat_kunde__compax`
Attribute des Kunden aus Compax. Enthält `external_customer_id` für späteren Abacus-Join.

| Spalte | Typ | PK | Payload | Beschreibung |
|--------|-----|----|---------|--------------|
| `hk_kunde` | CHAR(64) | ✅ (Teil 1) | FK | Fremdschlüssel zu hub_kunde |
| `dss_load_date` | DATETIME2 | ✅ (Teil 2) | | Ladezeitpunkt |
| `hd_kunde` | CHAR(64) | | Hash Diff | Änderungserkennung |
| `external_customer_id` | NVARCHAR(4000) | | ✅ | Externe ID (Abacus-Kundennr.?) |
| `dss_create_datetime` | DATETIME2 | | | |
| `dss_record_source` | NVARCHAR | | | |
| `dss_is_current` | CHAR(1) | | | 'Y'/'N' via post_hook |
| `dss_end_date` | DATETIME2 | | | NULL = aktuell, via post_hook |

> **Hash Diff Spalten:** `external_customer_id`

---

#### `sat_vertrag_optionen__compax` *(Multi-Active Satellite)*
Abo-Optionen pro Vertrag. Jeder Vertrag hat 1..n Einträge (Haupt-Abo + Optionen). CDK = `abo_option_name`.

| Spalte | Typ | PK | Rolle | Beschreibung |
|--------|-----|----|-------|--------------|
| `hk_vertrag` | CHAR(64) | ✅ (Teil 1) | FK | Fremdschlüssel zu hub_vertrag |
| `dss_load_date` | DATETIME2 | ✅ (Teil 2) | | Ladezeitpunkt |
| `abo_option_name` | NVARCHAR(4000) | ✅ (Teil 3) | **CDK** | z.B. "Mobile M", "5GB Roaming Zone 2/3" |
| `hd_vertrag_optionen` | CHAR(64) | | Hash Diff | Änderungserkennung |
| `ist_option` | NVARCHAR(4000) | | Payload | 0 = Haupt-Abo, 1 = Zusatzoption |
| `aktivierungs_datum` | NVARCHAR(4000) | | Payload | Aktivierungsdatum der Option |
| `kundigungs_datum` | NVARCHAR(4000) | | Payload | Kündigungsdatum (9999-12-31 = offen) |
| `mlz_datum` | NVARCHAR(4000) | | Payload | Mindestlaufzeit-Ende |
| `dss_create_datetime` | DATETIME2 | | | |
| `dss_record_source` | NVARCHAR | | | |

> **Hash Diff Spalten:** `aktivierungs_datum`, `ist_option`, `kundigungs_datum`, `mlz_datum` (alphabetisch sortiert durch automate_dv)  
> **Haupt-Abo erkennen:** `WHERE ist_option = '0'` — Rufnummer und SIM bleiben beim Haupt-Abo stabil

---

#### `sat_sim__compax` *(optional, vorerst nicht implementiert)*
Aktuell keine zusätzlichen SIM-Attribute in den Quelldaten. Entfällt bis weitere SIM-Stammdaten verfügbar sind.

---

### 5.3 Links

#### `link_vertrag_kunde`
Beziehung zwischen Vertrag und Kunde aus Stammdaten-Datei. Pro Vertrag genau 1 Kunde.

| Spalte | Typ | PK | Beschreibung |
|--------|-----|----|--------------|
| `hk_link_vertrag_kunde` | CHAR(64) | ✅ | Hash(`vertrag_id`, `kunde_id`) |
| `hk_vertrag` | CHAR(64) | | FK → hub_vertrag |
| `hk_kunde` | CHAR(64) | | FK → hub_kunde |
| `dss_load_date` | DATETIME2 | | |
| `dss_record_source` | NVARCHAR | | |

> **Quelle:** `rsn_mobile_services_main`

---

#### `link_vertrag_sim`
Beziehung zwischen Vertrag und SIM-Karte. Ermöglicht SIM-Wechsel-Historie.

| Spalte | Typ | PK | Beschreibung |
|--------|-----|----|--------------|
| `hk_link_vertrag_sim` | CHAR(64) | ✅ | Hash(`vertrag_id`, `icc`) |
| `hk_vertrag` | CHAR(64) | | FK → hub_vertrag |
| `hk_sim` | CHAR(64) | | FK → hub_sim |
| `dss_load_date` | DATETIME2 | | |
| `dss_record_source` | NVARCHAR | | |

> **Quelle:** `rsn_mobile_services_main`

---

#### `link_vertrag_msisdn` *(abhängig von Rufnummer-Hub-Entscheidung)*
Beziehung zwischen Vertrag und Rufnummer. Nur relevant wenn hub_msisdn umgesetzt wird.

| Spalte | Typ | PK | Beschreibung |
|--------|-----|----|--------------|
| `hk_link_vertrag_msisdn` | CHAR(64) | ✅ | Hash(`vertrag_id`, `rufnummer`) |
| `hk_vertrag` | CHAR(64) | | FK → hub_vertrag |
| `hk_msisdn` | CHAR(64) | | FK → hub_msisdn |
| `dss_load_date` | DATETIME2 | | |
| `dss_record_source` | NVARCHAR | | |

> **Quelle:** `rsn_mobile_services_main`

---

#### `link_cdr_event`
Transaction Link für CDR-Ereignisse. Verbindet den Vertrag mit der SIM-Karte pro Event.

| Spalte | Typ | PK | Beschreibung |
|--------|-----|----|--------------|
| `hk_link_cdr_event` | CHAR(64) | ✅ | Hash(`id`, `vertrag_id`, `icc`) |
| `hk_vertrag` | CHAR(64) | | FK → hub_vertrag (via `contract_id` → `vertrag_id`) |
| `hk_sim` | CHAR(64) | | FK → hub_sim (via `iccid` → `icc`) |
| `dss_load_date` | DATETIME2 | | |
| `dss_record_source` | NVARCHAR | | |

> **Quelle:** `rsn_mobile_cdr_main` (PSA-Tabelle)

---

### 5.4 Transaction Satellite (Non-Historized)

#### `sat_cdr_event__compax`
CDR-Events sind **unveränderliche Fakten** — keine Hash Diff, kein SCD2. Einmal geladen, nie geändert.

| Spalte | Typ | PK | Beschreibung |
|--------|-----|----|--------------|
| `hk_link_cdr_event` | CHAR(64) | ✅ (Teil 1) | FK → link_cdr_event |
| `dss_load_date` | DATETIME2 | ✅ (Teil 2) | Ladezeitpunkt |
| `id` | NVARCHAR(4000) | | CDR-Event-ID (Compax intern, ~2.7 Mrd) |
| `signaling_start` | NVARCHAR(4000) | | Beginn Signalisierung |
| `connection_start` | NVARCHAR(4000) | | Verbindungsbeginn |
| `duration` | NVARCHAR(4000) | | Gesprächsdauer (Sekunden) |
| `a` | NVARCHAR(4000) | | A-Rufnummer (Anrufer) |
| `b` | NVARCHAR(4000) | | B-Rufnummer (Angerufener) |
| `pai` | NVARCHAR(4000) | | P-Asserted-Identity |
| `imsi` | NVARCHAR(4000) | | SIM-Netz-ID (228-02 = Sunrise CH) |
| `iccid` | NVARCHAR(4000) | | SIM-Karten-ID (Verifikation) |
| `privacy` | NVARCHAR(4000) | | Datenschutz-Flag |
| `display_name` | NVARCHAR(4000) | | Anzeigename |
| `diversion_reason` | NVARCHAR(4000) | | Umleitungsgrund (FORW-Events) |
| `p_chrg_v` | NVARCHAR(4000) | | P-Charging-Vector |
| `p_ch_o` | NVARCHAR(4000) | | P-Charging-Originating |
| `result_code` | NVARCHAR(4000) | | Ergebniscode |
| `result_status` | NVARCHAR(4000) | | Ergebnisstatus |
| `call_type` | NVARCHAR(4000) | | Anruftyp |
| `record_type` | NVARCHAR(4000) | | MOC / MTC / FORW / DATA / SMS |
| `service_type` | NVARCHAR(4000) | | z.B. "GPR" (Daten), Voice, SMS |
| `bytes_in` | NVARCHAR(4000) | | Empfangene Bytes (**Kernmetrik**) |
| `bytes_out` | NVARCHAR(4000) | | Gesendete Bytes (**Kernmetrik**) |
| `data_packet` | NVARCHAR(4000) | | Datenpaket-Info |
| `r_mcc_mnc` | NVARCHAR(4000) | | Roaming MCC/MNC (leer = national) |
| `price` | NVARCHAR(4000) | | Endkundenpreis |
| `ws_price` | NVARCHAR(4000) | | Wholesale-Preis |
| `tarif` | NVARCHAR(4000) | | Freitext-Tarif (**Mart-Gruppierung**) |
| `tap3` | NVARCHAR(4000) | | TAP3 Roaming-Record-Referenz |
| `dss_create_datetime` | DATETIME2 | | |
| `dss_record_source` | NVARCHAR | | |

> ⚠️ **Kein Hash Diff** — Events ändern sich nie (Non-Historized). Kein `dss_is_current` / `dss_end_date`.  
> **Mart-Metriken:** `bytes_in`, `bytes_out` → GB-Volumen; `duration` → Gesprächsminuten; `price` / `ws_price` → Erlös/Kosten-Vergleich

---

### 5.5 Reference Tables (Lookup)

| Reference | Business Key | Werte-Quelle | Beschreibung |
|-----------|-------------|--------------|--------------|
| `ref_abo_option_v` | `abo_option_name` | Distinct aus services | Normierte Abo/Optionen-Liste (z.B. "Mobile M", "5GB Roaming") |
| `ref_tarif_v` | `tarif` | Distinct aus udrs | Freitext-Tarife normiert (z.B. "Voice MO in National (CH+FL)") |
| `ref_roaming_zone_v` | `mcc_mnc` | Manuell (Seed) | MCC/MNC → Zone-Mapping (CH=national, Zone 1/2/3) |

---

### 5.6 Übersicht: Datenfluss Services → DV-Objekte

```
rsn_mobile_services_main (1 Zeile = 1 Vertrag × 1 Option)
│  Staging aliasiert: vertrags_nummer → vertrag_id, customer_id → kunde_id
│
├─► hub_vertrag        (BK: vertrag_id)
├─► hub_kunde          (BK: kunde_id)
├─► hub_sim            (BK: icc)
├─► hub_msisdn         (BK: rufnummer) ⚠️ optional
│
├─► sat_kunde__compax              → external_customer_id
├─► sat_vertrag_optionen__compax   → CDK: abo_option_name, Payload: ist_option, datum-Felder
│
├─► link_vertrag_kunde    (vertrag_id ↔ kunde_id)
├─► link_vertrag_sim      (vertrag_id ↔ icc)
└─► link_vertrag_msisdn   (vertrag_id ↔ rufnummer) ⚠️ optional
```

### 5.7 Übersicht: Datenfluss CDR Events → DV-Objekte

```
rsn_mobile_cdr_main (PSA, 1 Zeile = 1 CDR-Event)
│  Staging aliasiert: contract_id → vertrag_id, iccid → icc
│
├─► hub_vertrag  (BK: vertrag_id — bereits durch services bekannt)
├─► hub_sim      (BK: icc — bereits durch services bekannt)
│
├─► link_cdr_event    (vertrag_id ↔ icc ↔ id)
└─► sat_cdr_event__compax  → alle Event-Metriken (non-historized)
```

---

## 6. Mart-Schicht

### 6.1 Dimensionen

| Dimension | Quelle | Zweck |
|-----------|--------|-------|
| `dim_mobilvertrag_v` | hub_vertrag + sat_vertrag_optionen__compax | Vertragsperspektive |
| `dim_mobilkunde_v` | hub_kunde + sat_kunde__compax | Kundenperspektive |
| `dim_sim_v` | hub_sim | SIM-Perspektive |
| `dim_tarif_v` | ref_tarif_v | Tarif-Dimension |
| `dim_datum_v` | (bereits vorhanden) | Zeit |

### 6.2 Fakten

| Fakt | Quelle | Grain | Kernmetriken |
|------|--------|-------|-------------|
| `fakt_cdr_v` | sat_cdr_event__compax | 1 Zeile = 1 CDR-Event | bytes_in, bytes_out, duration, price, ws_price |
| `fakt_datenvolumen_v` (aggregiert) | fakt_cdr_v | Vertrag × Tag | gb_total, gb_national, gb_roaming |
| `fakt_anrufe_v` (aggregiert) | fakt_cdr_v | Vertrag × Tag | count_mo, count_mt, duration_total |

### 6.3 Zentrale Business-Metrik (Reporting-Ziel)

Aus Meeting-Prep:
```sql
-- Tarif-Empfehlung: lohnt sich Flat oder Daten-Tarif?
SELECT
    k.customer_id,
    s.abo_option_name,
    SUM(c.bytes_in + c.bytes_out) / 1024.0/1024.0/1024.0 AS total_gb,
    CASE WHEN total_gb > 10 THEN 'Flat lohnt sich' ELSE 'Daten-Tarif' END AS empfehlung
FROM mart.fakt_datenvolumen_v
...
```

---

## 7. Offene Fragen

### Fachlich
- [ ] **customer_id ↔ Abacus:** Ist `external_customer_id` identisch mit Abacus-Kundennummer (PUBL.ADR.ADRESSNR)? → ermöglicht Integration mit `hub_person`
- [ ] **Tarif-Schwellwerte:** Ab welchem GB-Wert welche Empfehlung? (für Mart-Logik)
- [ ] **Auswertungszeitraum:** Monat / Abrechnungsperiode / rollierend 30 Tage?
- [ ] **bytes_in / bytes_out Richtung:** Aus Kundensicht oder Netzwerksicht?
- [ ] **Rufnummer-Portabilität:** Wird MSISDN-Wechsel in services abgebildet? (bei JA → hub_msisdn Pflicht, sonst Payload)

### Technisch
- [ ] **ADLS-Folder umbenennen** (`ewb/cdr/*` → `rsn/mobile/*`)? Jetzt oder später?
- [ ] **dss_record_source Wert** final festlegen: `rsn_compax` oder `compax_mobile`?
- [ ] **Vollständigkeit UDRs:** Gibt es Sequenznummer/Gaps-Erkennung für verpasste Dateien?
- [ ] **Retention:** Wie lange UDRs in PSA halten? (Volumen: ~49M Events/Jahr bei 135k/Tag)

### Projekt
- [ ] **Schulungsprojekt Marco:** Separate Branches / Pair-Programming?
- [ ] **Test-Pipeline `Copy_CRD_Test`:** Wann wird sie produktiv geschedulet?

---

## 8. Umsetzungsschritte (Reihenfolge)

### Phase A — Umbenennung bestehender External Tables
1. External Tables droppen: `stg.ext_ewb_cdr_services`, `stg.ext_ewb_cdr_udrs` (dev + test)
2. `sources.yml`: Beide Einträge umbenennen auf `ext_rsn_mobile_services_main` + `ext_rsn_mobile_cdr_main`
3. `stage_external_sources` redeploy auf dev + test
4. Validieren: SELECT auf neue Namen funktioniert

### Phase B — ADF Pipeline Anpassung
1. `Copy_CRD_Test` umbenennen auf `Copy_RSN_Mobile_Test` (oder separate Pipelines `Copy_RSN_Mobile_Services` + `Copy_RSN_Mobile_CDR`)
2. `dss_record_source` auf `rsn_compax` umstellen
3. Additional Columns prüfen (momentan liefert `dss_record_source` fälschlicherweise den Timestamp — Bug)
4. Neue Testläufe triggern, Parquets validieren

### Phase C — Staging
1. `rsn_mobile_services_main.sql` (View auf External Table via `automate_dv.stage()`)
2. `psa_rsn_mobile_cdr_main.sql` (native Incremental Table)
3. `rsn_mobile_cdr_main.sql` (View auf PSA via `automate_dv.stage()`)
4. `_staging__models.yml` Einträge
5. Entity-Designer JSONs (`rsn_mobile_services_main.json`, `rsn_mobile_cdr_main.json`)
6. Deploy + Tests

### Phase D — Raw Vault
1. Hubs: `hub_vertrag`, `hub_kunde`, `hub_sim`, `hub_msisdn`
2. Reguläre Satellites: `sat_kunde__compax`, `sat_sim__compax`
3. MA-Satellite: `sat_vertrag_optionen__compax`
4. Links: `link_vertrag_kunde_sim_msisdn`, `link_cdr_event`
5. Non-historized Transaction Satellite: `sat_cdr_event__compax`
6. Current Views (`*_current_v`) für alle SCD2-Satellites
7. Reference Tables: `ref_tarif_v`, `ref_abo_option_v`
8. ER-Diagramm aktualisieren (`design/raw-vault/_common/er-diagram.mmd`)

### Phase E — Mart
1. Mart-Schema `mart_mobile` in `dbt_project.yml` konfigurieren
2. Dimensionen: `dim_mobilvertrag_v`, `dim_mobilkunde_v`, `dim_sim_v`, `dim_tarif_v`
3. Basis-Fakt: `fakt_cdr_v`
4. Aggregate: `fakt_datenvolumen_v`, `fakt_anrufe_v`
5. ER-Diagramm Mart (`design/mart/er-mart-mobile.mmd`)
6. Power BI Dashboard-Anbindung

### Phase F (später, out-of-scope)
- Lambda Vault Pattern für Near-Real-Time Reporting
- Festnetz-CDR-Integration (`rsn_festnetz_*`)
- Integration Abacus-Kunden (`hub_person` ↔ `hub_mobilkunde` via external_customer_id)

---

## 9. Abhängigkeiten & Risiken

| Risiko | Auswirkung | Mitigation |
|--------|------------|-----------|
| UDRs-Volumen größer als geschätzt | PSA-Tabelle bläht sich auf | Partitionierung/Archivierung nach 12 Monaten |
| `dss_record_source` Bug in ADF | falsche Metadaten | vor Phase C prüfen + fixen |
| Rufnummer-Portabilität | Hub-Wahl falsch | vor Phase D klären mit Roger |
| `external_customer_id` ≠ Abacus | keine Integration möglich | optional — kein Blocker für MVP |
| ADF-Pipeline noch Test-Only (kein Trigger) | keine neuen Daten | Roger/Marco müssen Trigger konfigurieren |

---

## 10. Erfolgskriterien

- [ ] `ext_rsn_mobile_services_main` + `ext_rsn_mobile_cdr_main` existieren auf dev + test
- [ ] Staging Views deployt, Tests grün
- [ ] Raw Vault komplett modelliert, Tests grün (unique Hash Keys, not null BK)
- [ ] Current Views liefern aktuellen Stammdaten
- [ ] Mart-Metrik "Datenvolumen pro Vertrag/Monat" funktioniert end-to-end
- [ ] Power BI kann auf `mart_mobile.fakt_datenvolumen_v` zugreifen
- [ ] ER-Diagramme aktualisiert
