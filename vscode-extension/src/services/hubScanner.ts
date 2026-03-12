import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Scan the project for existing hub models
 * Returns a list of hub names with concept like ['jira.hub_company', 'adventureworks.hub_customer', ...]
 */
export async function scanForExistingHubs(projectPath: string): Promise<string[]> {
  const hubs: string[] = [];
  
  try {
    // Look in models/raw_vault/**/hubs/hub_*.sql
    const rawVaultPath = path.join(projectPath, 'models', 'raw_vault');
    
    if (!fs.existsSync(rawVaultPath)) {
      return hubs;
    }

    // Find all hub files recursively
    const hubFiles = await findHubFiles(rawVaultPath);
    
    for (const filePath of hubFiles) {
      const fileName = path.basename(filePath, '.sql');
      if (fileName.startsWith('hub_')) {
        // Extract concept from path (e.g., models/raw_vault/jira/hubs/hub_company.sql -> jira)
        const pathParts = filePath.split(path.sep);
        const hubsIndex = pathParts.indexOf('hubs');
        const concept = hubsIndex > 0 ? pathParts[hubsIndex - 1] : '_common';
        
        // Format: concept.hub_name
        hubs.push(`${concept}.${fileName}`);
      }
    }

    // Sort alphabetically
    hubs.sort();
    
  } catch (error) {
    console.error('Error scanning for hubs:', error);
  }

  return hubs;
}

/**
 * Recursively find hub SQL files
 */
async function findHubFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Check if it's a 'hubs' directory
        if (entry.name === 'hubs') {
          // Get all SQL files in this directory
          const hubDir = fs.readdirSync(fullPath);
          for (const hubFile of hubDir) {
            if (hubFile.endsWith('.sql') && hubFile.startsWith('hub_')) {
              files.push(path.join(fullPath, hubFile));
            }
          }
        } else {
          // Recurse into subdirectories
          const subFiles = await findHubFiles(fullPath);
          files.push(...subFiles);
        }
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }

  return files;
}

/**
 * Get hub info from a hub SQL file
 */
export interface HubFileInfo {
  name: string;
  path: string;
  concept: string;
  businessKeys: string[];
}

/**
 * Parse a hub SQL file to extract metadata
 */
export async function parseHubFile(filePath: string): Promise<HubFileInfo | null> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath, '.sql');
    
    // Extract concept from path (e.g., models/raw_vault/jira/hubs/hub_company.sql -> jira)
    const pathParts = filePath.split(path.sep);
    const hubsIndex = pathParts.indexOf('hubs');
    const concept = hubsIndex > 0 ? pathParts[hubsIndex - 1] : '_common';
    
    // Try to extract business keys from the SQL
    // Look for patterns like: object_id, company_id, etc. after SELECT
    const businessKeys: string[] = [];
    
    // Simple regex to find columns after hk_* column
    const selectMatch = content.match(/SELECT\s+DISTINCT[\s\S]*?FROM/i);
    if (selectMatch) {
      // Look for column names that are not hashes or metadata
      const columnMatches = selectMatch[0].matchAll(/^\s*(\w+)\s*,?\s*(?:--|$)/gm);
      for (const match of columnMatches) {
        const col = match[1];
        if (!col.startsWith('hk_') && !col.startsWith('dss_') && !col.startsWith('hd_')) {
          businessKeys.push(col);
        }
      }
    }

    return {
      name: fileName,
      path: filePath,
      concept,
      businessKeys
    };
  } catch (error) {
    console.error(`Error parsing hub file ${filePath}:`, error);
    return null;
  }
}
