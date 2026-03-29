---
applyTo: '**'
---
# Deployment & Versionierung (Confluence ITDATAH "Deployment", "Versionierung")

> Globale Regeln für Deployment-Prozesse und Versionierung.

## Umgebungen (Confluence)

| Umgebung | Zweck | Freigabe |
|----------|-------|----------|
| DEV | Entwicklung, erste Tests | Entwickler |
| TEST | Integrations-/Systemtests | Testmanager |
| PROD | Produktiv | Release Manager |

## Deployment-Prozess

```
DEV → Code Review → Git Merge → TEST → Abnahme → PROD
```

### In dbt:
```bash
# Development
dbt run --target dev

# Test
dbt run --target test

# Production (NUR mit Freigabe!)
dbt run --target prod
```

## Git-Flow (Confluence "Versionierung")

### Branch-Strategie

| Branch | Zweck | Merge-Ziel |
|--------|-------|-----------|
| `main` | Produktiver Stand | - |
| `develop` | Integrationsbranch | `main` |
| `feature/<ticket>-<name>` | Feature-Entwicklung | `develop` |
| `hotfix/<ticket>-<name>` | Produktions-Bugfix | `main` + `develop` |
| `release/<version>` | Release-Vorbereitung | `main` + `develop` |

### Commit-Konventionen

```
<type>(<scope>): <description>

feat(hub): Add hub_mitarbeiter for SAP HCM
fix(staging): Correct BK sorting in sap_co_catsco
docs(readme): Update architecture diagram
refactor(macro): Simplify hash_override
test(sat): Add referential integrity test
```

### Versionierung (Semantic Versioning)

```
MAJOR.MINOR.PATCH
```
- **MAJOR** – Breaking Changes (Schema-Änderung, BK-Änderung)
- **MINOR** – Neue Features (neuer Hub, neuer Satellit)
- **PATCH** – Bugfixes, Korrekturen

## Deployment-Checkliste

### Vor Deploy (Confluence)
1. ☐ Alle dbt Tests erfolgreich (`dbt test`)
2. ☐ Schema YAML aktualisiert (`_<concept>__models.yml`)
3. ☐ ER-Diagramm aktualisiert (`design/raw-vault/<concept>/er-diagram.mmd`)
4. ☐ `dbt compile` erfolgreich
5. ☐ Code Review durchgeführt (Pull Request)
6. ☐ Ghost Records korrekt konfiguriert
7. ☐ Business Key Sortierung alphabetisch
8. ☐ Hash-Regeln eingehalten (SHA2_256, CONVERT, NULL→'-1')

### Nach Deploy
1. ☐ `dbt test` auf Zielumgebung ausführen
2. ☐ Ghost Records vorhanden (1 pro Hub, 1 pro Sat)
3. ☐ Referential Integrity zwischen Sat/Hub/Link prüfen
4. ☐ Record Counts plausibel
5. ☐ dss_record_source korrekt befüllt

## Rollback-Strategie (Confluence)

### Bei fehlgeschlagenem Deploy:
1. Git Revert auf vorherigen Stand
2. `dbt run` mit vorherigem Code
3. Data Vault = Insert-Only → alte Daten bleiben erhalten
4. Bei Schema-Änderungen: Manuelles Cleanup nötig

### dbt-spezifisches Rollback:
```bash
# Letzte Version wiederherstellen
git revert HEAD
dbt run --full-refresh --select <betroffene_models>
```

**ACHTUNG:** `--full-refresh` bei Incremental Models löscht und erstellt die Tabelle neu!

## Release Notes Template

```markdown
# Release v<X.Y.Z>

## Neue Modelle
- hub_<entity> - <Beschreibung>
- sat_<entity>__<system> - <Beschreibung>

## Änderungen
- <Model>: <Was wurde geändert>

## Bugfixes
- <Fix-Beschreibung>

## Breaking Changes
- <Falls vorhanden>

## Migration
- <Schritte falls nötig>
```
