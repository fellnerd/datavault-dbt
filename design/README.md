# Data Vault Design

> Model-First Approach: Zuerst Design in Mermaid, dann Implementierung in dbt

## ⚠️ WICHTIG: Diagramme aktuell halten

**Nach jeder Model-Änderung müssen die ER-Diagramme aktualisiert werden!**

```
models/raw_vault/<concept>/  →  design/raw-vault/<concept>/er-diagram.mmd
```

## Struktur

```
design/
├── staging/           # Quellsystem-Mapping & Staging Views
├── raw-vault/         # Hubs, Links, Satellites (ERD)
│   ├── _common/       # Übergreifende Objekte (Schema: vault)
│   ├── jira/    # Jira-spezifisch (Schema: vault_jira)
│   │   ├── overview.md
│   │   └── er-diagram.mmd   ← Mermaid ER-Diagramm
│   └── adventureworks/
├── business-vault/    # PITs, Bridges, berechnete Satellites
└── data-flow/         # End-to-End Datenfluss
```

## Aktuelle ER-Diagramme

### Raw Vault
- `design/raw-vault/_common/er-diagram.mmd` — Gesamtübersicht aller `vault`-Objekte im `_common`-Scope
- `design/raw-vault/_common/er-finance.mmd` — Finance-Detaildiagramm
- `design/raw-vault/_common/er-project.mmd` — Project-Detaildiagramm
- `design/raw-vault/_common/er-stammdaten.mmd` — Stammdaten-Detaildiagramm
- `design/raw-vault/_common/er-cdr.mmd` — CDR-/Telecom-Detaildiagramm für `vault` + `vault_telecom`
- `design/raw-vault/idms/er-diagram.mmd` — IDMS Internet-Service (`dv`)
- `design/raw-vault/ise/er-diagram.mmd` — ISE/EDM Energiedaten (`vault_ise`), Übersicht in `ise/overview.md`

### Mart
- `design/mart/er-mart-finance.mmd`
- `design/mart/er-mart-project.mmd`
- `design/mart/er-mart-telecom.mmd`
- `design/mart/er-mart-ise.mmd` — ISE/EDM Energiedaten (`mart_ise`)

## Schema-Konvention

| Schema | Verwendung | Beispiel |
|--------|------------|----------|
| `stg` | Staging Views | `stg.stg_company` |
| `vault` | Integrierte/übergreifende Objekte | `vault.hub_company` (merged) |
| `vault_<concept>` | Quellsystem-spezifisch | `vault_jira.hub_project` |
| `mart_<concept>` | Business-Domain Marts | `mart_project.company_current_v` |

## Workflow

1. **Design** → Mermaid-Diagramm erstellen/aktualisieren
2. **Review** → Diagramm mit Fachbereich abstimmen
3. **Implement** → dbt Model basierend auf Design erstellen
4. **Update** → ER-Diagramm nach Implementation aktualisieren
5. **Validate** → Sicherstellen, dass Implementation dem Design entspricht

## Mermaid ER-Diagramme

### Dateiformat
- **Dateiendung:** `.mmd` (Mermaid)
- **Speicherort:** `design/raw-vault/<concept>/er-diagram.mmd`
- **Theme:** `base` (neutral, keine bunten Farben)

### Template
```mermaid
erDiagram
    %%{init: {'theme': 'base'}}%%
    %% Schema: vault_<concept>
    
    HUB_ENTITY {
        char64 hk_entity PK
        bigint object_id
        datetime2 dss_load_date
        varchar dss_record_source
    }
    
    SAT_ENTITY {
        char64 hk_entity FK
        datetime2 dss_load_date
        char64 hd_entity
        varchar attribute1
        char1 dss_is_current
        datetime2 dss_end_date
    }
    
    HUB_ENTITY ||--o{ SAT_ENTITY : has
```

### Themes
| Theme | Beschreibung |
|-------|-------------|
| `base` | Minimalistisch, neutral (empfohlen) |
| `neutral` | Grautöne |
| `default` | Bunt, Standard-Farben |
| `dark` | Dunkler Hintergrund |
| `forest` | Grüntöne |

### Relationship Syntax
```
||--o{  : One-to-Many (Hub → Satellite)
||--||  : One-to-One
}|--|{  : Many-to-Many
||--o|  : One-to-Zero-or-One
```

## Diagramm-Typen

| Schicht | Diagramm-Typ | Zweck |
|---------|--------------|-------|
| Staging | `flowchart` | Quell-zu-Staging Mapping |
| Raw Vault | `erDiagram` | Entity-Relationship (Hubs, Links, Sats) |
| Business Vault | `erDiagram` | PITs, Bridges, berechnete Felder |
| Data Flow | `flowchart` | End-to-End Lineage |

### Namenskonventionen
- Hub: `hub_<entity>`
- Link: `link_<entity1>_<entity2>`
- Satellite: `sat_<entity>`
- Effectivity Satellite: `eff_sat_<link>`
- PIT: `pit_<entity>`
- Bridge: `bridge_<entity1>_<entity2>`
