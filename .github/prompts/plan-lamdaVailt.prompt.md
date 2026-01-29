
### Konzept-Übersicht

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Power BI (DirectQuery)                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Virtualized Mart Layer                                   │
│         dim_vorgang / fact_vorgang → reads from v_sat_*, v_hub_*            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                  Virtualized Raw Vault Views (v_*)                          │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  v_hub_vorgang =                                                    │    │
│  │    SELECT * FROM vault_jira.hub_vorgang           -- Persistiert   │    │
│  │    UNION ALL                                                        │    │
│  │    SELECT ... FROM stg.jira_vorgang               -- Delta         │    │
│  │    WHERE NOT EXISTS (SELECT 1 FROM hub WHERE hk = stg.hk)          │    │
│  └────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Staging Views (stg.*)                                 │
│              stg.jira_vorgang → Hash Keys berechnet                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
            ┌───────────────────────┴───────────────────────┐
            ▼                                               ▼
┌───────────────────────────┐               ┌───────────────────────────────┐
│  PSA (Optional)           │               │  External Table (OPENROWSET)   │
│  psa_jira_vorgang         │               │  ext_jira_vorgang              │
│  (Incremental Cache)      │               │  → Parquet Files               │
└───────────────────────────┘               └───────────────────────────────┘
```

---

### Parquet-Strukturierung (für Drittsystem)

**Empfohlene Struktur:**

```
stage-fs/
└── <concept>/
    └── <source>/
        └── <entity>/
            ├── _metadata.json          # Optional: Schema, Watermark
            ├── full/                   # Initial/Full Load
            │   └── data.parquet
            └── delta/                  # Incremental Changes
                ├── 2026-01-28T10-00-00Z.parquet
                ├── 2026-01-28T10-15-00Z.parquet
                └── 2026-01-28T10-30-00Z.parquet
```

| Empfehlung | Detail |
|------------|--------|
| **Datei-Granularität** | 1 Parquet pro Zeitscheibe (z.B. alle 15 Min), NICHT 1 pro Zeile |
| **Naming Convention** | ISO 8601 Timestamp: `YYYY-MM-DDTHH-mm-ssZ.parquet` |
| **Partitionierung** | Nach Datum/Stunde für effizientes Pruning: `delta/date=2026-01-28/hour=10/` |
| **Größe** | Optimal: 128MB-1GB pro Datei |
| **Pflichtfelder** | `dss_load_date`, `dss_record_source`, `dss_source_file_name` |

**Pflicht-Metadaten-Spalten im Parquet:**

```
dss_load_date         -- DATETIME2: Wann wurde der Record vom Quellsystem exportiert
dss_record_source     -- VARCHAR: Quellsystem-Identifier (z.B. 'JIRA/API')
dss_source_file_name  -- VARCHAR: Name der Parquet-Datei (für Auditing)
```

---

### Implementierung: Virtualized Hub View

```sql
-- vault_jira.v_hub_vorgang
CREATE VIEW vault_jira.v_hub_vorgang AS
-- Persistierte Daten (bereits geladen via dbt run)
SELECT 
    hk_vorgang,
    issue_id,
    dss_load_date,
    dss_record_source
FROM vault_jira.hub_vorgang

UNION ALL

-- Delta: Neue Records aus Staging (seit letztem dbt run)
SELECT 
    stg.hk_vorgang,
    stg.issue_id,
    stg.dss_load_date,
    stg.dss_record_source
FROM stg.jira_vorgang stg
WHERE NOT EXISTS (
    SELECT 1 
    FROM vault_jira.hub_vorgang h 
    WHERE h.hk_vorgang = stg.hk_vorgang
);
```

### Implementierung: Virtualized Satellite View

```sql
-- vault_jira.v_sat_vorgang  
CREATE VIEW vault_jira.v_sat_vorgang AS
-- Persistierte Daten
SELECT 
    hk_vorgang,
    hashdiff,
    issue_key, summary, priority, /* ... alle Attribute */
    dss_load_date,
    dss_record_source,
    dss_is_current,
    dss_end_date
FROM vault_jira.sat_vorgang

UNION ALL

-- Delta: Geänderte Records (HasDiff unterschiedlich vom letzten persistierten)
SELECT 
    stg.hk_vorgang,
    stg.hd_vorgang AS hashdiff,
    stg.issue_key, stg.summary, stg.priority, /* ... */
    stg.dss_load_date,
    stg.dss_record_source,
    'Y' AS dss_is_current,      -- Delta ist immer aktuell
    NULL AS dss_end_date
FROM stg.jira_vorgang stg
WHERE stg.hd_vorgang != ISNULL(
    (SELECT TOP 1 hashdiff 
     FROM vault_jira.sat_vorgang s 
     WHERE s.hk_vorgang = stg.hk_vorgang 
     ORDER BY dss_load_date DESC),
    ''  -- Nicht existierend = neu
);
```

### Virtualized dss_is_current Handling

**Problem:** Bei virtuellem Satellite weiß der persistierte Record nicht, dass er nicht mehr current ist.

**Lösung:** View mit CASE WHEN:

```sql
CREATE VIEW vault_jira.v_sat_vorgang_current AS
SELECT 
    hk_vorgang,
    hashdiff,
    /* attributes */
    dss_load_date,
    -- Dynamisches dss_is_current: Prüft ob Delta-Record existiert
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM stg.jira_vorgang stg 
            WHERE stg.hk_vorgang = sat.hk_vorgang
              AND stg.hd_vorgang != sat.hashdiff
        ) THEN 'N'  -- Nicht mehr current, Delta hat Änderung
        ELSE dss_is_current
    END AS dss_is_current
FROM vault_jira.sat_vorgang sat

UNION ALL

-- Delta Records (immer current)
SELECT 
    stg.hk_vorgang,
    stg.hd_vorgang AS hashdiff,
    /* attributes */
    stg.dss_load_date,
    'Y' AS dss_is_current
FROM stg.jira_vorgang stg
WHERE stg.hd_vorgang != ISNULL(...);
```

---

### Extension Integration

**Neuer Command:** `datavault.virtualizeRawVault`

| Option | Beschreibung |
|--------|--------------|
| Concept | z.B. `jira` |
| Entities | Multi-Select: hub_vorgang, sat_vorgang, link_* |
| Output | Erstellt `v_*.sql` Views im `models/raw_vault/<concept>/virtual/` |

**Generator-Output:**

```
models/
└── raw_vault/
    └── jira/
        └── virtual/
            ├── v_hub_vorgang.sql
            ├── v_sat_vorgang.sql
            └── v_link_vorgang_project.sql
```

---

### Performance-Überlegungen

| Szenario | Lösung |
|----------|--------|
| Große Delta-Datei | PSA als Zwischenschicht nutzen (merge strategy) |
| Viele kleine Parquets | Wildcard-Pfad: `delta/*.parquet` |
| Langsame EXISTS-Checks | Indexed View auf Hub Hash Keys |
| Full Refresh nötig | `dbt run` - persistiert alles, Delta wird leer |

---
