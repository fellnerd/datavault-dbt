/**
 * Database Tools - Read-only access to Azure SQL Database
 * 
 * Tools:
 * - db_test_connection: Test database connectivity
 * - db_list_schemas: List all schemas
 * - db_list_tables: List tables/views in a schema
 * - db_describe_table: Show table structure
 * - db_preview_data: Preview top N rows
 * - db_run_query: Execute read-only SELECT queries
 * - db_get_row_counts: Get row counts for Data Vault tables
 */

import type Anthropic from '@anthropic-ai/sdk';
import {
  testConnection,
  executeReadOnlyQuery,
  getAvailableTargets,
  isReadOnlyQuery,
  type QueryResult,
} from './dbConnection.js';

// ============================================================================
// Tool: Test Connection
// ============================================================================

export const dbTestConnectionTool: Anthropic.Messages.Tool = {
  name: 'db_test_connection',
  description: `Testet die Verbindung zur Azure SQL Datenbank.
Zeigt Server-Version, Datenbank und Login-Informationen.

Targets (aus ~/.dbt/profiles.yml):
- dev: Vault (Entwicklung)
- werkportal: Vault_Werkportal (Produktion)`,
  input_schema: {
    type: 'object' as const,
    properties: {
      target: {
        type: 'string',
        description: 'dbt Target (dev, werkportal). Standard: dev',
      },
    },
    required: [],
  },
};

export async function handleDbTestConnection(input: { target?: string }): Promise<string> {
  const target = input.target || 'dev';
  const result = await testConnection(target);
  
  if (result.success) {
    return `# ✅ Verbindung erfolgreich

| Eigenschaft | Wert |
|-------------|------|
| Target | ${target} |
| Datenbank | ${result.database} |
| Server | ${result.serverVersion} |
| Status | ${result.message} |`;
  } else {
    return `# ❌ Verbindung fehlgeschlagen

**Target:** ${target}
**Fehler:** ${result.message}`;
  }
}

// ============================================================================
// Tool: List Schemas
// ============================================================================

export const dbListSchemasTool: Anthropic.Messages.Tool = {
  name: 'db_list_schemas',
  description: `Listet alle Schemas in der Datenbank auf.
Zeigt Schema-Name, Anzahl Tabellen und Anzahl Views.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      target: {
        type: 'string',
        description: 'dbt Target (dev, werkportal). Standard: dev',
      },
    },
    required: [],
  },
};

export async function handleDbListSchemas(input: { target?: string }): Promise<string> {
  const target = input.target || 'dev';
  
  const result = await executeReadOnlyQuery(`
    SELECT 
      s.name AS schema_name,
      COUNT(DISTINCT CASE WHEN t.type = 'U' THEN t.name END) AS table_count,
      COUNT(DISTINCT CASE WHEN t.type = 'V' THEN t.name END) AS view_count
    FROM sys.schemas s
    LEFT JOIN sys.objects t ON s.schema_id = t.schema_id AND t.type IN ('U', 'V')
    WHERE s.name NOT IN ('sys', 'INFORMATION_SCHEMA', 'guest')
    GROUP BY s.name
    ORDER BY s.name
  `, target);
  
  let output = `# 📂 Schemas in ${target}\n\n`;
  output += `| Schema | Tabellen | Views |\n`;
  output += `|--------|----------|-------|\n`;
  
  for (const row of result.rows) {
    output += `| ${row.schema_name} | ${row.table_count} | ${row.view_count} |\n`;
  }
  
  return output;
}

// ============================================================================
// Tool: List Tables
// ============================================================================

