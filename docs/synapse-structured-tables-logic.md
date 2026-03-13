# Synapse `structured-tables` — Extracted Business Logic

> **Extracted from**: ADF `analytics-datafactory001` pipelines `Finance`, `Projekt`, `Manual Data landingzone`
> **Container**: `analyticsstoraccount001/structured-tables`
> **Orchestrator**: Pipeline `structured-tables Daily` (runs Finance + Projekt + Manual Data → PowerBI Refresh)
> **Extraction date**: 2025-07-22

---

## Overview

The `structured-tables` container holds **13 Parquet files** organized in 2 top-level folders, produced by 3 ADF pipelines. These are **denormalized business views** built from raw Abacus tables in Synapse SQL Pool (landing zone), plus Sharepoint reference data.

### Container Structure
```
structured-tables/
├── Finance/
│   ├── ActualForecast/Main.parquet    ← Sharepoint (direct copy)
│   ├── Belege/Main.parquet            ← SQL: KRED.KBL + KRED.KVL
│   ├── Buchungen/Main.parquet         ← SQL: FIBU.GL (complex 4-way UNION)
│   ├── Budget/Main.parquet            ← Sharepoint (direct copy)
│   ├── Forecast/Main.parquet          ← Sharepoint (direct copy)
│   ├── Konten/Main.parquet            ← Sharepoint (direct copy)
│   ├── Kostenstellen/Main.parquet     ← Sharepoint (direct copy)
│   ├── Kunden/Main.parquet            ← SQL: KRED.KBL (denorm)
│   └── Zugangsrechte/Main.parquet     ← Sharepoint (direct copy)
└── Projekt/
    ├── Abteilung/Main.parquet         ← SQL: LOHN.LEN + LOHN.LTC
    ├── Personal/Main.parquet          ← SQL: PUBL.ADR + LOHN.LEN
    ├── Projekt/Main.parquet           ← SQL: PROJ.NPO + PROJ.PST + Sharepoint×3
    └── Stunden/Main.parquet           ← SQL: PROJ.NSA + PROJ.NTR + PUBL.ADR
```

### Pipeline Architecture
```
structured-tables Daily
├── Finance (pipeline)         ← 3 Copy activities with SQL queries
├── Projekt (pipeline)         ← 4 Copy activities with SQL queries
├── Manual Data landingzone    ← 6 Copy activities (Sharepoint → Parquet, no transform)
└── PowerBI Refresh            ← WebHook (after all 3 succeed)
```

---

## 1. Finance/Buchungen (COMPLEX — Most Important)

**Source Table**: `[FIBU].[GL]` (Hauptbuch / General Ledger)
**Type**: 4-way `UNION ALL` with sign-flipping logic

### Business Logic Summary
Creates a **symmetrical double-entry bookkeeping view** of GL entries. Each row is split into Soll (debit) and Haben (credit) perspectives, with amounts sign-corrected and Konto/Gegenkonto swapped depending on perspective.

### Source Tables
| Alias | Table | Description |
|-------|-------|-------------|
| — | `[FIBU].[GL]` | General Ledger entries (Hauptbuch-Journale, maps to `FIBU.GL.E22–E26.parquet`) |

### Filter Conditions (all 4 parts)
- `[SAM] <> '#'` — Exclude system/placeholder entries (Sammelbuchungen)
- `[KST] NOT IN (2990, 3990, 4990, 5990, 6990, 7990)` — Exclude consolidation cost centers
- `[KTO] > 30000 AND [KTO] < 90000` — Only P&L accounts (Erfolgsrechnung), excludes balance sheet

### The 4 UNION Parts (Sign Logic)

| # | SH | Perspective | Betrag Sign | KostenstelleNr | KontoNr |
|---|-----|------------|-------------|-----------------|---------|
| 1 | `S` (Soll) | Direct (KTO) | **Negative** (with MWST adjustment) | `KST` | `KTO` |
| 2 | `S` (Soll) | Counter (GKTO) | **Positive** | `KST2` | `GKTO` |
| 3 | `H` (Haben) | Direct (KTO) | **Positive** | `KST` | `KTO` |
| 4 | `H` (Haben) | Counter (GKTO) | **Negative** | `KST2` | `GKTO` |

