/**
 * Load Layer TreeDataProvider
 * 
 * Displays External Tables and PSA Tables from sources.yml in the tree view.
 * Groups tables by concept (source system), with support for custom groups.
 */

import * as vscode from 'vscode';
import { TreeItemData, ExternalTable, PsaTableInfo, GroupConfig } from '../types';
import { DataVaultTreeProvider } from './base';

/**
 * Combined source item for tree view (external table or PSA table)
 */
interface SourceItem {
  type: 'external_table' | 'psa_table';
  name: string;
  concept: string;
  externalTable?: ExternalTable;
  psaTable?: PsaTableInfo;
}

/**
 * Load Layer TreeDataProvider - External Tables and PSA Tables from sources.yml
 */
export class LoadTreeProvider extends DataVaultTreeProvider {
  /**
   * Return the layer name for group filtering
   */
  protected getLayerName(): 'sources' | 'staging' | 'raw_vault' | 'business_vault' | 'mart' {
    return 'sources';
  }

  async getChildren(element?: TreeItemData): Promise<TreeItemData[]> {
    if (!this.metadata) {
      return [{
        id: 'no-project',
        label: 'No dbt project loaded',
        type: 'layer',
        collapsibleState: 'none',
        icon: 'warning'
      }];
    }

    if (!element) {
      // Root level - combine external tables and PSA tables, group by concept
      const externalTables = this.metadata.externalTables || [];
      const psaTables = this.metadata.psaTables || [];
      
      if (externalTables.length === 0 && psaTables.length === 0) {
        return [{
          id: 'empty',
          label: 'No external tables found in sources.yml',
          type: 'layer',
          collapsibleState: 'none',
          icon: 'info'
        }];
      }

      return this.createSourceConceptTree(externalTables, psaTables);
    }

    // Return children for nested elements
    return element.children || [];
  }

  /**
   * Get groups for a specific concept (sources layer)
   */
  protected getGroupsForConceptLocal(concept: string): GroupConfig[] {
    const config = vscode.workspace.getConfiguration('datavault');
    const allGroups = config.get<GroupConfig[]>('groups') || [];
    return allGroups.filter(g => g.layer === 'sources' && g.concept === concept);
  }

  /**
   * Group external tables and PSA tables by concept (source system)
   */
  private createSourceConceptTree(externalTables: ExternalTable[], psaTables: PsaTableInfo[]): TreeItemData[] {
    // Combine into source items
    const sourceItems: SourceItem[] = [
      ...externalTables.map(t => ({ type: 'external_table' as const, name: t.name, concept: t.concept, externalTable: t })),
      ...psaTables.map(t => ({ type: 'psa_table' as const, name: t.name, concept: t.concept, psaTable: t }))
    ];

    // Group by concept
    const byConceptMap = new Map<string, SourceItem[]>();
    for (const item of sourceItems) {
      const concept = item.concept || '_other';
      if (!byConceptMap.has(concept)) {
        byConceptMap.set(concept, []);
      }
      byConceptMap.get(concept)!.push(item);
    }

    // Sort concepts alphabetically
    const sortedConcepts = [...byConceptMap.keys()].sort((a, b) => {
      if (a === '_other') return 1;
      if (b === '_other') return -1;
      return a.localeCompare(b);
    });

    return sortedConcepts.map(concept => {
      const items = byConceptMap.get(concept)!;
      const extCount = items.filter(i => i.type === 'external_table').length;
      const psaCount = items.filter(i => i.type === 'psa_table').length;
      const desc = psaCount > 0 ? `${extCount} ext, ${psaCount} psa` : `${extCount} tables`;
      
      return {
        id: `load-concept-${concept}`,
        label: concept === '_other' ? 'Other' : this.formatConceptName(concept),
        type: 'concept' as const,
        collapsibleState: 'collapsed' as const,
        concept,
        layer: 'sources' as const,
        description: desc,
        children: this.createGroupedSourceItems(items, concept)
      };
    });
  }

  /**
   * Create tree items with groups (All + custom groups) for source items
   */
  private createGroupedSourceItems(items: SourceItem[], concept: string): TreeItemData[] {
    const groups = this.getGroupsForConceptLocal(concept);
    const result: TreeItemData[] = [];

    // Sort items: external tables first, then PSA tables, alphabetically within each
    const sortedItems = [...items].sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'external_table' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    // Always create "All" group first
    result.push({
      id: `load-${concept}-group-all`,
      label: 'All',
      type: 'groupAll',
      collapsibleState: 'collapsed',
      concept,
      layer: 'sources',
      description: `${items.length}`,
      children: sortedItems.map(item => this.sourceItemToTreeItem(item, 'All'))
    });

    // Add custom groups (only if they have items)
    for (const group of groups) {
      const groupItems = items.filter(item => group.models.includes(item.name));
      if (groupItems.length > 0) {
        result.push({
          id: `load-${concept}-group-${group.name}`,
          label: group.name,
          type: 'group',
          collapsibleState: 'collapsed',
          concept,
          layer: 'sources',
          groupName: group.name,
          description: `${groupItems.length}`,
          children: groupItems.map(item => this.sourceItemToTreeItem(item, group.name))
        });
      }
    }

    return result;
  }