export const dbListTablesTool: Anthropic.Messages.Tool = {
  name: 'db_list_tables',
  description: `Listet alle Tabellen und Views in einem Schema auf.
Zeigt Name, Typ (TABLE/VIEW), Spaltenanzahl und ca. Zeilenanzahl.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      schema: {
        type: 'string',
        description: 'Schema-Name (z.B. "vault", "stg", "mart")',
      },
      type: {
        type: 'string',
        enum: ['all', 'tables', 'views'],
        description: 'Filter nach Typ. Standard: all',
      },
      target: {
        type: 'string',
        description: 'dbt Target. Standard: dev',
      },
    },
    required: ['schema'],
  },
};

export async function handleDbListTables(input: {
  schema: string;
  type?: 'all' | 'tables' | 'views';
  target?: string;
}): Promise<string> {
  const { schema, type = 'all', target = 'dev' } = input;
  
  let typeFilter = "t.type IN ('U', 'V')";
  if (type === 'tables') typeFilter = "t.type = 'U'";
  if (type === 'views') typeFilter = "t.type = 'V'";
  
  const result = await executeReadOnlyQuery(`
    SELECT 
      t.name AS object_name,
      CASE t.type WHEN 'U' THEN 'TABLE' WHEN 'V' THEN 'VIEW' END AS object_type,
      (SELECT COUNT(*) FROM sys.columns c WHERE c.object_id = t.object_id) AS column_count,
      ISNULL(p.rows, 0) AS approx_rows
    FROM sys.objects t
    JOIN sys.schemas s ON t.schema_id = s.schema_id
    LEFT JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0, 1)
    WHERE s.name = '${schema}' AND ${typeFilter}
    ORDER BY t.type, t.name
  `, target);
  
  if (result.rowCount === 0) {
    return `# 📂 ${schema}\n\nKeine Objekte gefunden.`;
  }
  
  let output = `# 📂 Schema: ${schema}\n\n`;
  output += `| Name | Typ | Spalten | ~Zeilen |\n`;
  output += `|------|-----|---------|--------|\n`;
  
  for (const row of result.rows) {
    const icon = row.object_type === 'TABLE' ? '📋' : '👁️';
    output += `| ${icon} ${row.object_name} | ${row.object_type} | ${row.column_count} | ${Number(row.approx_rows).toLocaleString()} |\n`;
  }
  
  output += `\n*${result.rowCount} Objekte gefunden*`;
  
  return output;
}

// ============================================================================
// Tool: Describe Table
// ============================================================================

export const dbDescribeTableTool: Anthropic.Messages.Tool = {
  name: 'db_describe_table',
  description: `Zeigt die Struktur einer Tabelle oder View.
Listet alle Spalten mit Datentyp, Nullable, und Default-Werten.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      schema: {
        type: 'string',
        description: 'Schema-Name',
      },
      table: {
        type: 'string',
        description: 'Tabellen- oder View-Name',
      },
      target: {
        type: 'string',
        description: 'dbt Target. Standard: dev',
      },
    },
    required: ['schema', 'table'],
  },
};

export async function handleDbDescribeTable(input: {
  schema: string;
  table: string;
  target?: string;
}): Promise<string> {
  const { schema, table, target = 'dev' } = input;
  
  const result = await executeReadOnlyQuery(`
    SELECT 
      c.name AS column_name,
      TYPE_NAME(c.user_type_id) AS data_type,
      CASE 
        WHEN TYPE_NAME(c.user_type_id) IN ('varchar', 'nvarchar', 'char', 'nchar') 
        THEN CASE WHEN c.max_length = -1 THEN 'MAX' ELSE CAST(c.max_length AS VARCHAR) END
        WHEN TYPE_NAME(c.user_type_id) IN ('decimal', 'numeric')
        THEN CAST(c.precision AS VARCHAR) + ',' + CAST(c.scale AS VARCHAR)
        ELSE NULL
      END AS type_detail,
      CASE WHEN c.is_nullable = 1 THEN 'YES' ELSE 'NO' END AS nullable,
      CASE WHEN pk.column_id IS NOT NULL THEN 'PK' ELSE '' END AS is_pk,
      OBJECT_DEFINITION(c.default_object_id) AS default_value
    FROM sys.columns c
    JOIN sys.objects t ON c.object_id = t.object_id
    JOIN sys.schemas s ON t.schema_id = s.schema_id
    LEFT JOIN (
      SELECT ic.object_id, ic.column_id
      FROM sys.index_columns ic
      JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
      WHERE i.is_primary_key = 1
    ) pk ON c.object_id = pk.object_id AND c.column_id = pk.column_id
    WHERE s.name = '${schema}' AND t.name = '${table}'
    ORDER BY c.column_id
  `, target);
  
  if (result.rowCount === 0) {
    return `# ❌ Tabelle nicht gefunden\n\n\`${schema}.${table}\` existiert nicht.`;
  }
  
  let output = `# 📋 ${schema}.${table}\n\n`;
  output += `| # | Spalte | Datentyp | Nullable | PK |\n`;
  output += `|---|--------|----------|----------|----|\n`;
  
  let i = 1;
  for (const row of result.rows) {
    const dataType = row.type_detail 
      ? `${row.data_type}(${row.type_detail})`
      : row.data_type;
    output += `| ${i++} | ${row.column_name} | ${dataType} | ${row.nullable} | ${row.is_pk} |\n`;
  }
  
  output += `\n*${result.rowCount} Spalten*`;
  
  return output;
}

// ============================================================================
// Tool: Preview Data
// ============================================================================

