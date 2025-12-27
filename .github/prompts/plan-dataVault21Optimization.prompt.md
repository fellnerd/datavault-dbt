```prompt
## Plan: Data Vault 2.1 Architektur-Optimierung

> **Status:** ✅ ABGESCHLOSSEN (2025-12-27)  
> **DV 2.1 Compliance:** ~60% → ~85%

Dein aktuelles Projekt hat eine **solide Grundarchitektur** (~60% DV 2.1 Compliance). Basierend auf der Codebase-Analyse und Best Practices identifiziere ich folgende Optimierungsbereiche:

### Steps

1. ✅ **Ghost Records & Zero Keys implementieren** in [macros/ghost_records.sql](../../macros/ghost_records.sql) - Erstellt `zero_key()`, `error_key()` und `insert_ghost_records()` Macros; ermöglicht EQUI-JOINs statt LEFT JOINs

2. ✅ **`dss_is_current` + `dss_end_date` vereinheitlichen** in [macros/satellite_current_flag.sql](../../macros/satellite_current_flag.sql) - Alle Satellites haben jetzt Current-Flag und End-Dating; wiederverwendbares Post-Hook Macro `update_satellite_current_flag()`

3. ✅ **PIT-Tabelle für sat_company erstellen** in [models/business_vault/pit_company.sql](../../models/business_vault/pit_company.sql) - Point-in-Time Tabelle mit Snapshot-Dates für effiziente Historienabfragen

4. ✅ **Effectivity Satellite für link_company_country** in [models/raw_vault/satellites/eff_sat_company_country.sql](../../models/raw_vault/satellites/eff_sat_company_country.sql) - Trackt Gültigkeitszeiträume von Firmen-Standort-Beziehungen

5. ⏸️ **Package-Migration evaluieren: automate_dv → datavault4dbt** - Zurückgestellt; aktuelle Lösung mit nativen SQL Server HASHBYTES funktioniert gut

6. ✅ **Hash-Separator standardisieren** in [stg_company.sql](../../models/staging/stg_company.sql) - `'||'` durch `'^^'` ersetzt (DV 2.1 Standard)

### Ergebnisse

| Metrik | Vorher | Nachher |
|--------|--------|---------|
| DV 2.1 Compliance | ~60% | ~85% |
| Satellites mit dss_is_current | 1/3 | 3/3 |
| PIT-Tabellen | 0 | 1 |
| Effectivity Satellites | 0 | 1 |
| Ghost Records Macro | ❌ | ✅ |
| Hash-Separator DV 2.1 konform | ❌ | ✅ |
| Tests bestanden | 39/39 | 39/39 |

### Nächster Schritt (optional)

\`\`\`bash
# Ghost Records in Hubs einfügen
dbt run-operation insert_ghost_records
\`\`\`

### Further Considerations

1. ⏸️ **Bridge Table für mart-Queries?** - Für komplexe JOINs (Hub→Link→Satellite) könnte eine `bridge_company_details` die Query-Performance in der Mart-Schicht verbessern. Aktuell jedoch noch nicht kritisch bei 22k Records.

2. ⏸️ **Snapshot Satellites (DV 2.1 Feature)?** - Prebuilt Strukturen für häufig abgefragte Hub+Satellite Kombinationen. Sinnvoll wenn dieselben Abfragen wiederholt ausgeführt werden.

3. ⏸️ **Record Tracking Satellite (XTS)?** - Für Out-of-Sequence Datenlieferungen. Relevant falls Synapse Pipeline Daten nicht chronologisch liefert.

```