### MWST (VAT) Adjustment
```sql
CASE WHEN [MWSTTYP] = '5' OR [MWSTINCL] = 'E'
    THEN [BETRAG]                  -- Net amount (VAT already separated or inclusive type E)
    ELSE ([BETRAG] + [MWSTBETR])   -- Gross = Net + VAT amount
END
```
- `MWSTTYP = '5'`: Special VAT type (Vorsteuer / input tax)
- `MWSTINCL = 'E'`: VAT-inclusive amount

### Output Columns
| Output Column | Source Column | Type | Description |
|--------------|--------------|------|-------------|
| `Datum` | `DATE` | `date` | Booking date |
| `Betrag` | `BETRAG + MWSTBETR` | `float` | Amount (sign-adjusted, see logic above) |
| `Soll-Haben` | `SH` | `varchar(10)` | Debit/Credit indicator |
| `SAM` | `SAM` | `varchar(200)` | Sammelbuchung (batch booking code) |
| `KostenstelleNr` | `KST` or `KST2` | `int` | Cost center (swapped per perspective) |
| `KostenstelleNr-Gegen` | `KST2` or `KST` | `int` | Counter cost center |
| `KontoNr` | `KTO` or `GKTO` | `int` | Account number (swapped per perspective) |
| `KontoNr-Gegen` | `GKTO` or `KTO` | `int` | Counter account |
| `ProjektNr` | `PROJEBENE` | `int` | Project number |
| `Mwst-Betrag` | `MWSTBETR` | `float` | VAT amount |
| `Mwst-Typ` | `MWSTTYP` | `varchar(200)` | VAT type code |
| `Mwst-Code` | `MWSTCODE` | `varchar(200)` | VAT code |
| `Mwst-Incl` | `MWSTINCL` | `varchar(200)` | VAT inclusive flag |
| `Mwst-Satz` | `MWSTSATZ` | `float` | VAT rate |
| `Umschreibung` | `TEXT` | `varchar(500)` | Description line 1 |
| `Umschreibung2` | `TEXT2` | `varchar(500)` | Description line 2 |
| `Kundennummer` | `DKKUNDENNUMMER` | `int` | Customer number (from DK module) |
| `Belegnummer` | `DKBELEGNUMMER` | `int` | Document number |

### DV Implication
This view is a **Business Vault transformation** — it transforms raw GL data with sign logic and perspective swapping. In Data Vault:
- Raw data stays in `FIBU.GL` staging → Hub/Sat
- This Buchungen logic belongs in a **Business Vault / Mart view** that applies the sign-flipping and UNION logic on top of the raw vault

---

## 2. Finance/Belege

**Source Tables**: `[KRED].[KBL]` (Kreditorenbelege) + `[KRED].[KVL]` (Kreditorenzahlungen)
**Type**: Simple LEFT JOIN

### SQL
```sql
SELECT
    CAST([BELNR] as int) AS [Belegnummer],
    CAST([KNR] as int) AS [Kundennummer],
    CAST([BEMERK] as varchar(200)) AS [Umschreibung3],
    CAST([ABACUS_USR_NAME] as varchar(200)) AS [Visierende-ID],
    CAST([ABACUS_USR_FULL_NAME] as varchar(200)) AS [Visierende],
    T1.[timestamp_landing-zone] AS [timestamp_landing-zone_KRED_KBL],
    T2.[timestamp_landing-zone] AS [timestamp_landing-zone_KRED_KVL]
FROM [KRED].[KBL] T1
LEFT OUTER JOIN [KRED].[KVL] T2 ON T1.[BELNR] = T2.[DOCUMENTNR]
```

### Business Logic
- Main: `KRED.KBL` (creditor documents / invoices)
- JOIN: `KRED.KVL` (creditor payments) on `BELNR = DOCUMENTNR`
- Enriches documents with approval user info (`ABACUS_USR_NAME`, `ABACUS_USR_FULL_NAME`)
- **Note**: No WHERE filter — all creditor documents included

### DV Implication
- `KRED.KBL` → Hub + Satellite (BK: BELNR)
- `KRED.KVL` → Link to documents (via DOCUMENTNR)
- The join is a **natural Link relationship** in DV

---

## 3. Finance/Kunden

**Source Table**: `[KRED].[KBL]` (Kreditorenbelege)
**Type**: Simple SELECT (no JOIN)

