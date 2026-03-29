---
description: 'Richtet ein neues Quellsystem (Concept) ein: Ordnerstruktur, dbt_project.yml Config, sources.yml, erste Entität.'
mode: 'agent'
tools: ['changes', 'editFiles', 'problems', 'runCommands', 'search']
---
# Neues Quellsystem onboarden

Du bist ein Data Vault Entwickler. Richte ein neues Quellsystem (Concept) nach Confluence ITDATAH ein.

## Kontext

Lies zuerst:
- `.github/instructions/datavault-dbt.instructions.md` (Schema-Naming, Business Concepts)
- `.github/instructions/dbt-staging.instructions.md` (Source Systems §11)
- `.github/copilot-instructions.md` (Projekt-Überblick, Adding a New Source System)

## Frage den User nach

1. **Source System Key** — z.B. `sap_eam`, `jira`, `metric` (muss aus Confluence §11 sein)
2. **Concept Key** — Ordnername unter `raw_vault/` (z.B. `sap_eam`, `jira`)
3. **Business Concept** — z.B. `energy_industry`, `hcm` (Confluence §12)
4. **Erste Entität** — Welche Tabelle soll zuerst ongeboardet werden?
5. **Verbindungsdetails** — Container/Schema der Quelldaten (Parquet in ADLS? LOAD DB?)

## Workflow

### 1. Ordnerstruktur erstellen

```
models/raw_vault/{concept}/
├── hubs/
├── satellites/
├── links/
└── _{concept}__models.yml
design/raw-vault/{concept}/
└── er-diagram.mmd
```

### 2. dbt_project.yml aktualisieren

Unter `models: raw_vault:` hinzufügen:
```yaml
{concept}:
  +schema: vault_{concept}
  +materialized: incremental
  +incremental_strategy: append
  +as_columnstore: false
```

### 3. sources.yml erweitern

In `models/staging/sources.yml` die External Tables definieren:
```yaml
- name: ext_{concept}_{entity}
  external:
    location: "{{ var('{concept}_container') }}/..."
    file_format: parquet
  columns: ...
```

### 4. Erste Entität erstellen

Verwende den `/new-entity` Workflow für die erste Tabelle.

### 5. ER-Diagramm initialisieren

```mermaid
erDiagram
    %%{init: {'theme': 'base'}}%%
    %% Schema: vault_{concept}
```

## Gültige Source Systems (Confluence §11)

| Key | System |
|-----|--------|
| `sap_hcm` | SAP HCM |
| `sap_crm` | SAP CRM |
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

## Gültige Business Concepts (Confluence §12)

`datahub`, `hcm`, `crm`, `isu`, `jira`, `meta`, `weather`, `powerplant`, `coar`, `energy_industry`, `em`, `orga`

## Regeln

- **KEINE** `dbt run` ohne User-Zustimmung
- Source System Key muss aus Confluence §11 stammen (oder neu registriert werden)
- `_common` Ordner ist für quell-übergreifende Objekte reserviert
