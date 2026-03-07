# Claude Code Plugin: Data Vault Agent

Dieses Verzeichnis enthält die Claude Code Plugin-Konfiguration für den Data Vault MCP Server.

## 📁 Struktur

```
.claude/
├── settings.json           # Plugin-Konfiguration
├── commands/               # Slash Commands
│   ├── create-hub.md       # /create-hub
│   ├── create-satellite.md # /create-satellite
│   ├── create-link.md      # /create-link
│   ├── create-staging.md   # /create-staging
│   ├── create-eff-sat.md   # /create-eff-sat
│   ├── create-pit.md       # /create-pit
│   ├── create-bridge.md    # /create-bridge
│   ├── create-mart.md      # /create-mart
│   ├── create-ref-table.md # /create-ref-table
│   ├── list-entities.md    # /list-entities
│   ├── entity-info.md      # /entity-info
│   ├── suggest-attributes.md # /suggest-attributes
│   ├── validate.md         # /validate
│   ├── lineage.md          # /lineage
│   ├── db-connect.md       # /db-connect
│   ├── db-schemas.md       # /db-schemas
│   ├── db-tables.md        # /db-tables
│   ├── db-describe.md      # /db-describe
│   ├── db-preview.md       # /db-preview
│   ├── db-query.md         # /db-query
│   ├── db-counts.md        # /db-counts
│   ├── dbt-run.md          # /dbt-run
│   ├── new-entity.md       # /new-entity
│   ├── add-attribute.md    # /add-attribute
│   └── add-tests.md        # /add-tests
├── hooks/                  # Lifecycle Hooks
│   ├── pre-tool-call.md    # Vor Tool-Ausführung
│   └── post-tool-call.md   # Nach Tool-Ausführung
└── README.md               # Diese Datei
```

## 🚀 Verwendung

### Slash Commands

Alle Commands starten mit `/` und können Parameter mit `{{PLACEHOLDER}}` enthalten:

```
/create-hub company
/create-satellite product
/new-entity contractor
/db-preview hub_company
```

### Command-Kategorien

| Kategorie | Commands | Beschreibung |
|-----------|----------|--------------|
| **Creation** | `/create-hub`, `/create-satellite`, `/create-link`, `/create-staging`, `/create-eff-sat`, `/create-pit`, `/create-bridge`, `/create-mart`, `/create-ref-table` | Data Vault Objekte erstellen |
| **Discovery** | `/list-entities`, `/entity-info`, `/suggest-attributes`, `/validate`, `/lineage` | Informationen abrufen |
| **Database** | `/db-connect`, `/db-schemas`, `/db-tables`, `/db-describe`, `/db-preview`, `/db-query`, `/db-counts` | Datenbankoperationen |
| **Workflow** | `/dbt-run`, `/new-entity`, `/add-attribute`, `/add-tests` | Entwicklungsworkflows |

## ⚙️ Konfiguration

Die `settings.json` definiert:

- **MCP Server**: Verbindung zu `datavault-agent` auf Port 3001
- **Permissions**: Automatisch erlaubte Tools
- **Context**: Standard-Dokumentation (`CLAUDE.md`, `docs/DEVELOPER.md`)
- **Hooks**: Pre/Post Tool-Call Validierung

## 🔧 Anpassung

### Neuen Command hinzufügen

1. Erstelle Datei in `commands/`:
   ```markdown
   ---
   description: Kurzbeschreibung
   tools: [datavault-agent]
   context:
     - docs/DEVELOPER.md#section
   ---
   
   # Command Name: {{PARAMETER}}
   
   Workflow-Beschreibung...
   ```

2. Registriere in `settings.json` falls nötig

### Hook anpassen

Hooks in `hooks/` werden automatisch bei Tool-Calls ausgeführt:

- `pre-tool-call.md`: Validierung vor Ausführung
- `post-tool-call.md`: Formatierung & nächste Schritte

## 📚 Dokumentation

- [CLAUDE.md](../../CLAUDE.md) - Haupt-Instruktionen
- [docs/DEVELOPER.md](../../docs/DEVELOPER.md) - Entwickler-Doku
- [docs/MODEL_ARCHITECTURE.md](../../docs/MODEL_ARCHITECTURE.md) - Architektur

## 🔗 MCP Server

Der Data Vault Agent läuft auf:
- **URL**: http://10.0.0.25:3001
- **Tools**: 28 verfügbar
- **Auth**: Keine (lokales Netzwerk)

Siehe [agent/README.md](../README.md) für Server-Details.