### SQL
```sql
SELECT
    CAST([KNR] as int) AS [Kundennummer],
    CAST([ADRID] as varchar(200)) AS [Kundenname],
    T1.[timestamp_landing-zone] AS [timestamp_landing-zone_KRED_KBL]
FROM [KRED].[KBL] T1
```

### Business Logic
- Extracts distinct customer info from creditor documents
- **Warning**: No `DISTINCT` — will have duplicates! This is denormalized at source
- Maps `KNR` → Kundennummer, `ADRID` → Kundenname

### DV Implication
- This is **not a proper master data source** — it extracts customer info from transactional data
- In DV: Customer info should come from `PUBL.ADR` (address master) or a dedicated customer table
- This view is useful for **validation** but not as a primary source

---

## 4. Projekt/Personal

**Source Tables**: `[PUBL].[ADR]` (Adressstamm) + `[LOHN].[LEN]` (Lohnempfänger/Mitarbeiterstamm)
**Type**: LEFT JOIN with deduplication subquery

### SQL
```sql
SELECT
    CAST(T1.[LOHNNR] as int) AS [PersonalNr],
    T1.[NAME] AS [Name],
    T1.[VORNAME] AS [Vorname],
    T2.[ABRV] AS [Initialen],
    T1.[timestamp_landing-zone] AS [timestamp_landing-zone_PUBL_ADR],
    T2.[timestamp_landing-zone] AS [timestamp_landing-zone_LOHN_LEN]
FROM [PUBL].[ADR] T1
LEFT OUTER JOIN (
    SELECT [EMPL_NR], [ABRV], [timestamp_landing-zone]
    FROM (
        SELECT [EMPL_NR], [ABRV],
            COUNT([ABRV]) OVER (PARTITION BY [EMPL_NR] ORDER BY [ABRV]) AS [Check],
            [timestamp_landing-zone]
        FROM (
            SELECT DISTINCT [EMPL_NR], [ABRV], [timestamp_landing-zone]
            FROM [LOHN].[LEN]
            WHERE LEN([ABRV]) > 0
        ) T1
    ) T1
    WHERE [Check] = 1
) T2 ON T1.[LOHNNR] = T2.[EMPL_NR]
WHERE T1.[LOHNJN] = '1'          -- Is a salary recipient
    AND T1.[GESPERRT] = '0'      -- Not blocked/deactivated
    AND T1.[LOHNNR] <> 0         -- Has a valid personnel number
```

### Business Logic
- **Main**: `PUBL.ADR` = Address master (all persons)
- **Filter**: Only active employees (`LOHNJN=1`, `GESPERRT=0`, `LOHNNR≠0`)
- **JOIN**: `LOHN.LEN` for initials (`ABRV`), with 3-level deduplication:
  1. `SELECT DISTINCT` to remove exact duplicates
  2. `COUNT() OVER (PARTITION BY EMPL_NR ORDER BY ABRV)` — window function ranking
  3. `WHERE Check=1` — picks alphabetically first initial per employee
- Business Key: `LOHNNR` (Personnel Number from address record)

### DV Implication
- `PUBL.ADR` → Hub (`hub_publ_adr`, BK: `ADRESSNR` or `LOHNNR`)
- `LOHN.LEN` → Hub (`hub_lohn_len`, BK: `PERSONALNR`)
- The deduplication of initials = **Business Vault logic** (not raw vault)
- The employee filter (`LOHNJN=1`) = **Mart filter** or Business Vault

---

## 5. Projekt/Stunden

**Source Tables**: `[PROJ].[NSA]` (Stundenbuchungen) + `[PROJ].[NTR]` (Leistungsarten) + `[PUBL].[ADR]` (Adressstamm)
**Type**: LEFT JOIN + INNER JOIN