  /**
   * Convert a source item (external table or PSA table) to tree item
   */
  private sourceItemToTreeItem(item: SourceItem, groupName: string): TreeItemData {
    if (item.type === 'psa_table' && item.psaTable) {
      return this.psaTableToTreeItem(item.psaTable, groupName);
    }
    return this.externalTableToTreeItemWithGroup(item.externalTable!, groupName);
  }

  /**
   * Convert a PSA table to a tree item
   */
  private psaTableToTreeItem(psa: PsaTableInfo, groupName: string): TreeItemData {
    const hasColumns = psa.columns && psa.columns.length > 0;
    return {
      id: `psa-${psa.name}-${groupName}`,
      label: psa.name,
      type: 'psa_table',
      modelType: 'table',
      filePath: psa._yamlPath,
      psaTable: psa,
      groupName,
      concept: psa.concept,
      layer: 'sources',
      collapsibleState: hasColumns ? 'collapsed' : 'none',
      icon: 'database',  // Different icon for PSA
      description: `← ${psa.sourceExternalTable}`,
      tooltip: this.createPsaTableTooltip(psa),
      children: hasColumns ? this.createPsaTableColumnItems(psa) : undefined
    };
  }

  /**
   * Create tooltip for PSA table
   */
  private createPsaTableTooltip(psa: PsaTableInfo): string {
    const lines = [
      `**${psa.name}** (Persistent Staging)`,
      `Model: ${psa.modelName}`,
      `Source: ${psa.sourceExternalTable}`,
      `Schema: ${psa.schema}`
    ];

    if (psa.columns.length > 0) {
      lines.push(`Columns: ${psa.columns.length}`);
    }

    if (psa.description) {
      lines.push('', psa.description);
    }

    return lines.join('\n');
  }

  /**
   * Create tree items for PSA table columns
   */
  private createPsaTableColumnItems(psa: PsaTableInfo): TreeItemData[] {
    return psa.columns.map(col => ({
      id: `psa-${psa.name}-col-${col.name}`,
      label: col.name,
      type: 'column' as const,
      collapsibleState: 'none' as const,
      description: col.dataType || 'unknown',
      tooltip: col.description || `${col.name}: ${col.dataType || 'unknown'}`,
      icon: this.getColumnIcon(col.name),
      psaTable: psa,  // Include parent PSA table for context menu actions
      concept: psa.concept,
      layer: 'sources' as const
    }));
  }

  /**
   * Convert an external table to a tree item with group context
   */
  private externalTableToTreeItemWithGroup(table: ExternalTable, groupName: string): TreeItemData {
    const hasColumns = table.columns && table.columns.length > 0;
    
    // Check if this is a wildcard table (location ends with /)
    const isWildcard = table.location?.endsWith('/');
    const label = isWildcard ? `${table.name} *` : table.name;
    
    // For wildcard, show folder path; for normal, show filename
    let description: string;
    if (isWildcard) {
      description = `→ ${table.location}*`;
    } else if (table.location) {
      description = `→ ${table.location.split('/').pop()}`;
    } else {
      description = table.schema || '';
    }
    
    return {
      id: `ext-${table.name}-${groupName}`,
      label,
      type: 'external_table',
      modelType: 'external_table',
      filePath: table._yamlPath,
      externalTable: table,
      groupName,
      concept: table.concept,
      layer: 'sources',
      collapsibleState: hasColumns ? 'collapsed' : 'none',
      description,
      tooltip: this.createExternalTableTooltip(table),
      children: hasColumns ? this.createExternalTableColumnItems(table) : undefined
    };
  }

  /**
   * Convert an external table to a tree item (legacy - uses "All" group)
   */
  private externalTableToTreeItem(table: ExternalTable): TreeItemData {
    return this.externalTableToTreeItemWithGroup(table, 'All');
  }

  /**
   * Create tree items for external table columns
   */
  private createExternalTableColumnItems(table: ExternalTable): TreeItemData[] {
    return table.columns.map(col => ({
      id: `ext-${table.name}-col-${col.name}`,
      label: col.name,
      type: 'column' as const,
      collapsibleState: 'none' as const,
      description: col.dataType || 'unknown',
      tooltip: col.description || `${col.name}: ${col.dataType || 'unknown'}`,
      icon: this.getColumnIcon(col.name),
      externalTable: table,  // Include parent external table for context menu actions
      concept: table.concept,
      layer: 'sources' as const
    }));
  }

  /**
   * Create tooltip for external table
   */
  private createExternalTableTooltip(table: ExternalTable): string {
    const lines = [
      `**${table.name}**`,
      `Source: ${table.sourceName}`,
      `Schema: ${table.schema}`
    ];

    if (table.location) {
      lines.push(`Location: ${table.location}`);
    }

    if (table.fileFormat) {
      lines.push(`Format: ${table.fileFormat}`);
    }

    if (table.columns.length > 0) {
      lines.push(`Columns: ${table.columns.length}`);
    }

    if (table.description) {
      lines.push('', table.description);
    }

    return lines.join('\n');
  }

  /**
   * Format concept name for display
   */
  protected formatConceptName(concept: string): string {
    if (concept === '_common') return 'Common';
    // Capitalize first letter of each word
    return concept
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
}