export const dbPreviewDataTool: Anthropic.Messages.Tool = {
  name: 'db_preview_data',
  description: `Zeigt eine Vorschau der Daten (TOP N Zeilen).
Nützlich um die Datenstruktur und Inhalte zu verstehen.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      schema: {
        type: 'string',
        description: 'Schema-Name',
      },
      table: {
        type: 'string',
        description: 'Tabellen- oder View-Name',
      },
      limit: {
        type: 'number',
        description: 'Anzahl Zeilen (max 100). Standard: 10',
      },
      columns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Spezifische Spalten (optional, sonst alle)',
      },
      where: {
        type: 'string',
        description: 'WHERE-Bedingung (optional, z.B. "dss_is_current = \'Y\'")',
      },
      target: {
        type: 'string',
        description: 'dbt Target. Standard: dev',
      },
    },
    required: ['schema', 'table'],
  },
};

export async function handleDbPreviewData(input: {
  schema: string;
  table: string;
  limit?: number;
  columns?: string[];
  where?: string;
  target?: string;
}): Promise<string> {
  const { schema, table, limit = 10, columns, where, target = 'dev' } = input;
  
  const safeLimit = Math.min(limit, 100);
  const columnList = columns && columns.length > 0 ? columns.join(', ') : '*';
  const whereClause = where ? `WHERE ${where}` : '';
  
  const query = `SELECT TOP ${safeLimit} ${columnList} FROM [${schema}].[${table}] ${whereClause}`;
  
  // Double-check it's read-only
  if (!isReadOnlyQuery(query)) {
    return `# ❌ Ungültige Abfrage\n\nNur SELECT-Abfragen sind erlaubt.`;
  }
  
  try {
    const result = await executeReadOnlyQuery(query, target);
    
    if (result.rowCount === 0) {
      return `# 📋 ${schema}.${table}\n\nKeine Daten gefunden.`;
    }
    
    let output = `# 📋 ${schema}.${table}\n\n`;
    
    // Create markdown table
    const cols = result.columns;
    output += `| ${cols.join(' | ')} |\n`;
    output += `| ${cols.map(() => '---').join(' | ')} |\n`;
    
    for (const row of result.rows) {
      const values = cols.map(col => {
        const val = row[col];
        if (val === null) return '*NULL*';
        if (typeof val === 'object') return JSON.stringify(val).substring(0, 50);
        const str = String(val);
        return str.length > 50 ? str.substring(0, 47) + '...' : str;
      });
      output += `| ${values.join(' | ')} |\n`;
    }
    
    output += `\n*${result.rowCount} Zeilen (${result.executionTime}ms)*`;
    
    return output;
  } catch (error) {
    return `# ❌ Fehler\n\n${error instanceof Error ? error.message : String(error)}`;
  }
}

// ============================================================================
// Tool: Run Query
// ============================================================================

export const dbRunQueryTool: Anthropic.Messages.Tool = {
  name: 'db_run_query',
  description: `Führt eine READ-ONLY SQL-Abfrage aus.
⚠️ Nur SELECT-Statements sind erlaubt!
INSERT, UPDATE, DELETE, DROP etc. werden blockiert.

Für komplexe Abfragen mit JOINs, CTEs, Aggregationen etc.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'SQL SELECT-Statement',
      },
      target: {
        type: 'string',
        description: 'dbt Target. Standard: dev',
      },
    },
    required: ['query'],
  },
};

export async function handleDbRunQuery(input: {
  query: string;
  target?: string;
}): Promise<string> {
  const { query, target = 'dev' } = input;
  
  // Safety check
  if (!isReadOnlyQuery(query)) {
    return `# ❌ Abfrage blockiert

Nur **SELECT**-Abfragen sind erlaubt.
Die folgende Abfrage enthält verbotene Operationen:

\`\`\`sql
${query}
\`\`\`

Verbotene Keywords: INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, EXEC, MERGE, etc.`;
  }
  
  try {
    const result = await executeReadOnlyQuery(query, target);
    
    if (result.rowCount === 0) {
      return `# 📊 Query Result\n\nKeine Ergebnisse.\n\n*Ausführungszeit: ${result.executionTime}ms*`;
    }
    
    let output = `# 📊 Query Result\n\n`;
    
    // Create markdown table
    const cols = result.columns;
    output += `| ${cols.join(' | ')} |\n`;
    output += `| ${cols.map(() => '---').join(' | ')} |\n`;
    
    for (const row of result.rows) {
      const values = cols.map(col => {
        const val = row[col];
        if (val === null) return '*NULL*';
        if (typeof val === 'object') return JSON.stringify(val).substring(0, 50);
        const str = String(val);
        return str.length > 80 ? str.substring(0, 77) + '...' : str;
      });
      output += `| ${values.join(' | ')} |\n`;
    }
    
    output += `\n*${result.rowCount} Zeilen (${result.executionTime}ms)*`;
    
    return output;
  } catch (error) {
    return `# ❌ Query Error\n\n\`\`\`\n${error instanceof Error ? error.message : String(error)}\n\`\`\`\n\n**Query:**\n\`\`\`sql\n${query}\n\`\`\``;
  }
}