### SQL
```sql
SELECT
    CAST(T1.[PROJNR] as int) AS [PersonalNr],       -- Note: PROJNR used as PersonalNr!
    CAST(T1.[CODE] as int) AS [LeistungsartNr],
    T2.[DESCRIPTION] AS [Leistungsart],
    T1.[AZBETINT] AS [Betrag],
    DATEFROMPARTS(
        CASE WHEN COALESCE(T1.[PERIYEAR],1900) = 0 THEN 1900 ELSE COALESCE(T1.[PERIYEAR],1900) END,
        CASE WHEN COALESCE(T1.[PERIMONTH],1) = 0 THEN 1 ELSE COALESCE(T1.[PERIMONTH],1) END,
        1
    ) AS [Datum],
    T1.[timestamp_landing-zone] AS [timestamp_landing-zone_PROJ_NSA],
    T2.[timestamp_landing-zone] AS [timestamp_landing-zone_PROJ_NTR],
    T3.[timestamp_landing-zone] AS [timestamp_landing-zone_PUBL_ADR]
FROM [PROJ].[NSA] T1
LEFT OUTER JOIN [PROJ].[NTR] T2 ON T1.[CODE] = T2.[RECNUM]
INNER JOIN (
    SELECT DISTINCT [LOHNNR], [timestamp_landing-zone]
    FROM [PUBL].[ADR]
) T3 ON T1.[PROJNR] = T3.[LOHNNR]
WHERE T1.[AZBETINT] <> 0
```

### Business Logic
- **Main**: `PROJ.NSA` = Hour bookings (Stundenbuchungen)
- **JOIN 1**: `PROJ.NTR` (service types) on `CODE = RECNUM` — enriches with description
- **JOIN 2**: `PUBL.ADR` (INNER JOIN) on `PROJNR = LOHNNR` — **filters to only bookings for known employees**
- **Filter**: `AZBETINT <> 0` — only non-zero amounts
- **Date construction**: Builds date from `PERIYEAR`/`PERIMONTH` with NULL/0 handling (defaults to 1900-01-01)
- **⚠️ Naming quirk**: `PROJNR` in `PROJ.NSA` is used as `PersonalNr` — this column appears to store the employee number in hour bookings, NOT the project number

### DV Implication
- `PROJ.NSA` → Staging already exists (`ewb_proj_nsa_main`)
- `PROJ.NTR` → Reference table (Leistungsarten)
- The date construction and INNER JOIN filter = **Business Vault**
- The PROJNR→PersonalNr rename is business interpretation to be handled in Mart

---

## 6. Projekt/Projekt

**Source Tables**: `[PROJ].[NPO]` + `[PROJ].[PST]` + `[Sharepoint].[Kostenstellen]` + `[Sharepoint].[KategorisierungProjekte]` + `[Sharepoint].[ProjekteKategorien]`
**Type**: 4-way LEFT JOIN chain

### SQL
```sql
SELECT
    CAST(T1.[PROJNR] as int) AS [ProjektNr],
    T1.[PROJNAME] AS [ProjektName],
    CAST(T1.[INAKTIV] as int) AS [Inaktiv],
    CAST(T1.[REFPROJNR] as int) AS [GruppeNr],
    T3.[KostenstelleName] AS [GruppeName],
    CAST(T1.[CREATION] as date) AS [Erstellt],
    CAST(T1.[STATUS] as int) AS [StatusNr],
    T2.[BEZEICHN] AS [Status],
    CAST(T1.[STATUS1] as date) AS [StatusDatum],
    CAST(T5.[KategorieNr] as int) AS [HauptgruppeNr],
    T5.[KategorieName] AS [HauptgruppeName],
    T1.[timestamp_landing-zone] AS [timestamp_landing-zone_PROJ_NPO],
    T3.[timestamp_landing-zone] AS [timestamp_landing-zone_Sharepoint_Kostenstellen],
    T4.[timestamp_landing-zone] AS [timestamp_landing-zone_Sharepoint_KategorisierungProjekte],
    T5.[timestamp_landing-zone] AS [timestamp_landing-zone_Sharepoint_ProjekteKategorien]
FROM [PROJ].[NPO] T1
LEFT OUTER JOIN (
    SELECT DISTINCT [STATUS], [BEZEICHN]
    FROM [PROJ].[PST]
    WHERE LEN(TRIM([BEZEICHN])) > 2
) T2 ON T1.[STATUS] = T2.[STATUS]
LEFT OUTER JOIN [Sharepoint].[Kostenstellen] T3
    ON T1.[REFPROJNR] = T3.[KostenstelleNr]
LEFT OUTER JOIN [Sharepoint].[KategorisierungProjekte] T4
    ON T1.[PROJNR] = T4.[Projektnummer]
LEFT OUTER JOIN [Sharepoint].[ProjekteKategorien] T5
    ON T4.[KategorieNr] = T5.[KategorieNr]
```

