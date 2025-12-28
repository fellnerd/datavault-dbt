/**
 * Menu definitions for the Data Vault Agent CLI
 */

export type MenuAction =
  | 'add_attribute'
  | 'create_entity'
  | 'create_hub'
  | 'create_satellite'
  | 'create_link'
  | 'create_ref_table'
  | 'create_eff_sat'
  | 'create_pit'
  | 'create_mart'
  | 'add_tests'
  | 'exit';

export interface MenuChoice {
  name: string;
  value: MenuAction;
  description?: string;
}

export const MENU_CHOICES: MenuChoice[] = [
  {
    name: '📦 Neues Attribut hinzufügen',
    value: 'add_attribute',
    description: 'Attribut zu bestehendem Satellite hinzufügen',
  },
  {
    name: '🆕 Neue Entity erstellen (komplett)',
    value: 'create_entity',
    description: 'External Table + Staging + Hub + Satellite',
  },
  {
    name: '🏠 Hub erstellen',
    value: 'create_hub',
    description: 'Einzelnen Hub für Business Keys',
  },
  {
    name: '🛰️  Satellite erstellen',
    value: 'create_satellite',
    description: 'Satellite für Attribut-Historie',
  },
  {
    name: '🔗 Link erstellen',
    value: 'create_link',
    description: 'Link zwischen zwei Hubs',
  },
  {
    name: '📚 Reference Table erstellen',
    value: 'create_ref_table',
    description: 'Seed CSV für Lookup-Daten',
  },
  {
    name: '⏱️  Effectivity Satellite erstellen',
    value: 'create_eff_sat',
    description: 'Zeitliche Gültigkeit für Links',
  },
  {
    name: '📊 PIT Table erstellen',
    value: 'create_pit',
    description: 'Point-in-Time Lookup Table',
  },
  {
    name: '👁️  Mart View erstellen',
    value: 'create_mart',
    description: 'Flache View für BI/Reporting',
  },
  {
    name: '🧪 Tests hinzufügen',
    value: 'add_tests',
    description: 'Tests zu schema.yml hinzufügen',
  },
  {
    name: '❌ Beenden',
    value: 'exit',
    description: 'Agent beenden',
  },
];

export const ACTION_DESCRIPTIONS: Record<MenuAction, string> = {
  add_attribute: `
Fügt ein neues Attribut zu einem bestehenden Satellite hinzu.
Schritte:
1. External Table (sources.yml) erweitern
2. Staging View erweitern
3. Satellite erweitern
4. Optional: Hash Diff aktualisieren
`,
  create_entity: `
Erstellt eine komplett neue Entity mit allen Komponenten.
Schritte:
1. External Table in sources.yml definieren
2. Staging View erstellen (stg_<entity>.sql)
3. Hub erstellen (hub_<entity>.sql)
4. Satellite erstellen (sat_<entity>.sql)
5. Tests in schema.yml hinzufügen
`,
  create_hub: `
Erstellt einen einzelnen Hub für Business Keys.
Ein Hub speichert eindeutige Business Keys und ist insert-only.
`,
  create_satellite: `
Erstellt einen Satellite für Attribut-Historie.
Satellites speichern Änderungen an Attributen mit vollständiger Historie.
`,
  create_link: `
Erstellt einen Link zwischen zwei Hubs.
Links modellieren Beziehungen zwischen Business Entities.
`,
  create_ref_table: `
Erstellt eine Reference Table als dbt Seed (CSV).
Ideal für Lookup-Daten wie Status-Codes, Rollen, etc.
`,
  create_eff_sat: `
Erstellt einen Effectivity Satellite für zeitliche Link-Gültigkeit.
Trackt wann eine Beziehung aktiv/inaktiv war.
`,
  create_pit: `
Erstellt eine Point-in-Time (PIT) Table.
Optimiert historische Abfragen über mehrere Satellites.
`,
  create_mart: `
Erstellt eine Mart View für BI/Reporting.
Flache, denormalisierte View für einfachen Zugriff.
`,
  add_tests: `
Fügt dbt Tests zu schema.yml hinzu.
Unterstützt: not_null, unique, relationships, accepted_values.
`,
  exit: '',
};
