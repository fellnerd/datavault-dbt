---
description: Erstellt eine Point-in-Time Tabelle (PIT)
tools: [datavault-agent]
context:
  - docs/DEVELOPER.md#6-business-vault
  - docs/MODEL_ARCHITECTURE.md
---

# PIT erstellen: {{HUB_NAME}}

Du erstellst eine Point-in-Time (PIT) Tabelle für einen Hub und seine Satellites. PITs optimieren Abfragen über mehrere Satellites hinweg.

## Schritt 1: Hub und Satellites analysieren

```
Tool: list_entities
Args: { "entityType": "satellite", "filter": "{{HUB_NAME}}" }
```

**Zeige verfügbare Satellites:**
> Verfügbare Satellites für `hub_{{HUB_NAME}}`:
> 
> ☐ sat_{{HUB_NAME}} - Stammdaten
> ☐ sat_{{HUB_NAME}}_status - Statusänderungen
> ☐ sat_{{HUB_NAME}}_metrics - Kennzahlen
> ...
>
> Welche Satellites sollen in die PIT aufgenommen werden?

## Schritt 2: Snapshot-Strategie festlegen

> Snapshot-Granularität?
>
> 1. **Täglich** - Tägliche Snapshots (Standard)
> 2. **Monatlich** - Monats-Snapshots
> 3. **Event-basiert** - Bei jeder Änderung
>
> Zeitraum: von {{START_DATE}} bis {{END_DATE}}

## Schritt 3: PIT erstellen

```
Tool: create_pit
Args: {
  "hubName": "{{HUB_NAME}}",
  "satellites": {{SATELLITES}},
  "snapshotGranularity": "{{GRANULARITY}}"
}
```

**Generierte Struktur:**
```sql
pit_{{HUB_NAME}} (
  -- Hub Key
  hk_{{HUB_NAME}},
  
  -- Snapshot Datum
  pit_snapshot_date,
  
  -- Satellite Load Dates (für Joins)
  sat_{{HUB_NAME}}_load_date,
  sat_{{HUB_NAME}}_status_load_date,
  ...
  
  -- Metadata
  dss_load_date
)
```

## Schritt 4: Verwendung erklären

**Optimierter Join mit PIT:**
```sql
SELECT 
  h.business_key,
  s1.attribute1,
  s2.status
FROM pit_{{HUB_NAME}} pit
JOIN hub_{{HUB_NAME}} h ON pit.hk_{{HUB_NAME}} = h.hk_{{HUB_NAME}}
JOIN sat_{{HUB_NAME}} s1 
  ON pit.hk_{{HUB_NAME}} = s1.hk_{{HUB_NAME}}
  AND pit.sat_{{HUB_NAME}}_load_date = s1.dss_load_date
JOIN sat_{{HUB_NAME}}_status s2
  ON pit.hk_{{HUB_NAME}} = s2.hk_{{HUB_NAME}}
  AND pit.sat_{{HUB_NAME}}_status_load_date = s2.dss_load_date
WHERE pit.pit_snapshot_date = '2024-01-15'
```

## Placeholders

- `{{HUB_NAME}}`: Name des Hubs (ohne "hub_" Prefix)
- `{{SATELLITES}}`: Array der aufzunehmenden Satellites
- `{{GRANULARITY}}`: daily, monthly, event-based
- `{{START_DATE}}`, `{{END_DATE}}`: Zeitraum

## Beispiel

```
/create-pit company
```

Erstellt `pit_company` mit Verweisen auf alle Company-Satellites.
