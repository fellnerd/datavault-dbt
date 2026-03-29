---
applyTo: '**'
---
# Datahub Confluence Principles (Space: ITDATAH)

> Extrahiert aus dem Confluence Space "Datahub" (ITDATAH) der Kelag.
> Quelle: https://confluence.kelag.at/spaces/ITDATAH
> Autoren: Fischer Helmut, Härb Michael, Raab Michaela
> Stand: März 2026

## 1. ARCHITEKTUR - Schichtenmodell

### Datenfluss
```
Quellsystem → Load (LDS) → Stage (LDS) → Raw Vault (DWH) → Business Vault (DWH) → Stage Hub → DataHub (IMS) → Zielsysteme
```

### Schichten im Detail

| Schicht | DB | Schema | Persistenz | Beschreibung |
|---------|-----|--------|-----------|--------------|
| Load | LOAD | `load`, `ops`, `external_load_source`, `src` | Temporär (vor Beladung gelöscht) | 1:1 Rohdaten aus Quellen |
| Stage | STAGE | `stage` | Temporär (vor Beladung gelöscht) | Hash-Berechnung, Vorbereitung für Vault |
| Raw Vault | VAULT | `raw` | Persistent | Ungefilterte Daten, Hard Rules, Insert-Only |
| Business Vault | VAULT | `business` | Persistent + Virtuell | Soft Rules, Business Logik |
| Reference | VAULT | `ref` | Persistent | Referenztabellen (Hub + Sat) |
| Stage Hub | STAGE_HUB | `stage` | Temporär | Vorbereitung für DataHub |
| DataHub/IMS | DATAHUB | `{business_concept}` | Persistent + Virtuell | Dimensionale Modellierung für Reporting |

## 2. DATA VAULT 2.0 - Entitäten

### 2.1 Hub
- Repräsentiert ein **Geschäftsobjekt** (reportingrelevant)
- Enthält **nur Business Keys** (unveränderlich) + Hash Key
- Semantisch gleiche Inhalte aus verschiedenen Vorsystemen gehören in denselben Hub
- Natural Key als Business Key verwenden (muss Record eindeutig identifizieren)
- Hub ist **Tenant-übergreifend**
- Im Raw Vault: **keine Umformung** von Geschäftsentitäten (z.B. Party nicht aufsplittten)

**Aufbau:**
```
hk_{hub}                    -- Hash Key (CHAR(64), SHA2_256)
business_key_1              -- Business Key Spalte(n)
...
business_key_n
[technische Attribute]      -- siehe Namenskonventionen
```

### 2.2 Link
- Beschreibt **Beziehungen** zwischen Geschäftsobjekten
- Verbindet mindestens 2 Hubs (keine "peg-leg links")
- Immer **n:m Beziehungen** (flexibel erweiterbar)
- Keine Links zwischen Links
- Optional: **Dependent Child** zur Erweiterung der Beziehung (z.B. Transaktions-ID, Art der Beziehung)

**Aufbau:**
```
hk_{link}                   -- Link Hash Key
hk_{hub_1}                  -- FK zum Hub 1
...
hk_{hub_n}                  -- FK zum Hub n
[dependent_child_columns]   -- Optional
[technische Attribute]
```

**Link-Typen:**
- **Same-as Link**: Verknüpft gleiche Geschäftsobjekte (z.B. Mapping von Keys)
- **Hierarchy Link**: Parent-Child Beziehung innerhalb eines Hubs
- **Business Link**: Wie Raw Link, aber mit Business Rules

### 2.3 Satellit
- Enthält **beschreibende Attribute** + deren Historie
- Immer an genau **einem Hub oder Link** angehängt
- Pro Hash Key immer nur **ein zeitlich gültiger Satz**
- Ein Hub/Link kann **mehrere Satelliten** haben

**Aufbau:**
```
hk_{hub} oder hk_{link}     -- FK zum Hub/Link
[data_columns]               -- Alle Attribute (ohne Business Keys)
[technische Attribute]
```

**Satelliten-Typen:**

