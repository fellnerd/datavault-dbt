# Business Vault Design

Point-in-Time Tables (PITs), Bridges und berechnete Satellites.

## Dateien

| Datei | Beschreibung |
|-------|--------------|
| `overview.md` | Gesamtübersicht Business Vault |
| `pit_<entity>.md` | Point-in-Time Table Design |
| `bridge_<entities>.md` | Bridge Table Design |

## Konzepte

### Point-in-Time (PIT) Tables

PITs vereinfachen den Zugriff auf historische Daten durch Vorberechnung der Satellite-Versionen zu jedem Zeitpunkt.

```mermaid
erDiagram
    PIT_COMPANY {
        char64 hk_company PK
        datetime dss_load_date PK "Snapshot-Zeitpunkt"
        datetime sat_company_load_date FK "→ sat_company"
        datetime sat_company_ext_load_date FK "→ sat_company_ext"
    }
```

### Bridge Tables

Bridges denormalisieren Link-Strukturen für performante Abfragen.

```mermaid
erDiagram
    BRIDGE_COMPANY_PROJECTS {
        char64 hk_company PK
        char64 hk_project FK
        char64 hk_invoice FK
        datetime dss_load_date
    }
```

## Templates

Siehe:
- [_template_pit.md](_template_pit.md)
- [_template_bridge.md](_template_bridge.md)
