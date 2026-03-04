import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';

/**
 * Shared dbt utilities - consolidated from multiple files
 */

/**
 * Get the dbt executable path for a project
 * Checks settings first, then .venv, then falls back to global dbt
 */
export function getDbtPath(projectPath: string): string {
  // Check settings first
  const config = vscode.workspace.getConfiguration('datavault');
  const configuredPath = config.get<string>('dbtPath', '');
  
  if (configuredPath && fs.existsSync(configuredPath)) {
    return configuredPath;
  }
  
  // Auto-detect: Check .venv in project
  const isWindows = process.platform === 'win32';
  
  // Try multiple possible names on Windows
  if (isWindows) {
    const possiblePaths = [
      path.join(projectPath, '.venv', 'Scripts', 'dbt.exe'),
      path.join(projectPath, '.venv', 'Scripts', 'dbt.cmd'),
      path.join(projectPath, '.venv', 'Scripts', 'dbt.bat'),
    ];
    
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
  } else {
    const venvDbt = path.join(projectPath, '.venv', 'bin', 'dbt');
    if (fs.existsSync(venvDbt)) {
      return venvDbt;
    }
  }
  
  // Fallback to global dbt
  return 'dbt';
}

/**
 * Get the dbt command string (with quotes for paths with spaces)
 */
export function getDbtCommand(projectPath: string): string {
  const dbtPath = getDbtPath(projectPath);
  
  // If it's not just "dbt" (global), wrap in quotes
  if (dbtPath !== 'dbt') {
    return `"${dbtPath}"`;
  }
  
  return dbtPath;
}

/**
 * Get the dbt profiles directory
 */
export function getDbtProfilesDir(): string {
  const homeDir = process.env.USERPROFILE || process.env.HOME || '';
  return path.join(homeDir, '.dbt');
}
