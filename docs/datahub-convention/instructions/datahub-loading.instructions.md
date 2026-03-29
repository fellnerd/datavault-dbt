---
applyTo: '**'
---
# Beladungsstrategien – dbt Data Vault (Confluence ITDATAH §9)

> Globale Regeln für Beladungsstrategien im gesamten Projekt.

## Übersicht

| Strategie | Beschreibung | Delta-Ermittlung | Typischer Einsatz |
|-----------|-------------|------------------|-------------------|
| **Full Load** | Gesamtabzug | BK-Vergleich + Hashdiff | Stammdaten, kleine Tabellen |
| **Delta Load** | Nur Änderungen | load_ctrl Watermark | Große Tabellen mit Änderungs-Timestamp |
| **Full-Delta Load** | Eingeschränkter Full Load | Dauerhafter Filter + Hashdiff | Partitionierte Daten |
| **Keyless Load** | Kein eindeutiger Key | Batch-Inaktivierung | Logdaten, Events |

## 1. Full Load (Gesamtabzug)

**Prinzip:** Kompletter Datenabzug aus Vorsystem → Delta-Ermittlung im DWH.

**Ablauf:**
1. Gesamtabzug in LOAD-Schicht (alle Records)
2. In Stage: Hash-Berechnung (HK + Hashdiff)
3. Hub: Nur neue BKs einfügen (HK existiert noch nicht)
4. Satellite: Hash-Vergleich (Hashdiff) statt Einzelattribut-Vergleich
   - Neuer Hashdiff → Insert (Change Detection)
   - Gleicher Hashdiff → Skip (kein Change)

**In dbt:**
```sql
-- automate_dv übernimmt Delta-Erkennung automatisch:
-- Hub: INSERT WHERE NOT EXISTS (on hk)
-- Sat: INSERT WHERE hashdiff changed OR new hk
{{ automate_dv.hub(...) }}
{{ automate_dv.sat(...) }}
```

**Vorteile:** Einfach, vollständig, erkennt auch physisch gelöschte Records (via Record Tracking Sat).
**Nachteile:** Hoher Datenvolumen-Transfer bei großen Tabellen.

## 2. Delta Load (Nur Änderungen)

**Prinzip:** Nur geänderte/neue Records seit letzter Beladung.

**Steuerung:** `load_ctrl` Tabelle mit Low/High Watermark.

| Attribut | Beschreibung |
|----------|-------------|
| Low Watermark | Letzter erfolgreicher Beladungszeitpunkt |
| High Watermark | Aktueller Beladungszeitpunkt |

**Delta-Kriterien:**
- **Timestamp:** Änderungs-Datum/Zeit im Vorsystem (z.B. `AEDAT`, `CHANGED_ON`)
- **ID:** Auto-Increment ID > letzte bekannte ID
- **String:** Beliebiger Vergleichswert

**In dbt:**
```sql
{% if is_incremental() %}
WHERE source_changed_date > (SELECT MAX(dss_load_date) FROM {{ this }})
{% endif %}
```

**WICHTIG:** Bei Delta Load darf das **Delta-Kriterium NICHT im Hashdiff** (hd_*) enthalten sein (Confluence §4). Sonst ändert sich der Hash bei jeder Beladung auch ohne echte Datenänderung.

**Vorteile:** Geringeres Datenvolumen, schnellere Beladung.
**Nachteile:** Kann physische Löschungen im Vorsystem nicht erkennen → Record Tracking Sat benötigt.

## 3. Full-Delta Load (Eingeschränkter Full Load)

**Prinzip:** Full Load mit dauerhaftem Filter auf einen Subset der Daten.

```yaml
ext_load_data_set_type: FULL DELTA
```

**Beispiel:** Nur Records der letzten 12 Monate oder nur aktive Verträge.

**Ablauf:**
1. Gesamtabzug mit WHERE-Filter (dauerhaft aktiv)
2. Delta-Ermittlung wie bei Full Load (BK + Hashdiff)
3. Filter ändert sich NICHT zwischen Beladungen

**In dbt:**
```sql
SELECT *
FROM {{ source('staging', 'ext_<concept>_<entity>') }}
WHERE valid_from >= DATEADD(MONTH, -12, GETDATE())
```

**Vorteile:** Begrenzt Volumen bei großen historischen Tabellen.
**Nachteile:** Records außerhalb des Filters werden nie geladen.

## 4. Keyless Load (Kein eindeutiger Key)

**Prinzip:** Quelldaten haben keinen eindeutigen Business Key (z.B. Logdaten, Events).

**Ablauf:**
1. Bei Reload: Alle Records des Batch als **inaktiv** setzen
2. Neue Records einfügen
3. Dadurch: Kein Duplikat-Problem bei Re-Loads

**In dbt:**
```sql
-- Keyless erfordert spezielle Behandlung:
-- Option 1: Synthetischer Key (ROW_NUMBER + Timestamp)
-- Option 2: Hash über alle Spalten als BK
CONVERT(CHAR(64), HASHBYTES('SHA2_256',
    CONCAT_WS('||', col1, col2, ..., colN)
), 2) AS hk_<entity>
```

**WICHTIG:** Kein Change Detection möglich (kein stabiler BK → kein Hashdiff-Vergleich). Jeder Batch wird vollständig eingefügt.

## Beladungsstrategie-Entscheidung

```
Hat die Quelle einen stabilen Business Key?
├── JA → Ist die Quelle klein genug für Gesamtabzug?
│   ├── JA → Full Load ✓
│   └── NEIN → Hat die Quelle ein Delta-Kriterium?
│       ├── JA → Delta Load ✓
│       └── NEIN → Full-Delta Load ✓ (mit Filter)
└── NEIN → Keyless Load ✓
```

## Load Control (Confluence)

Für Delta Load wird eine Steuerungstabelle verwendet:

```sql
-- load_ctrl Tabelle (vereinfacht)
CREATE TABLE load_ctrl (
    table_name        NVARCHAR(255),
    low_watermark     DATETIME2(7),    -- Letzter erfolgreicher Load
    high_watermark    DATETIME2(7),    -- Aktueller Load-Zeitpunkt
    delta_column      NVARCHAR(255),   -- Name der Delta-Spalte
    load_status       CHAR(1)          -- S=Success, F=Failed, R=Running
);
```

## dbt-Mapping

| Confluence | dbt | Anmerkung |
|-----------|-----|-----------|
| Full Load → Delta via BK+Hash | `automate_dv.hub()` + `automate_dv.sat()` | Standard, automatisch |
| Delta Load (Watermark) | `is_incremental()` + WHERE-Clause | Manuell im Staging |
| Full-Delta Load | WHERE-Filter im Staging | Dauerhafter Filter |
| Keyless Load | Synthetischer Key oder HASH-ALL | Spezialfall |
| load_ctrl Tabelle | Nicht implementiert (PoC) | Bei Bedarf als dbt model |
