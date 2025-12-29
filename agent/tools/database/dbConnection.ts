/**
 * Database Connection Manager
 * 
 * Provides read-only access to Azure SQL Database.
 * Uses connection pooling and enforces read-only queries.
 */

import sql from 'mssql';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Cache for connection pool
let pool: sql.ConnectionPool | null = null;
let currentTarget: string | null = null;

// Dangerous SQL patterns that could modify data
const WRITE_PATTERNS = [
  /\bINSERT\b/i,
  /\bUPDATE\b/i,
  /\bDELETE\b/i,
  /\bDROP\b/i,
  /\bCREATE\b/i,
  /\bALTER\b/i,
  /\bTRUNCATE\b/i,
  /\bEXEC\b/i,
  /\bEXECUTE\b/i,
  /\bMERGE\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
  /\bDENY\b/i,
  /\bBULK\s+INSERT\b/i,
  /\bOPENROWSET\b/i,
  /\bOPENQUERY\b/i,
  /\bxp_/i,
  /\bsp_/i,
];

export interface DbConfig {
  server: string;
  port: number;
  database: string;
  user: string;
  password: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTime: number;
}

/**
 * Load database configuration from dbt profiles.yml
 */
export async function loadDbConfig(target: string = 'dev'): Promise<DbConfig> {
  const profilesPath = path.join(process.env.HOME || '', '.dbt', 'profiles.yml');
  
  try {
    const content = await fs.readFile(profilesPath, 'utf-8');
    const profiles = parseYaml(content);
    
    const output = profiles?.datavault?.outputs?.[target];
    if (!output) {
      throw new Error(`Target '${target}' not found in profiles.yml`);
    }
    
    return {
      server: output.server,
      port: output.port || 1433,
      database: output.database,
      user: output.user,
      password: output.password,
      encrypt: output.encrypt ?? true,
      trustServerCertificate: output.trust_cert ?? false,
    };
  } catch (error) {
    throw new Error(`Failed to load dbt profile: ${error}`);
  }
}

/**
 * Get or create connection pool
 */
export async function getConnection(target: string = 'dev'): Promise<sql.ConnectionPool> {
  // Return existing pool if same target
  if (pool && pool.connected && currentTarget === target) {
    return pool;
  }
  
  // Close existing pool if different target
  if (pool) {
    await pool.close();
    pool = null;
  }
  
  const config = await loadDbConfig(target);
  
  pool = new sql.ConnectionPool({
    server: config.server,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    options: {
      encrypt: config.encrypt,
      trustServerCertificate: config.trustServerCertificate,
    },
    connectionTimeout: 30000,
    requestTimeout: 60000,
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  });
  
  await pool.connect();
  currentTarget = target;
  
  return pool;
}

/**
 * Close connection pool
 */
export async function closeConnection(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
    currentTarget = null;
  }
}

/**
 * Check if query is read-only (SELECT only)
 */
export function isReadOnlyQuery(query: string): boolean {
  // Remove comments
  const cleanQuery = query
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();
  
  // Check for dangerous patterns
  for (const pattern of WRITE_PATTERNS) {
    if (pattern.test(cleanQuery)) {
      return false;
    }
  }
  
  // Must start with SELECT, WITH (CTE), or be a system query
  const startsWithSelect = /^\s*(SELECT|WITH)\b/i.test(cleanQuery);
  const isSystemQuery = /^\s*sp_help/i.test(cleanQuery);
  
  return startsWithSelect || isSystemQuery;
}

/**
 * Execute a read-only query
 */
export async function executeReadOnlyQuery(
  query: string, 
  target: string = 'dev'
): Promise<QueryResult> {
  // Safety check
  if (!isReadOnlyQuery(query)) {
    throw new Error('Only SELECT queries are allowed. Write operations are blocked for safety.');
  }
  
  const startTime = Date.now();
  const conn = await getConnection(target);
  
  const result = await conn.request().query(query);
  
  const columns = result.recordset?.columns 
    ? Object.keys(result.recordset.columns)
    : (result.recordset?.length > 0 ? Object.keys(result.recordset[0]) : []);
  
  return {
    columns,
    rows: result.recordset || [],
    rowCount: result.recordset?.length || 0,
    executionTime: Date.now() - startTime,
  };
}

/**
 * Test database connection
 */
export async function testConnection(target: string = 'dev'): Promise<{
  success: boolean;
  message: string;
  serverVersion?: string;
  database?: string;
}> {
  try {
    const conn = await getConnection(target);
    
    const result = await conn.request().query(`
      SELECT 
        @@VERSION as version,
        DB_NAME() as database_name,
        SUSER_NAME() as login_name
    `);
    
    const row = result.recordset[0];
    const versionMatch = row.version.match(/Microsoft SQL Azure.*$/m);
    
    return {
      success: true,
      message: `Connected to ${row.database_name} as ${row.login_name}`,
      serverVersion: versionMatch ? versionMatch[0] : row.version.split('\n')[0],
      database: row.database_name,
    };
  } catch (error) {
    return {
      success: false,
      message: `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Get available targets from profiles.yml
 */
export async function getAvailableTargets(): Promise<string[]> {
  const profilesPath = path.join(process.env.HOME || '', '.dbt', 'profiles.yml');
  
  try {
    const content = await fs.readFile(profilesPath, 'utf-8');
    const profiles = parseYaml(content);
    
    return Object.keys(profiles?.datavault?.outputs || {});
  } catch {
    return ['dev'];
  }
}