// ============================================================================
// Tool: Get Row Counts (Data Vault specific)
// ============================================================================

export const dbGetRowCountsTool: Anthropic.Messages.Tool = {
  name: 'db_get_row_counts',
  description: `Zeigt Zeilenzahlen für Data Vault Tabellen.
Nützlich für Validierung nach dbt run.
Zeigt Hubs, Satellites und Links mit Current/Total Counts.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      target: {
        type: 'string',
        description: 'dbt Target. Standard: dev',
      },
    },
    required: [],
  },
};

export async function handleDbGetRowCounts(input: { target?: string }): Promise<string> {
  const target = input.target || 'dev';
  
  const result = await executeReadOnlyQuery(`
    SELECT 
      s.name AS schema_name,
      t.name AS table_name,
      CASE 
        WHEN t.name LIKE 'hub_%' THEN 'Hub'
        WHEN t.name LIKE 'sat_%' OR t.name LIKE 'eff_sat_%' THEN 'Satellite'
        WHEN t.name LIKE 'link_%' THEN 'Link'
        WHEN t.name LIKE 'pit_%' THEN 'PIT'
        WHEN t.name LIKE 'bridge_%' THEN 'Bridge'
        ELSE 'Other'
      END AS dv_type,
      p.rows AS total_rows
    FROM sys.tables t
    JOIN sys.schemas s ON t.schema_id = s.schema_id
    JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0, 1)
    WHERE s.name IN ('vault', 'stg')
      AND (t.name LIKE 'hub_%' OR t.name LIKE 'sat_%' OR t.name LIKE 'eff_sat_%' 
           OR t.name LIKE 'link_%' OR t.name LIKE 'pit_%' OR t.name LIKE 'bridge_%')
    ORDER BY 
      CASE 
        WHEN t.name LIKE 'hub_%' THEN 1
        WHEN t.name LIKE 'link_%' THEN 2
        WHEN t.name LIKE 'sat_%' OR t.name LIKE 'eff_sat_%' THEN 3
        WHEN t.name LIKE 'pit_%' THEN 4
        WHEN t.name LIKE 'bridge_%' THEN 5
        ELSE 6
      END,
      t.name
  `, target);
  
  if (result.rowCount === 0) {
    return `# 📊 Data Vault Row Counts\n\nKeine Data Vault Tabellen gefunden.`;
  }
  
  let output = `# 📊 Data Vault Row Counts (${target})\n\n`;
  
  // Group by type
  const byType: Record<string, typeof result.rows> = {};
  for (const row of result.rows) {
    const type = row.dv_type as string;
    if (!byType[type]) byType[type] = [];
    byType[type].push(row);
  }
  
  for (const [type, rows] of Object.entries(byType)) {
    const icon = type === 'Hub' ? '🔑' : type === 'Satellite' ? '📋' : type === 'Link' ? '🔗' : '📊';
    output += `## ${icon} ${type}s\n\n`;
    output += `| Tabelle | Zeilen |\n`;
    output += `|---------|--------|\n`;
    
    for (const row of rows) {
      output += `| ${row.schema_name}.${row.table_name} | ${Number(row.total_rows).toLocaleString()} |\n`;
    }
    output += '\n';
  }
  
  return output;
}

// ============================================================================
// Export all tools
// ============================================================================

export const databaseTools = {
  db_test_connection: { tool: dbTestConnectionTool, handler: handleDbTestConnection },
  db_list_schemas: { tool: dbListSchemasTool, handler: handleDbListSchemas },
  db_list_tables: { tool: dbListTablesTool, handler: handleDbListTables },
  db_describe_table: { tool: dbDescribeTableTool, handler: handleDbDescribeTable },
  db_preview_data: { tool: dbPreviewDataTool, handler: handleDbPreviewData },
  db_run_query: { tool: dbRunQueryTool, handler: handleDbRunQuery },
  db_get_row_counts: { tool: dbGetRowCountsTool, handler: handleDbGetRowCounts },
};
