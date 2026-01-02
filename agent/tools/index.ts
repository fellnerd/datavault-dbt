/**
 * Tool Registry - Export all tools
 * 
 * Provides all tools to the Claude agent.
 */

import type Anthropic from '@anthropic-ai/sdk';

// Data Vault Creation Tools
import { createHub, createHubTool } from './createHub.js';
import { createSatellite, createSatelliteTool } from './createSatellite.js';
import { createLink, createLinkTool } from './createLink.js';
import { createStaging, createStagingTool } from './createStaging.js';
import { createRefTable, createRefTableTool } from './createRefTable.js';
import { createEffSat, createEffSatTool } from './createEffSat.js';
import { createPIT, createPITTool } from './createPIT.js';
import { createMart, createMartTool } from './createMart.js';
import { createBridge, createBridgeTool } from './createBridge.js';
import { createStaticTable, createStaticTableTool } from './createStaticTable.js';

// Modification Tools
import { addTests, addTestsTool } from './addTests.js';
import { addAttribute, addAttributeTool } from './addAttribute.js';
import { editModel, editModelTool } from './editModel.js';
import { deleteModel, deleteModelTool } from './deleteModel.js';

// Discovery & Analysis Tools
import { listEntities, listEntitiesTool } from './listEntities.js';
import { getEntityInfo, getEntityInfoTool } from './getEntityInfo.js';
import { suggestAttributes, suggestAttributesTool } from './suggestAttributes.js';
import { validateModel, validateModelTool } from './validateModel.js';
import { analyzeLineage, analyzeLineageTool } from './analyzeLineage.js';

// Utility Tools
import { readProjectFile, readFileTool } from './readFile.js';
import { listProjectFiles, listFilesTool } from './listFiles.js';
import { handleRunCommand, runCommandTool } from './runCommand.js';

// Database Tools (Read-Only)
import { databaseTools } from './database/index.js';

// Tool definitions for Claude API
export const TOOL_DEFINITIONS: Anthropic.Messages.Tool[] = [
  // Data Vault Creation
  createHubTool,
  createSatelliteTool,
  createLinkTool,
  createStagingTool,
  createRefTableTool,
  createEffSatTool,
  createPITTool,
  createMartTool,
  createBridgeTool,
  createStaticTableTool,
  // Modification
  addTestsTool,
  addAttributeTool,
  editModelTool,
  deleteModelTool,
  // Discovery & Analysis
  listEntitiesTool,
  getEntityInfoTool,
  suggestAttributesTool,
  validateModelTool,
  analyzeLineageTool,
  // Utility
  readFileTool,
  listFilesTool,
  runCommandTool,
  // Database (Read-Only)
  databaseTools.db_test_connection.tool,
  databaseTools.db_list_schemas.tool,
  databaseTools.db_list_tables.tool,
  databaseTools.db_describe_table.tool,
  databaseTools.db_preview_data.tool,
  databaseTools.db_run_query.tool,
  databaseTools.db_get_row_counts.tool,
];

// Tool execution handlers
type ToolHandler = (input: unknown) => Promise<string>;

export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  // Data Vault Creation
  create_hub: (input) => createHub(input as Parameters<typeof createHub>[0]),
  create_satellite: (input) => createSatellite(input as Parameters<typeof createSatellite>[0]),
  create_link: (input) => createLink(input as Parameters<typeof createLink>[0]),
  create_staging: (input) => createStaging(input as Parameters<typeof createStaging>[0]),
  create_ref_table: (input) => createRefTable(input as Parameters<typeof createRefTable>[0]),
  create_eff_sat: (input) => createEffSat(input as Parameters<typeof createEffSat>[0]),
  create_pit: (input) => createPIT(input as Parameters<typeof createPIT>[0]),
  create_mart: (input) => createMart(input as Parameters<typeof createMart>[0]),
  create_bridge: (input) => createBridge(input as Parameters<typeof createBridge>[0]),
  create_static_table: (input) => createStaticTable(input as Parameters<typeof createStaticTable>[0]),
  // Modification
  add_tests: (input) => addTests(input as Parameters<typeof addTests>[0]),
  add_attribute: (input) => addAttribute(input as Parameters<typeof addAttribute>[0]),
  edit_model: (input) => editModel(input as Parameters<typeof editModel>[0]),
  delete_model: (input) => deleteModel(input as Parameters<typeof deleteModel>[0]),
  // Discovery & Analysis
  list_entities: (input) => listEntities(input as Parameters<typeof listEntities>[0]),
  get_entity_info: (input) => getEntityInfo(input as Parameters<typeof getEntityInfo>[0]),
  suggest_attributes: (input) => suggestAttributes(input as Parameters<typeof suggestAttributes>[0]),
  validate_model: (input) => validateModel(input as Parameters<typeof validateModel>[0]),
  analyze_lineage: (input) => analyzeLineage(input as Parameters<typeof analyzeLineage>[0]),
  // Utility
  read_file: (input) => readProjectFile(input as Parameters<typeof readProjectFile>[0]),
  list_files: (input) => listProjectFiles(input as Parameters<typeof listProjectFiles>[0]),
  run_command: (input) => handleRunCommand(input as Parameters<typeof handleRunCommand>[0]),
  // Database (Read-Only)
  db_test_connection: (input) => databaseTools.db_test_connection.handler(input as { target?: string }),
  db_list_schemas: (input) => databaseTools.db_list_schemas.handler(input as { target?: string }),
  db_list_tables: (input) => databaseTools.db_list_tables.handler(input as { schema: string; type?: 'tables' | 'views' | 'all'; target?: string }),
  db_describe_table: (input) => databaseTools.db_describe_table.handler(input as { schema: string; table: string; target?: string }),
  db_preview_data: (input) => databaseTools.db_preview_data.handler(input as { schema: string; table: string; limit?: number; columns?: string[]; where?: string; target?: string }),
  db_run_query: (input) => databaseTools.db_run_query.handler(input as { query: string; target?: string }),
  db_get_row_counts: (input) => databaseTools.db_get_row_counts.handler(input as { target?: string }),
};

/**
 * Execute a tool by name
 */
export async function executeTool(name: string, input: unknown): Promise<string> {
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    return `❌ Unbekanntes Tool: ${name}`;
  }
  
  try {
    return await handler(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    return `❌ Fehler bei ${name}: ${message}`;
  }
}

/**
 * Get all tools for the Claude API
 */
export function getAllTools(): Anthropic.Messages.Tool[] {
  return TOOL_DEFINITIONS;
}

/**
 * Get all tools for follow-up interactions
 * Returns the same tools as getAllTools() - all tools available in follow-up
 */
export function getFollowUpTools(): Anthropic.Messages.Tool[] {
  return TOOL_DEFINITIONS;
}
