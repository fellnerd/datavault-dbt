---
description: 'Erstellt einen Data Vault Link zwischen Hubs (Standard, DC, Hierarchy, Same-as) inkl. Staging-Update, Link Satellite und Dokumentation.'
mode: 'agent'
tools: ['changes', 'editFiles', 'problems', 'runCommands', 'search', 'terminalLastCommand']
---
# Neuen Data Vault Link erstellen

Du bist ein Data Vault 2.0 Entwickler. Erstelle einen Link nach Confluence ITDATAH §2.2.

## Kontext

Lies zuerst:
- `.github/instructions/dbt-link.instructions.md` (Link-Regeln)
- `.github/instructions/dbt-staging.instructions.md` (Hash-Berechnung)
- `.github/copilot/skills/create-dv-link/SKILL.md` (Workflow-Details)

## Frage den User nach

1. **Link-Typ** — Standard / DC / Hierarchy / Same-as
2. **Beteiligte Hubs** — Welche Hubs werden verbunden? (min. 2, außer DC: 1)
3. **Konzept** — In welchem Concept-Ordner?
4. **DC-Spalten** (falls DC) — Welche Spalten bilden den Dependent Child Key?
5. **Quell-Staging** — Welche bestehende Staging View enthält die Beziehung?

## Workflow (nach Link-Typ)

### Standard Link
1. **Staging aktualisieren**: `hk_link_{hub1}_{hub2}` Hash hinzufügen (alle BKs beider Hubs)
2. **Link erstellen**: `models/raw_vault/{concept}/links/link_{hub1}_{hub2}.sql`
   - `src_fk = ['hk_{hub1}', 'hk_{hub2}']`
3. **Doku**: Schema YAML + ER-Diagramm

### DC Link (Dependent Child)
1. **Staging aktualisieren**: `hk_link_{dc}_{parent}`, `hd_{dc}_{parent}__dc` Hashes
2. **DC Link**: `link_{dc}_{parent}.sql` — nur 1 FK (`hk_{parent}`)
3. **DC Satellite**: `sat_{dc}_{parent}__dc.sql` — DCK-Spalten im Payload
4. **Doku**: Schema YAML + ER-Diagramm

### Hierarchy Link
1. **Staging**: Parent + Child HK des gleichen Hubs
2. **Link**: `link_{entity}_hierarchy.sql`
3. **Doku**

### Same-as Link
1. **Staging**: Mapping-Keys für gleiches Geschäftsobjekt
2. **Link**: `link_{entity}_sameas.sql`
3. **Doku**

## Validierungs-Checkliste

- [ ] Link verbindet min. 2 Hubs (außer DC: 1)
- [ ] Kein Link-on-Link
- [ ] Alle FK-Hashes in Staging berechnet
- [ ] Link HK enthält ALLE BK-Spalten der beteiligten Hubs
- [ ] NULL FKs → Zero Key ('-1')
- [ ] Schema YAML mit relationship Tests
- [ ] ER-Diagramm aktualisiert
- [ ] `dbt compile` erfolgreich

## Regeln

- **KEINE** `dbt run` ohne User-Zustimmung
- DC Sat Naming: `sat_{hub}__{system}__dc` (doppelter Underscore)
- n:m Beziehungen immer (Data Vault Prinzip)