### Business Logic
- **Main**: `PROJ.NPO` = Project positions (Projektpositionen)
- **JOIN 1**: `PROJ.PST` — Status lookup (deduplicated, filtered for meaningful names > 2 chars)
- **JOIN 2**: `Sharepoint.Kostenstellen` — Cost center name for project group (`REFPROJNR`)
- **JOIN 3+4**: Sharepoint category chain: `KategorisierungProjekte` → `ProjekteKategorien` for Hauptgruppe (main category)
- **No WHERE filter** — all projects included (active + inactive)

### DV Implication
- `PROJ.NPO` → Hub + Satellite (BK: PROJNR)
- `PROJ.PST` → Reference table (Status codes)
- Sharepoint tables → Reference tables (outside Abacus scope)
- Category chain = **Mart-level enrichment** (not raw vault)

---

## 7. Projekt/Abteilung

**Source Tables**: `[LOHN].[LEN]` (Mitarbeiterstamm) + `[LOHN].[LTC]` (Abteilungen)
**Type**: LEFT JOIN with DISTINCT

### SQL
```sql
SELECT DISTINCT
    CAST(T1.[EMPL_NR] as int) AS [PersonalNr],
    CAST(T1.[HOME_DEPT_NR] as int) AS [AbteilungNr],
    T2.[TEXT] AS [Abteilung],
    CAST(T1.[MUTATION_DATE] as date) AS [MutationDate],
    T1.[timestamp_landing-zone] AS [timestamp_landing-zone_LOHN_LEN],
    T2.[timestamp_landing-zone] AS [timestamp_landing-zone_LOHN_LTC]
FROM [LOHN].[LEN] T1
LEFT OUTER JOIN (
    SELECT [NR], [TEXT], [timestamp_landing-zone]
    FROM [LOHN].[LTC]
    WHERE CAST([GROUP] as int) = 1       -- Only department type groups
) T2 ON T1.[HOME_DEPT_NR] = T2.[NR]
```

### Business Logic
- **Main**: `LOHN.LEN` = Employee master (all records, including history)
- **JOIN**: `LOHN.LTC` (department table) filtered to `GROUP=1` (department type, not other groupings)
- **DISTINCT**: Removes duplicate employee-department assignments
- **No WHERE filter** on main — shows all employees with their department assignments
- Captures `MUTATION_DATE` for historization

### DV Implication
- `LOHN.LEN` → Hub (`hub_lohn_len`, BK: PERSONALNR/EMPL_NR)
- `LOHN.LTC` → Reference table (department lookup, GROUP=1 filter)
- Employee-Department assignment = **MA Satellite** or **Link** (employee can change department over time, tracked by MUTATION_DATE)

---

## 8–13. Sharepoint Reference Tables (Direct Copy, No Transform)

These 6 tables are **direct copies** from Synapse `[Sharepoint].*` schema to Parquet — no SQL transformation.

| Output | Source | Pipeline Activity | Description |
|--------|--------|------------------|-------------|
| `Finance/Budget/Main.parquet` | `[Sharepoint].[Budget]` | Manual Data landingzone → Budget | Budget data (manually maintained) |
| `Finance/Konten/Main.parquet` | `[Sharepoint].[Konten]` | Manual Data landingzone → Konten | Chart of accounts |
| `Finance/Kostenstellen/Main.parquet` | `[Sharepoint].[Kostenstellen]` | Manual Data landingzone → Kostenstellen | Cost centers |
| `Finance/Zugangsrechte/Main.parquet` | `[Sharepoint].[Zugangsrechte]` | Manual Data landingzone → Zugangsrechte | Access rights / permissions |
| `Finance/Forecast/Main.parquet` | `[Sharepoint].[Forecast]` | Manual Data landingzone → Forecast | Financial forecast |
| `Finance/ActualForecast/Main.parquet` | `[Sharepoint].[ActualForecast]` | Manual Data landingzone → ActualForecast | Actual vs forecast comparison |

These are loaded into Synapse via `Manual Data Sharepoint_daily` pipeline (WebHook-based, loads from Sharepoint lists).

---

