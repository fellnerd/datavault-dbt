---
description: Erstellt einen Effectivity Satellite (Eff-Sat)
tools: [datavault-agent]
context:
  - docs/DEVELOPER.md#54-effectivity-satellite
  - docs/MODEL_ARCHITECTURE.md
---

# Effectivity Satellite erstellen: {{LINK_NAME}}

Du erstellst einen Effectivity Satellite für einen Link. Eff-Sats tracken die Gültigkeit von Beziehungen.

## Schritt 1: Link prüfen

```
Tool: get_entity_info
Args: { "entityName": "link_{{LINK_NAME}}" }
```

**Falls Link nicht existiert:**
> Link `link_{{LINK_NAME}}` nicht gefunden.
> → Zuerst erstellen mit `/create-link {{LINK_NAME}}`

## Schritt 2: Gültigkeitslogik bestimmen

> Wie wird die Gültigkeit bestimmt?
>
> **Optionen:**
> 1. **End-Dating** - Explizites Enddatum in Quelle vorhanden
> 2. **Delete Detection** - Fehlende Datensätze = gelöscht
> 3. **Status Flag** - Feld markiert aktiv/inaktiv
>
> Spalten für Gültigkeit:
> - `valid_from`: {{VALID_FROM_COLUMN}}
> - `valid_to`: {{VALID_TO_COLUMN}} (optional)
> - `is_active`: {{IS_ACTIVE_COLUMN}} (optional)

## Schritt 3: Eff-Sat erstellen

```
Tool: create_effectivity_satellite
Args: {
  "linkName": "{{LINK_NAME}}",
  "validFromColumn": "{{VALID_FROM_COLUMN}}",
  "validToColumn": "{{VALID_TO_COLUMN}}",
  "drivingKey": "{{DRIVING_KEY}}"
}
```

**Generierte Struktur:**
```sql
sat_eff_{{LINK_NAME}} (
  hk_link_{{LINK_NAME}},      -- Link Hash Key
  {{DRIVING_KEY}},             -- Driving Key (z.B. hk_company)
  dss_start_date,              -- Gültig ab
  dss_end_date,                -- Gültig bis (oder 9999-12-31)
  dss_is_current,              -- Aktuell gültig?
  dss_load_date,
  dss_record_source
)
```

## Schritt 4: Historisierungslogik

Der Eff-Sat verwendet:
- **Driving Key**: Bestimmt aus welcher Perspektive Änderungen getrackt werden
- **End-Dating**: Automatisches Setzen von `dss_end_date` bei Änderungen

## Placeholders

- `{{LINK_NAME}}`: Name des Links (ohne "link_" Prefix)
- `{{VALID_FROM_COLUMN}}`: Spalte für Startdatum
- `{{VALID_TO_COLUMN}}`: Spalte für Enddatum (optional)
- `{{DRIVING_KEY}}`: Primärer Hub Key (z.B. "hk_company")

## Beispiel

```
/create-eff-sat company_country
```

Trackt wann eine Firma welchem Land zugeordnet war.