| Typ | Beschreibung | Besonderheit |
|-----|-------------|--------------|
| **Standard Sat** | Roher Satellit, keine Logik | Basis für Business Sat |
| **Business Sat** | Erweitert Raw Sat mit Softlogik | Gleiche Laderoutine + Business Rules |
| **Dependent Child Sat** | PK erweitert um DC-Attribute | DC-Attribute dürfen nicht NULL sein |
| **Multi-Active Sat** | Mehrere gültige Records pro BK | Sequenznummer als MA-Key |
| **Status Tracking Sat** | Trackt CDC (I/U/D) | Braucht Full Load aus Vorsystem |
| **Record Tracking Sat** | Trackt letzte Beladung pro BK | Ersatz für "last_seen_date" |
| **Effectivity Sat** | Trackt Gültigkeit von Beziehungen | Nur als Child von Link/Sat |
| **Extended Record Tracking** | Vollständiger Datenabzug je Beladung | Für Zeitkorrektur (Late Arriving Data) |

### 2.4 Referenztabellen
- Schlüssel-Wert-Tabellen (z.B. Ländercodes)
- Modelliert als **Hub + Satellit** (Code als BK, Werte im Sat)
- Alle Änderungen werden historisiert
- In Load, Stage und Vault (`ref` Schema) vorhanden

### 2.5 PIT (Point in Time) Tabelle
- Performance-optimierte Snapshots zu bestimmten Zeitpunkten
- Liest Historie der Satelliten für einen Zeitpunkt
- Basis für **Dimensionen** im DataHub

### 2.6 Bridge Tabelle
- Löst Beziehungen über **mehrere Links** hinweg auf
- Snapshots analog zu PIT
- Basis für **Faktentabellen** im DataHub

## 3. BUSINESS KEYS

### Bildung
```
dss_tenant_key || dss_business_key_ccode || business_key_column_1 || ... || business_key_column_n
```
Beispiel: `default||default||A385jf||Jidkjgj||-1`

