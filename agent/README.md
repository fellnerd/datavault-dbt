# Data Vault dbt Agent 🤖

Ein Claude-powered CLI-Assistent für die Entwicklung von Data Vault 2.1 Modellen mit dbt.

## Features

- **Interaktives Menü** mit Pfeil-Tasten-Navigation
- **Automatische Model-Generierung** basierend auf Projektkonventionen
- **Claude AI Integration** für intelligente Aufgabenbearbeitung
- **10 Entwicklungsaufgaben:**
  1. Neues Attribut hinzufügen
  2. Neue Entity erstellen (komplett)
  3. Hub erstellen
  4. Satellite erstellen
  5. Link erstellen
  6. Reference Table erstellen
  7. Effectivity Satellite erstellen
  8. PIT Table erstellen
  9. Mart View erstellen
  10. Tests hinzufügen

## Installation

```bash
# Im agent/ Verzeichnis
cd agent
npm install

# API Key konfigurieren
cp .env.example .env
# Dann .env bearbeiten und ANTHROPIC_API_KEY eintragen
```

## Verwendung

```bash
# Agent starten
cd agent
npm start

# Oder aus dem Projekt-Root:
cd ~/projects/datavault-dbt
npm run agent
```

## Menü-Navigation

```
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🏗️  Data Vault 2.1 dbt Agent                                ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

? Was möchtest du tun? (Use arrow keys)
❯ 📦 Neues Attribut hinzufügen
  🆕 Neue Entity erstellen (komplett)
  🏠 Hub erstellen
  🛰️  Satellite erstellen
  🔗 Link erstellen
  📚 Reference Table erstellen
  ⏱️  Effectivity Satellite erstellen
  📊 PIT Table erstellen
  👁️  Mart View erstellen
  🧪 Tests hinzufügen
  ❌ Beenden
```

## Beispiel: Hub erstellen

```
? Was möchtest du tun? 🏠 Hub erstellen
? Beschreibe deine Anforderung: Erstelle einen Hub für Products mit object_id als Business Key

🤖 Agent arbeitet...

  ⚙️  Tool: create_hub
     {
       "entityName": "product",
       "businessKeyColumns": ["object_id"],
       "sourceModel": "stg_product"
     }

  ▶ Executing create_hub...
  ✅ Hub erstellt: models/raw_vault/hubs/hub_product.sql

Nächste Schritte:
1. Tests zu models/schema.yml hinzufügen
2. External Table prüfen: dbt run-operation stage_external_sources
3. Hub bauen: dbt run --select hub_product
4. Tests ausführen: dbt test --select hub_product

✅ Aufgabe abgeschlossen!
```

## Konfiguration

### Umgebungsvariablen (.env)

```bash
# Pflicht: Anthropic API Key
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx

# Optional: Claude Model (default: claude-sonnet-4-20250514)
CLAUDE_MODEL=claude-sonnet-4-20250514
```

## Architektur

```
agent/
├── index.ts              # Entry Point & Main Loop
├── menu.ts               # Menü-Definitionen
├── agent.ts              # Claude Agent Logik
├── context/
│   └── systemPrompt.ts   # System Prompt mit Projekt-Kontext
├── tools/
│   ├── index.ts          # Tool Registry
│   ├── createHub.ts      # Hub erstellen
│   ├── createSatellite.ts# Satellite erstellen
│   ├── createLink.ts     # Link erstellen
│   ├── createStaging.ts  # Staging View erstellen
│   ├── createRefTable.ts # Reference Table erstellen
│   ├── createEffSat.ts   # Effectivity Satellite erstellen
│   ├── createPIT.ts      # PIT Table erstellen
│   ├── createMart.ts     # Mart View erstellen
│   ├── addTests.ts       # Tests hinzufügen
│   ├── addAttribute.ts   # Attribut hinzufügen
│   ├── readFile.ts       # Dateien lesen
│   └── listFiles.ts      # Verzeichnisse auflisten
└── utils/
    └── fileOperations.ts # Datei-Operationen
```

## Entwicklung

```bash
# Development Mode (Auto-Reload)
npm run dev

# TypeScript kompilieren (optional)
npx tsc
```

## Limitationen

- Erfordert Anthropic API Key (kostenpflichtig)
- External Tables müssen manuell in sources.yml definiert werden
- Bei Schema-Änderungen ist `dbt run --full-refresh` erforderlich

## Troubleshooting

### API Key Fehler
```
❌ Error: ANTHROPIC_API_KEY not found!
```
→ `.env` Datei erstellen mit gültigem API Key

### Rate Limit
```
❌ API Fehler: Rate limit exceeded
```
→ Kurz warten und erneut versuchen

### Model nicht gefunden
```
❌ Staging View stg_xxx.sql nicht gefunden
```
→ Erst Staging View erstellen, dann Hub/Satellite
