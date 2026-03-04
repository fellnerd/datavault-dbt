# Plan: Static Tables für Data Vault 2.1

**TL;DR:** Neue Mart-Schicht mit persistierten Tabellen (keine Suffix-Unterscheidung). Nutzt inkrementelle Materialisierung mit Clustered Index auf Hash Keys. Erweitert Agent um `create_static_table` Tool und Command.

## Steps

1. **Neues Verzeichnis + Schema-Konfiguration** in `dbt_project.yml`
   - Ordner `models/mart/tables/` mit `materialized: incremental` und `incremental_strategy: merge`
   - Schema: `mart_static` für persistierte Tabellen

2. **Post-Hook Macro für Index erstellen** als `macros/create_hash_index.sql`
   - Erstellt Non-Clustered Index auf `hk_*` Spalte nach Model-Build
   - Azure SQL Basic kompatibel (kein Columnstore)

3. **Tool erstellen** als `agent/tools/createStaticTable.ts`
   - Schema-Input: `tableName`, `description`, `baseHub`, `satellites`, `links`, `subfolder`
   - Generiert inkrementelles Model mit `unique_key` und `merge_update_columns`
   - Ruft Post-Hook für Index-Erstellung auf

4. **Tool in Registry registrieren** in `agent/tools/index.ts`
   - Import `createStaticTable` und `createStaticTableTool`
   - Handler in `TOOL_HANDLERS` hinzufügen

5. **Command erstellen** als `agent/.claude/commands/create-static-table.md`
   - Interaktiver Wizard analog zu `create-mart.md`
   - Fragt nach: Tabellenname, Basis-Hub, Satellites, Links, Subfolder

6. **Dokumentation erweitern** in `docs/DEVELOPER.md`
   - Neue Sektion "8. Static Tables (Persistierte Marts)"
   - Wann View vs. Table, Refresh-Strategie, Index-Hinweise

## Further Considerations

1. **Merge vs. Append:** Soll bei Updates ein MERGE (Upsert) oder nur APPEND verwendet werden? Empfehlung: MERGE mit `hk_*` als Key für Delta-Updates

2. **Automatischer Refresh:** Soll ein `dbt run --select tag:static` für alle Static Tables dokumentiert werden?

3. **Bridge Integration:** Sollen Static Tables automatisch von Bridge Tables profitieren können (Multi-Hub-Szenarien)?
