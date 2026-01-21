/**
 * Load Layer TreeDataProvider
 * 
 * Displays External Tables from sources.yml in the tree view.
 * Groups tables by concept (source system).
 */

import { TreeItemData, ExternalTable } from '../types';
import { DataVaultTreeProvider } from './base';

/**
 * Load Layer TreeDataProvider - External Tables from sources.yml
 */
export class LoadTreeProvider extends DataVaultTreeProvider {
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
      // Root level - group external tables by concept (source system)
      const externalTables = this.metadata.externalTables || [];
      
      if (externalTables.length === 0) {
        return [{
          id: 'empty',
          label: 'No external tables found in sources.yml',
          type: 'layer',
          collapsibleState: 'none',
          icon: 'info'
        }];
      }

      return this.createExternalTableConceptTree(externalTables);
    }

    // Return children for nested elements
    return element.children || [];
  }

  /**
   * Group external tables by concept (source system)
   */
  private createExternalTableConceptTree(tables: ExternalTable[]): TreeItemData[] {
    // Group by concept
    const byConceptMap = new Map<string, ExternalTable[]>();
    for (const table of tables) {
      const concept = table.concept || '_other';
      if (!byConceptMap.has(concept)) {
        byConceptMap.set(concept, []);
      }
      byConceptMap.get(concept)!.push(table);
    }

    // Sort concepts alphabetically
    const sortedConcepts = [...byConceptMap.keys()].sort((a, b) => {
      if (a === '_other') return 1;
      if (b === '_other') return -1;
      return a.localeCompare(b);
    });

    return sortedConcepts.map(concept => ({
      id: `load-concept-${concept}`,
      label: concept === '_other' ? 'Other' : this.formatConceptName(concept),
      type: 'concept' as const,
      collapsibleState: 'collapsed' as const,
      description: `${byConceptMap.get(concept)!.length} tables`,
      children: byConceptMap.get(concept)!.map(t => this.externalTableToTreeItem(t))
    }));
  }

  /**
   * Convert an external table to a tree item
   */
  private externalTableToTreeItem(table: ExternalTable): TreeItemData {
    const hasColumns = table.columns && table.columns.length > 0;
    return {
      id: `ext-${table.name}`,
      label: table.name,
      type: 'external_table',
      modelType: 'external_table',
      filePath: table._yamlPath,
      externalTable: table,
      collapsibleState: hasColumns ? 'collapsed' : 'none',
      description: table.location ? `→ ${table.location.split('/').pop()}` : table.schema,
      tooltip: this.createExternalTableTooltip(table),
      children: hasColumns ? this.createExternalTableColumnItems(table) : undefined
    };
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
      icon: this.getColumnIcon(col.name)
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
