# Data Vault Design

> Model-First Approach: Zuerst Design in Mermaid, dann Implementierung in dbt

## Struktur

```
design/
├── staging/           # Quellsystem-Mapping & Staging Views
├── raw-vault/         # Hubs, Links, Satellites (ERD)
│   ├── _integrated/   # Übergreifende Objekte (Schema: vault)
│   ├── werkportal/    # Werkportal-spezifisch (Schema: vault_werkportal)
│   └── jira/          # Jira-spezifisch (Schema: vault_jira)
├── business-vault/    # PITs, Bridges, berechnete Satellites
└── data-flow/         # End-to-End Datenfluss
```

## Schema-Konvention

| Schema | Verwendung | Beispiel |
|--------|------------|----------|
| `stg` | Staging Views | `stg.stg_company` |
| `vault` | Integrierte/übergreifende Objekte | `vault.hub_company` (merged) |
| `vault_<concept>` | Quellsystem-spezifisch | `vault_werkportal.hub_project` |
| `mart_<concept>` | Business-Domain Marts | `mart_project.company_current_v` |

## Workflow

1. **Design** → Mermaid-Diagramm erstellen/aktualisieren
2. **Review** → Diagramm mit Fachbereich abstimmen
3. **Implement** → dbt Model basierend auf Design erstellen
4. **Validate** → Sicherstellen, dass Implementation dem Design entspricht

## Mermaid Diagramm-Typen

| Schicht | Diagramm-Typ | Zweck |
|---------|--------------|-------|
| Staging | `flowchart` | Quell-zu-Staging Mapping |
| Raw Vault | `erDiagram` | Entity-Relationship (Hubs, Links, Sats) |
| Business Vault | `erDiagram` | PITs, Bridges, berechnete Felder |
| Data Flow | `flowchart` | End-to-End Lineage |

## Konventionen

### Farben (CSS-Klassen)
- 🟦 **Hub** - Blau
- 🟩 **Link** - Grün  
- 🟨 **Satellite** - Gelb
- 🟪 **PIT/Bridge** - Lila

### Namenskonventionen
- Hub: `hub_<entity>`
- Link: `link_<entity1>_<entity2>`
- Satellite: `sat_<entity>`
- Effectivity Satellite: `eff_sat_<link>`
- PIT: `pit_<entity>`
- Bridge: `bridge_<entity1>_<entity2>`
