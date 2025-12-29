/**
 * Menu definitions for the Data Vault Agent CLI
 */

export type MenuAction =
  | 'browse_objects'
  | 'deploy_models'
  | 'edit_object'
  | 'delete_object'
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
    name: '[B] Bestehende Objekte anzeigen',
    value: 'browse_objects',
    description: 'Models, Hubs, Satellites, Views erkunden',
  },
  {
    name: '[D] Models deployen',
    value: 'deploy_models',
    description: 'Einzelne oder alle Models ausfuehren',
  },
  {
    name: '[~] Objekt bearbeiten',
    value: 'edit_object',
    description: 'Staging, Hub, Satellite, Link bearbeiten',
  },
  {
    name: '[-] Objekt loeschen',
    value: 'delete_object',
    description: 'Model-Datei loeschen (mit Bestaetigung)',
  },
  {
    name: '[+] Neues Attribut hinzufuegen',
    value: 'add_attribute',
    description: 'Attribut zu bestehendem Satellite hinzufuegen',
  },
  {
    name: '[E] Neue Entity erstellen (komplett)',
    value: 'create_entity',
    description: 'External Table + Staging + Hub + Satellite',
  },
  {
    name: '[H] Hub erstellen',
    value: 'create_hub',
    description: 'Wizard: Business Keys definieren',
  },
  {
    name: '[S] Satellite erstellen',
    value: 'create_satellite',
    description: 'Wizard: Attribute zu Hub hinzufuegen',
  },
  {
    name: '[L] Link erstellen',
    value: 'create_link',
    description: 'Wizard: Hubs verbinden',
  },
  {
    name: '[R] Reference Table erstellen',
    value: 'create_ref_table',
    description: 'Seed CSV fuer Lookup-Daten',
  },
  {
    name: '[F] Effectivity Satellite erstellen',
    value: 'create_eff_sat',
    description: 'Zeitliche Gueltigkeit fuer Links',
  },
  {
    name: '[P] PIT Table erstellen',
    value: 'create_pit',
    description: 'Point-in-Time Lookup Table',
  },
  {
    name: '[M] Mart View erstellen',
    value: 'create_mart',
    description: 'Wizard: BI/Reporting View',
  },
  {
    name: '[T] Tests hinzufuegen',
    value: 'add_tests',
    description: 'Tests zu schema.yml hinzufuegen',
  },
  {
    name: '[X] Beenden',
    value: 'exit',
    description: 'Agent beenden',
  },
];

export const ACTION_DESCRIPTIONS: Record<MenuAction, string> = {
  browse_objects: `
Zeigt alle bestehenden Objekte im Projekt an:
• Staging Views (stg_*)
• Raw Vault: Hubs, Satellites, Links
• Business Vault: PITs, Bridges
• Mart Views fuer Reporting
`,
  deploy_models: `
Fuehrt dbt run fuer ausgewaehlte Models aus.
Optionen:
• Einzelnes Model auswaehlen
• Mehrere Models auswaehlen
• Alle nicht-deployed Models
• Nach Layer (staging, raw_vault, mart)
`,
  edit_object: `
Bearbeitet ein bestehendes dbt Model.
Die AI liest das aktuelle Model und hilft bei Aenderungen:
• Spalten hinzufuegen/entfernen
• SQL-Logik anpassen
• Hash-Berechnungen korrigieren
`,
  delete_object: `
Loescht ein dbt Model.
ACHTUNG: Diese Aktion kann nicht rueckgaengig gemacht werden!
Nach dem Loeschen werden Referenzen geprueft.
`,
  add_attribute: `
Fuegt ein neues Attribut zu einem bestehenden Satellite hinzu.
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
5. Tests in schema.yml hinzufuegen
`,
  // Wizard-based actions - no description needed, wizard provides guidance
  create_hub: '',
  create_satellite: '',
  create_link: '',
  create_mart: '',
  
  create_ref_table: `
Erstellt eine Reference Table als dbt Seed (CSV).
Ideal fuer Lookup-Daten wie Status-Codes, Rollen, etc.
`,
  create_eff_sat: `
Erstellt einen Effectivity Satellite fuer zeitliche Link-Gueltigkeit.
Trackt wann eine Beziehung aktiv/inaktiv war.
`,
  create_pit: `
Erstellt eine Point-in-Time (PIT) Table.
Optimiert historische Abfragen ueber mehrere Satellites.
`,
  add_tests: `
Fuegt dbt Tests zu schema.yml hinzu.
Unterstuetzt: not_null, unique, relationships, accepted_values.
`,
  exit: '',};