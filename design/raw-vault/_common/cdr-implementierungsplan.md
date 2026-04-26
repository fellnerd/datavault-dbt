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

### 5.1 Hubs

| Hub | Business Key | Quelle | Source-System(e) | Begründung |
|-----|--------------|--------|------------------|-------------|
| `hub_mobilvertrag` | `vertrags_nummer` / `contract_id` | services + udrs | rsn_compax | Zentrales Objekt — bindet beide Streams |
| `hub_mobilkunde` | `customer_id` | services | rsn_compax | Compax-interne Kunden-ID (Integration mit Abacus-`hub_person` später via `external_customer_id`) |
| `hub_sim` | `icc` / `iccid` | services + udrs | rsn_compax | SIM-Karte; ICCID ist global eindeutig |
| `hub_msisdn` | `rufnummer` | services | rsn_compax | Rufnummer — **separat**, da Portabilität SIM ↔ Nummer möglich |

**Nicht als Hub modelliert** (bewusst verworfen):
- `tarif` (Freitext-String) → Reference Table besser
- `abo_option_name` → Payload im Vertrag-Satellite (keine eigene Identität)

### 5.2 Satellites

| Satellite | Parent Hub | Quelle | Payload |
|-----------|-----------|--------|---------|
| `sat_mobilvertrag__compax` | hub_mobilvertrag | services | abo_option_name, aktivierungs_datum, kundigungs_datum, mlz_datum, ist_option |
| `sat_mobilkunde__compax` | hub_mobilkunde | services | external_customer_id |
| `sat_sim__compax` | hub_sim | services | (optional — Status/Wechsel-Historie) |
| `sat_msisdn__compax` | hub_msisdn | services | (optional) |

⚠️ **Mehrere Abo-Optionen pro Vertrag** (Haupt-Abo + Optionen): Vertrag hat 1..n Einträge in `services` (z.B. "Mobile M" + "5GB Roaming"). → **MA Satellite** (Multi-Active) mit `abo_option_name` als CDK (Child Dependent Key).

→ `sat_ma_mobilvertrag_optionen__compax` mit `cdk: abo_option_name`, Payload: `ist_option`, `aktivierungs_datum`, `kundigungs_datum`, `mlz_datum`

### 5.3 Links

| Link | Verbindung | Quelle |
|------|-----------|--------|
| `link_vertrag_kunde_sim_msisdn` | hub_mobilvertrag ↔ hub_mobilkunde ↔ hub_sim ↔ hub_msisdn | services (1 Zeile = 1 Beziehung) |
| `link_cdr_event` | hub_mobilvertrag ↔ hub_sim (+ optional hub_msisdn für a/b) | udrs |

### 5.4 Transactional (Non-Historized) Satellite für CDR Events

CDR-Events sind **unveränderliche Fakten** (einmal passiert, ändern sich nicht). → **Non-Historized Transactional Link Satellite** (kein Hash Diff, kein SCD2):

`sat_cdr_event__compax` (non-historized) — Parent: `link_cdr_event` oder als eigener Hub mit `id`
- Payload: connection_start, signaling_start, duration, bytes_in, bytes_out, call_type, record_type, service_type, price, ws_price, tarif, r_mcc_mnc, a, b, pai, imsi, data_packet, tap3

**Alternative-Überlegung:** `id` als Hub `hub_cdr_event` (BK = event_id). Überkomplex — jedes Event eigener Hub = 100M+ Hubs. ❌ Besser: Transaction Link-Pattern.

### 5.5 Reference Tables (Lookup)

| Reference | Werte-Quelle |
|-----------|-------------|
| `ref_tarif_v` | Distinct `tarif` aus udrs (Freitext-Normalisierung) |
| `ref_abo_option_v` | Distinct `abo_option_name` aus services |
| `ref_roaming_zone_v` | MCC/MNC → Zone-Mapping (manuell gepflegt, Seed?) |

---

## 6. Mart-Schicht

### 6.1 Dimensionen

| Dimension | Quelle | Zweck |
|-----------|--------|-------|
| `dim_mobilvertrag_v` | hub_mobilvertrag + sat_mobilvertrag__compax | Vertragsperspektive |
| `dim_mobilkunde_v` | hub_mobilkunde + sat_mobilkunde__compax | Kundenperspektive |
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
1. Hubs: `hub_mobilvertrag`, `hub_mobilkunde`, `hub_sim`, `hub_msisdn`
2. Reguläre Satellites: `sat_mobilkunde__compax`, `sat_sim__compax`
3. MA-Satellite: `sat_ma_mobilvertrag_optionen__compax`
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