### Cleaning (nur in Berechnung, nicht persistent)
- **LOWER()** - Kleinschreibung
- **TRIM()** - Führende/nachfolgende Leerzeichen entfernen
- Sonderzeichen entfernen: Tab, LF, FF, CR (ASCII 10-13)
- NULL → Zero Key **"-1"**
- Trennzeichen `||` wird mit `\` escaped wenn es in Quelldaten vorkommt

### Reihenfolge
- Business Key Columns: **alphabetisch sortiert**
- Ausnahme: Unterschiedliche Spaltennamen in verschiedenen Quellsystemen → harmonisieren

### Case-Sensitive Business Keys
```sql
CONCAT(BK, '_', SUBSTRING(CONVERT(NCHAR(64), HASHBYTES('SHA2_256', BK), 2), 1, 10))
```
- Originaler BK kommt in den Satelliten, angepasster BK in den Hub

## 4. HASHING

### Algorithmus
- **SHA2_256** (Standard)
- Trennzeichen: **`||`** (doppelte Pipe)
- LTRIM() + RTRIM() auf alle Spalten
- **CONVERT** verwenden (nicht CAST) - wegen datetime/float Truncation
- NULL → **"-1"** (unterscheidbar von leerem String)
- Output: **CHAR(64)** für Lesbarkeit

### Change Hash (dss_change_hash)
- Beinhaltet alle relevanten Business-Attribute
- **Keine** technischen Attribute des Vorsystems (z.B. UNAME)
- Bei Delta Load: Delta-Kriterium **nicht** im Hash
- In der Stage: Name des Satelliten anhängen → `dss_change_hash_{satellite}`

## 5. NAMENSKONVENTIONEN

### Trennzeichen
- **`||`** als Sanding Value (doppelte Pipe)

### Objektnamen
- **Underscores** `_` als Separator
- Doppelte Underscores `__` bedeuten Interpretation/Schritte
- **Kleinbuchstaben** im SQL Server
- **Singular** (z.B. `hub_kunde` nicht `hub_kunden`)

### Entitäten-Naming

| Typ | Muster | Beispiel |
|-----|--------|---------|
| Hub | `hub_{business_concept}_{bk_space}` | `hub_mitarbeiter` |
| Reference Hub | `hub_ref_{business_concept}_{bk_space}` | `hub_ref_land` |
| Link | `link_{hub}_{hub}_{bk_space}` | `link_mitarbeiter_organisationseinheit` |
| Hierarchy Link | `link_{hub}_hierarchy` | `link_organisationseinheit_hierarchy` |
| Satellite | `sat_{hub}__{partner/system}` | `sat_mitarbeiter__sap_hcm` |
| DC Satellite | `sat_{hub}__{system}__dc` | `sat_mitarbeiter__sap_hcm__dc` |
| MA Satellite | `sat_{hub}__{system}__ma` | `sat_mitarbeiter__sap_hcm__ma` |
| Link Satellite | `sat_link_{link}__{system}` | `sat_link_mitarbeiter_org__sap_hcm` |
| Eff Satellite | `sat_{link}__{system}_eff` | `sat_link_mitarbeiter__sap_hcm_eff` |
| PIT | `pit_{hub/link}` | `pit_mitarbeiter` |
| Bridge | `bridge_{content}` | `bridge_mitarbeiter` |
| Dimension | `dim_{dimension}_{area}` | `dim_mitarbeiter` |
| Fakt | `fakt_{content}_{area}` | `fakt_mitarbeiter` |
| Flat Table | `{content}` | `mitarbeiter_export` |
| Current View | `{object}_current_v` | `sat_mitarbeiter_current_v` |
| Load | `load_{partner/system}_{table}__{tenant}__{version}` | `load_sap_hcm_hrp1000__200` |
| Stage | `stage_{object}__{step_id}_{step_name}` | `stage_mitarbeiter__01_hash` |

### Satellite-Trennung nach:
1. **Datenherkunft** (verschiedene Quellsysteme → verschiedene Satelliten)
2. **Änderungshäufigkeit** (low=Stammdaten, high=Transaktionsdaten)
3. **Fachliche Trennung** (inhaltlich zusammengehörige Attribute)
4. **Sensible Daten** (GDPR → eigener Satellit)
5. **Technische Gründe** (Tabelle zu breit)
6. **>100 Spalten** → inhaltliche Trennung

## 6. TECHNISCHE ATTRIBUTE (dss_*)

| Attribut | Typ | Beschreibung |
|----------|-----|-------------|
| `hk_{hub}` | char(64) | Hub Hash Key |
| `hk_{link}` | char(64) | Link Hash Key |
| `dss_tenant_key` | varchar(255) | Mandant ("default" falls keiner) |
| `dss_business_key_ccode` | varchar(255) | Business Key Collision Code ("default" falls keine) |
| `dss_business_key` | nvarchar(255) | Konkatenierter Business Key |
| `dss_record_source` | nvarchar(255) | `{source_name}.{db}.{schema}.{table}` |
| `dss_load_datetime` | datetime | Timestamp Beladung in LOAD |
| `dss_start_datetime` | datetime | Gültig ab (= dss_load_datetime im Vault) |
| `dss_end_datetime` | datetime2 | Gültig bis (Nachfolger minus 100ns, Current: 9999-12-31) |
| `dss_is_current` | char(1) | "Y" für aktuellen Record, "N" für andere |
| `dss_version` | integer | Version pro Business Key (ab 1) |
| `dss_change_hash_{sat}` | char(64) | Change Hash für Deltaerkennung |
| `dss_cdc` | char(1) | Change Data Capture: I/U/D |
| `dss_deleted` | char(1) | "Y" wenn physisch gelöscht im Quellsystem |
| `dss_job_sequence_key` | integer | Job-Instanz der Beladung |
| `dss_create_datetime` | datetime | Timestamp Erstellung in Zieltabelle |
| `dss_update_datetime` | datetime | Timestamp letzte Änderung |
| `dss_sec_value_key` | nvarchar(255) | RLS-Wert (Mandant_OrgId), "-1" wenn kein RLS |
| `dss_load_comment` | varchar(255) | NULL/condensed/corrected |

## 7. GHOST RECORDS

Jeder Satellit und jede Dimension enthält Ghost Records mit Default-Werten:

| Datentyp | Default |
|----------|---------|
| HK | "-1" |
| String | "-1" (falls Länge < 2: NULL) |
| Char | "-1" (falls Länge < 2: NULL) |
| Date | 1753-01-01 |
| DateTime | 1753-01-01T00:00:00.000000 |
| Time | 00:00:00.000000 |
| Integer | -1 |
| Bit | 0 |
| nvarchar(1) + DC Attribut | # |

**Ghost Record dss-Attribute:**
- `dss_tenant_key` = 'default'
- `dss_business_key_ccode` = 'default'
- `dss_business_key` = 'default||default||unknown'
- `dss_record_source` = 'ghost_record'
- `dss_start_datetime` = '1753-01-01 00:00:00.000'
- `dss_deleted` = 'N'
- `dss_load_comment` = NULL

### Zero Keys
- Für fehlende Business Keys (NULL → Zero Key mit Default-Werten)
- Jeder Hub enthält einen Zero Key
- Verwendung: Wenn FK in Link-Beziehung NULL ist

## 8. HISTORISIERUNG

### Zeitdimensionen
1. **Fachlich (1d)**: Wann ist etwas fachlich gültig (aus Quellsystem)
2. **Technisch Vorsystem (2d)**: Wann wurde der Record im Vorsystem angelegt/geändert
3. **Technisch DWH (3d)**: Wann wurde der Record in den Datahub geladen

### Im Data Vault (Insert-Only)
- Nur `dss_start_datetime` wird gespeichert (= dss_load_datetime)
- `dss_end_datetime` wird **nicht** persistiert, nur via View ermittelt
- **Keine Update-Operationen** im Raw Vault

### Im DataHub (IMS)
- **SCD1**: Überschreiben bei Änderungen (kein History)
- **SCD2**: Vollständige Historisierung mit Start/End Timestamps
- **Bitemporal**: Fachliche + technische Historisierung gleichzeitig

### Effectivity Satellit
- `dss_start_datetime`: Startzeitpunkt aus Vorsystem
- `dss_end_datetime`: Endzeitpunkt aus Vorsystem

## 9. BELADUNGSSTRATEGIEN

### Full Load
- Gesamtabzug → Delta-Ermittlung via BK-Vergleich + Hashdiff
- Hash-Vergleich statt Einzelattribut-Vergleich

### Delta Load
- Nur geänderte/neue Records
- Steuerung via `load_ctrl` Tabelle (Low/High Watermark)
- Delta-Kriterium: Änderungs-Timestamp, ID oder String

### Full-Delta Load
- Eingeschränkter Full Load mit dauerhaftem Filter
- `ext_load_data_set_type = FULL DELTA`

### Keyless Load
- Kein eindeutiger Key (z.B. Logdaten)
- Bei Reload: Alle Records des Batch als inaktiv setzen, dann neu einfügen

## 10. HARD RULES vs. SOFT RULES

### Hard Rules (Raw Vault)
- Verändern **nicht** den Inhalt der Daten
- Leer-Strings → NULL
- Datentyp-Vereinheitlichung
- Datumsformat-Standardisierung
- Zeitzonen-Vereinheitlichung
- LTRIM/RTRIM

### Soft Rules (Business Vault)
- **Verändern** oder interpretieren Daten
- Berechnungen, Aggregationen
- Adress-Standardisierung
- Werte ersetzen/zusammenführen
- Fachliche Gültigkeiten auflösen
- Konsolidierung

## 11. SOURCE SYSTEMS

| Key | System |
|-----|--------|
| `sap_hcm` | SAP HCM Modul |
| `sap_crm` | SAP CRM Modul |
| `sap_common` | SAP Allgemein |
| `sap_co` | SAP Controlling |
| `sap_isu` | SAP ISU |
| `sap_eam` | SAP EAM |
| `sap_mm` | SAP Materialwirtschaft |
| `sap_ca` | SAP ZCA Erlöse |
| `jira` | Jira |
| `iss` | ISS Kundenportal |
| `metric` | Metrik/Event-Daten |
| `xeox` | AD-User/Gruppen |
| `manual` | Zip/manuelle Daten |
| `powerplant` | Kraftwerksdaten |

## 12. BUSINESS CONCEPTS

| Key | Bereich |
|-----|---------|
| `datahub` | Allgemeine/Common Objekte |
| `hcm` | HR Daten |
| `crm` | Kundendaten |
| `isu` | Online VertragsAbschluss |
| `jira` | Jira |
| `meta` | Metadaten |
| `weather` | Wetter/Klimadaten |
| `powerplant` | Kraftwerksdaten |
| `coar` | Controlling Auftragsabrechnung |
| `energy_industry` | Energy Industry |
| `em` | Energy Management |
| `orga` | Organisation |

## 13. DATAHUB (IMS) - DIMENSIONALE MODELLIERUNG

### Grundsätze
- **Dimensionale Modellierung** (Kimball) bevorzugt
- **Virtualisierung** (Views) vor Persistierung
- PIT-Tabellen als Basis für **Dimensionen**
- Bridge-Tabellen als Basis für **Faktentabellen**
- Ghost Records werden im DataHub **neu erzeugt** (nicht aus Vault übernommen)

### Dimensionen
- Mandatory Spalten: `{dim}_key`, `{dim}_id`, `{dim}_code`, `{dim}_name`
- `{dim}_id`: Technische/fachliche ID aus Vorsystem (nvarchar(255))
- `{dim}_code`: Sprechender Business-Schlüssel (nvarchar(255)), Fallback = ID
- `{dim}_name`: Bekannte Bezeichnung (nvarchar(255)), Fallback = CODE
- NULL bei CODE → 'UNKNOWN', NULL bei NAME → 'UNKNOWN'

### Dimension Ghost Record
- `{dim}_key` = '-1'
- `{dim}_id` = '-1'
- `{dim}_code` = 'UNKNOWN'
- `{dim}_name` = 'UNKNOWN'
- `dss_sec_value_key` = 'ghost_record'

### Snowflaking (Dimension-Relationships)
- Referenzierte Dimension darf **nicht die Granularität** der Hauptdimension ändern
- Nur 0:n, 1:n, 1:1 Beziehungen erlaubt
- **3 Pflicht-Spalten**: BK (HK), `{dim}_id`, `{dim}_code` der referenzierten Dimension
- Nicht auflösbare Beziehung: HK='-1', ID='-1', CODE='UNKNOWN'

## 14. MODELLIERUNGSRICHTLINIEN

### Hub-Ermittlung
1. Geschäftsobjekte + Business Keys identifizieren (Natural Keys bevorzugen)
2. Abstimmung mit Architektenteam (neue Hubs vs. bestehende)
3. Semantische Gleichheit prüfen (kein super/sub typing)
4. BK Reihenfolge bei existierenden Hubs beachten
5. Business Key Collision Code Bedarf prüfen

### Link-Modellierung
1. Beziehungen im Vorsystem identifizieren (SME hinzuziehen)
2. Kardinalität feststellen
3. NULL Business Keys → Zero Key
4. Dependent Child Keys bei Bedarf
5. Mindestens 2 Geschäftsobjekte im Link
6. Keine Link-on-Link Strukturen
7. Wenn weniger Objekte im Reporting nötig → DISTINCT statt neuer Link

### Satellit-Design
- **Alle non-BK Attribute** in Satellit laden
- BK in Satelliten aus Performance-Gründen OK
- Bei non-comparable Datentypen (geography, xml, etc.): **ROW_NUMBER()** statt DISTINCT
- Keine Attribute beim `dss_change_hash` ausschließen

## 15. MAPPING ZU DIESEM dbt-PROJEKT

> Die folgenden Mappings zeigen, wie Confluence-Prinzipien auf unser dbt-Projekt übertragen werden.

| Confluence (Wherescape) | dbt-Projekt | Status | Anmerkung |
|------------------------|-------------|--------|-----------|
| LOAD.load.* | `source()` in sources.yml | ✅ | Quelle direkt als External Table |
| STAGE.stage.* | `models/staging/*.sql` | ✅ | Hash-Berechnung als View |
| VAULT.raw.hub_* | `models/raw_vault/{concept}/hubs/` | ✅ | Schema: `vault_{concept}` |
| VAULT.raw.sat_* | `models/raw_vault/{concept}/satellites/` | ✅ | Schema: `vault_{concept}` |
| VAULT.raw.link_* | `models/raw_vault/{concept}/links/` | ⬜ | Noch kein Link implementiert |
| VAULT.business.* | `models/business_vault/` | ⬜ | Schema: `vault` (Views) |
| VAULT.ref.ref_* | `models/raw_vault/_common/` | ⬜ | Schema: `vault` |
| DATAHUB.{concept}.dim_* | `models/mart/{concept}/` | ⬜ | Schema: `mart_{concept}` |
| DATAHUB.{concept}.fakt_* | `models/mart/{concept}/` | ⬜ | Schema: `mart_{concept}` |

### Technische Attribute (dss_*) Mapping

| Confluence Attribut | dbt-Projekt | Status | Anmerkung |
|---------------------|-------------|--------|-----------|
| `hk_{hub}` / `hk_{link}` | `hk_{entity}` | ✅ | SHA2_256, CHAR(64), via hash_override.sql |
| `dss_change_hash_{sat}` | `hd_{entity}` → HASHDIFF | ✅ | Hash Diff (Projekt-Konvention) |
| `dss_record_source` | `dss_record_source` | ✅ | Format: `{source}.{db}.{schema}.{table}` |
| `dss_load_datetime` | `dss_load_date` | ✅ | Vereinfacht (= dss_start_datetime) |
| `dss_business_key` | `dss_business_key` | ✅ | `default\|\|default\|\|BK1\|\|...BKn` (Staging + Hub) |
| `dss_create_datetime` | `dss_create_datetime` | ✅ | GETDATE() (Staging + Hub + Sat payload) |
| `dss_end_datetime` | Berechnet via View | ✅ | `sat_*_current_v` Views (Confluence §8) |
| `dss_is_current` | Berechnet via View | ✅ | `sat_*_current_v` Views |
| `dss_tenant_key` | Nicht verwendet | ⬜ | Single-Tenant PoC |
| `dss_business_key_ccode` | Nicht verwendet | ⬜ | Single-Source PoC |
| `dss_version` | Nicht implementiert | ⬜ | Kann via View berechnet werden |
| `dss_cdc` | Nicht implementiert | ⬜ | Status Tracking Sat nötig |
| `dss_deleted` | Nicht implementiert | ⬜ | Status Tracking Sat nötig |
| `dss_job_sequence_key` | `dss_run_id` | ⬜ | Optional in Views |
| `dss_update_datetime` | Nicht verwendet | ⬜ | Raw Vault = Insert-Only |
| `dss_sec_value_key` | Nicht implementiert | ⬜ | Kein RLS im PoC |
| `dss_load_comment` | Nicht implementiert | ⬜ | Kein condensed/corrected Load |
| **Hashing Separator `\|\|`** | **`\|\|`** | ✅ | Gleich (automate_dv default) |
| **Hash Algorithmus SHA256** | **SHA2_256** | ✅ | Gleich |
| **NULL → '-1'** | **`null_placeholder_string: '-1'`** | ✅ | Konfiguriert in dbt_project.yml |
| **LTRIM + RTRIM** | **hash_override.sql** | ✅ | Auf alle Hash-Spalten |
| **BK-Sortierung alphabetisch** | **alphabetisch** | ✅ | automate_dv sortiert automatisch |

### Implementierungsdetails

| Feature | Umsetzung | Datei |
|---------|-----------|-------|
| Hub mit dss_business_key | automate_dv.hub() mit src_extra_columns | `hub_catsco.sql` |
| Satellite | automate_dv.sat() mit dss_create_datetime via src_extra_columns | `sat_catsco__sap_co.sql` |
| Current View | satellite_current_view() Macro | `sat_catsco__sap_co_current_v.sql` |
| Ghost Records | ghost_records.sql Macro (noch nicht aktiviert) | `macros/ghost_records.sql` |
| Hash Override | CONVERT + HASHBYTES + CONCAT_WS, NULL→'-1', LTRIM/RTRIM | `macros/hash_override.sql` |

### Abweichungen vom Confluence-Standard (PoC-bedingt)
1. **Kein dss_tenant_key** - Single-Tenant PoC, bei Multi-Tenant nachziehen
2. **Kein dss_business_key_ccode** - Nur eine Quelle pro Hub im PoC
3. **Kein dss_deleted Tracking** - Status Tracking Sat noch nicht implementiert
4. **Ghost Records nur als Macro** - Noch nicht per post_hook aktiviert
5. **Keine PIT/Bridge** - Noch nicht implementiert für DataHub Layer
6. **BK Cleaning (LOWER/TRIM)** - hash_override.sql macht LTRIM/RTRIM; Confluence LOWER() vs. automate_dv UPPER() → mit Datahub-Team abstimmen
7. **Kein dss_version** - Kann via ROW_NUMBER() in Views berechnet werden

### WICHTIG: BK Cleaning Unterschied
Confluence definiert **LOWER()** für Business Keys, automate_dv verwendet **UPPER()** (`hash_content_casing: upper`).
Für Konsistenz mit dem bestehenden Datahub muss dies ggf. angepasst werden:
```yaml
# In dbt_project.yml vars:
vars:
  hash_content_casing: 'disabled'  # oder custom macro für LOWER
```

## 16. CONFLUENCE-QUELLEN

| Seite | Page ID | Inhalt |
|-------|---------|--------|
| Data Vault | 353075860 | DV 2.0 Entitäten, Schichten, Objekte |
| Namenskonventionen | 353075852 | Naming, technische Attribute, Source Systems |
| Design und Entwicklungsrichtlinien | 353075862 | Beladung, Hashing, Modellierung |
| Zielarchitektur Datahub | 353075846 | Schichtenmodell, IMS, Zielsysteme |
| Historisierung | 353075874 | Temporal, SCD1/SCD2, Bitemporal |
| Versionierung | 353075866 | Git-Flow, Wherescape, BitBucket |