## Source Table Cross-Reference

### Abacus Tables Used by structured-tables

| Abacus Table | structured-table(s) | Role | In DV Scope? |
|-------------|---------------------|------|--------------|
| `FIBU.GL` | Finance/Buchungen | Main source | ✅ `FIBU.GL.E22–E26` |
| `KRED.KBL` | Finance/Belege, Finance/Kunden | Main + denorm | ✅ `KRED.KBL.Main` |
| `KRED.KVL` | Finance/Belege | JOIN (payments) | ✅ `KRED.KVL.Main` |
| `PUBL.ADR` | Projekt/Personal, Projekt/Stunden | Main + filter | ✅ `PUBL.ADR.Main` |
| `LOHN.LEN` | Projekt/Personal, Projekt/Abteilung | JOIN + main | ✅ `LOHN.LEN.Main` |
| `LOHN.LTC` | Projekt/Abteilung | JOIN (departments) | ✅ `LOHN.LTC.Main` |
| `PROJ.NSA` | Projekt/Stunden | Main source | ✅ `PROJ.NSA.Main` |
| `PROJ.NTR` | Projekt/Stunden | JOIN (service types) | ✅ `PROJ.NTR.Main` |
| `PROJ.NPO` | Projekt/Projekt | Main source | ✅ `PROJ.NPO.Main` |
| `PROJ.PST` | Projekt/Projekt | JOIN (status lookup) | ✅ `PROJ.PST.Main` |

### Sharepoint Tables (outside Abacus)

| Sharepoint Table | structured-table(s) | Role |
|-----------------|---------------------|------|
| `Sharepoint.Kostenstellen` | Finance/Kostenstellen, Projekt/Projekt | Reference + JOIN |
| `Sharepoint.Budget` | Finance/Budget | Reference |
| `Sharepoint.Konten` | Finance/Konten | Reference |
| `Sharepoint.Forecast` | Finance/Forecast | Reference |
| `Sharepoint.ActualForecast` | Finance/ActualForecast | Reference |
| `Sharepoint.Zugangsrechte` | Finance/Zugangsrechte | Reference |
| `Sharepoint.KategorisierungProjekte` | Projekt/Projekt | JOIN (category assignment) |
| `Sharepoint.ProjekteKategorien` | Projekt/Projekt | JOIN (category names) |

---

## Data Vault Implementation Mapping

### Raw Vault (from Abacus — stage-fs)
All 10 Abacus source tables are already in DV scope as Parquet files in `stage-fs`. The structured-tables views are **downstream transformations** and should be replicated as Business Vault or Mart views, NOT as additional staging.

### Business Vault / Mart Views to Create

| structured-table | DV Target | Logic to Replicate |
|-----------------|-----------|-------------------|
| Finance/Buchungen | `mart.v_fibu_buchungen` | 4-way UNION with sign-flip, MWST adjustment, KST/KTO swap |
| Finance/Belege | `mart.v_kred_belege` | Simple JOIN KBL + KVL |
| Finance/Kunden | `mart.v_kred_kunden` | Extract from KBL (consider using PUBL.ADR instead) |
| Projekt/Personal | `mart.v_personal` | ADR + LEN with dedup logic, employee filter |
| Projekt/Stunden | `mart.v_stunden` | NSA + NTR + ADR with date construction |
| Projekt/Projekt | `mart.v_projekt` | NPO + PST + Sharepoint categories |
| Projekt/Abteilung | `mart.v_abteilung` | LEN + LTC department assignment |

### Key Business Rules to Preserve
1. **Buchungen sign logic**: Soll negates KTO side, Haben negates GKTO side; MWST type 5 and inclusive 'E' use net amount
2. **KST exclusion list**: `2990, 3990, 4990, 5990, 6990, 7990` (consolidation cost centers)
3. **Account range**: Only `30000 < KTO < 90000` (P&L accounts)
4. **Employee filter**: `LOHNJN=1 AND GESPERRT=0 AND LOHNNR<>0`
5. **Hour bookings**: `AZBETINT <> 0` filter, `PROJNR` = PersonalNr (naming quirk)
6. **Status dedup**: `LEN(TRIM(BEZEICHN)) > 2` for meaningful status names
7. **Department filter**: `GROUP = 1` in LOHN.LTC for department type only
