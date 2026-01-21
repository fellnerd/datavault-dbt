/**
 * Base Tree Data Provider for Data Vault
 * 
 * Abstract base class providing common functionality for all
 * layer-specific tree providers (Staging, Raw Vault, Business Vault, Mart, Load).
 */

import * as vscode from 'vscode';
import {
  DbtModel,
  ProjectMetadata,
  TreeItemData,
  ModelType,
  ColumnInfo
} from '../types';

/**
 * Base TreeDataProvider for Data Vault layers
 */
export abstract class DataVaultTreeProvider implements vscode.TreeDataProvider<TreeItemData> {
  protected _onDidChangeTreeData = new vscode.EventEmitter<TreeItemData | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  protected metadata: ProjectMetadata | null = null;

  /**
   * Update the tree with new metadata
   */
  setMetadata(metadata: ProjectMetadata): void {
    this.metadata = metadata;
    this._onDidChangeTreeData.fire();
  }

  /**
   * Clear the tree
   */
  clear(): void {
    this.metadata = null;
    this._onDidChangeTreeData.fire();
  }

  /**
   * Refresh the tree
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeItemData): vscode.TreeItem {
    const item = new vscode.TreeItem(
      element.label,
      element.collapsibleState === 'expanded'
        ? vscode.TreeItemCollapsibleState.Expanded
        : element.collapsibleState === 'collapsed'
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );

    item.id = element.id;
    item.description = element.description;
    item.tooltip = element.tooltip || element.label;
    item.contextValue = element.type;

    // Set icon based on type - with warning indicator for undocumented models
    if (element.icon) {
      item.iconPath = new vscode.ThemeIcon(element.icon);
    } else if (element.type === 'model' && element.model && !element.model._yamlPath) {
      // Warning icon for models without YAML documentation
      item.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground'));
    } else {
      item.iconPath = this.getIconForType(element.modelType || element.type);
    }

    // Make models clickable to open file
    if (element.type === 'model' && element.filePath) {
      item.command = {
        command: 'datavault.openModel',
        title: 'Open Model',
        arguments: [element.filePath]
      };
      item.resourceUri = vscode.Uri.file(element.filePath);
    }

    return item;
  }

  abstract getChildren(element?: TreeItemData): Thenable<TreeItemData[]>;

  /**
   * Get icon for model type
   */
  protected getIconForType(type: string | undefined): vscode.ThemeIcon {
    switch (type) {
      case 'hub':
        return new vscode.ThemeIcon('key');
      case 'satellite':
        return new vscode.ThemeIcon('note');
      case 'effectivity_satellite':
        return new vscode.ThemeIcon('history');
      case 'link':
        return new vscode.ThemeIcon('link');
      case 'staging':
        return new vscode.ThemeIcon('database');
      case 'mart':
        return new vscode.ThemeIcon('pie-chart');
      case 'pit':
        return new vscode.ThemeIcon('timeline-pin');
      case 'bridge':
        return new vscode.ThemeIcon('git-merge');
      case 'concept':
        return new vscode.ThemeIcon('folder');
      case 'category':
        return new vscode.ThemeIcon('symbol-folder');
      case 'ref':
        return new vscode.ThemeIcon('references');
      case 'column':
        return new vscode.ThemeIcon('symbol-field');
      case 'external_table':
        return new vscode.ThemeIcon('cloud-download');
      default:
        return new vscode.ThemeIcon('file-code');
    }
  }

  /**
   * Create tree items for models grouped by concept
   */
  protected createConceptTree(
    models: DbtModel[],
    filterTypes?: ModelType[]
  ): TreeItemData[] {
    if (!models.length) {
      return [];
    }

    // Filter by types if specified
    let filtered = models;
    if (filterTypes) {
      filtered = models.filter(m => filterTypes.includes(m.type));
    }

    // Group by concept
    const byConceptMap = new Map<string, DbtModel[]>();
    for (const model of filtered) {
      const concept = model.concept || '_other';
      if (!byConceptMap.has(concept)) {
        byConceptMap.set(concept, []);
      }
      byConceptMap.get(concept)!.push(model);
    }

    // Sort concepts (_common first, then alphabetically)
    const sortedConcepts = [...byConceptMap.keys()].sort((a, b) => {
      if (a === '_common') return -1;
      if (b === '_common') return 1;
      return a.localeCompare(b);
    });

    // Create tree structure - use unique IDs per layer
    const layerPrefix = filterTypes?.join('-') || 'all';
    return sortedConcepts.map(concept => ({
      id: `${layerPrefix}-concept-${concept}`,
      label: concept === '_common' ? 'Common' : this.formatConceptName(concept),
      type: 'concept' as const,
      collapsibleState: 'collapsed' as const,
      description: `${byConceptMap.get(concept)!.length} models`,
      children: this.createModelItems(byConceptMap.get(concept)!, this.shouldGroupByType(), `${layerPrefix}-${concept}`)
    }));
  }

  /**
   * Override in subclasses to control grouping behavior
   */
  protected shouldGroupByType(): boolean {
    return true;
  }

  /**
   * Create tree items for models (optionally grouped by type)
   */
  protected createModelItems(models: DbtModel[], groupByType = true, idPrefix = ''): TreeItemData[] {
    if (!groupByType) {
      return models.map(m => this.modelToTreeItem(m));
    }

    // Group by type
    const byType = new Map<ModelType, DbtModel[]>();
    for (const model of models) {
      if (!byType.has(model.type)) {
        byType.set(model.type, []);
      }
      byType.get(model.type)!.push(model);
    }

    // Create category items
    const typeOrder: ModelType[] = ['hub', 'satellite', 'effectivity_satellite', 'link', 'pit', 'bridge', 'staging', 'mart', 'view', 'table', 'ref'];
    const result: TreeItemData[] = [];
    const prefix = idPrefix ? `${idPrefix}-` : '';

    for (const type of typeOrder) {
      const typeModels = byType.get(type);
      if (typeModels && typeModels.length > 0) {
        result.push({
          id: `${prefix}category-${type}`,
          label: this.formatTypeName(type),
          type: 'category',
          modelType: type,
          collapsibleState: 'collapsed',
          description: `${typeModels.length}`,
          children: typeModels.map(m => this.modelToTreeItem(m))
        });
      }
    }

    return result;
  }

  /**
   * Convert a model to a tree item
   */
  protected modelToTreeItem(model: DbtModel): TreeItemData {
    const hasColumns = model.columns && model.columns.length > 0;
    return {
      id: `model-${model.name}`,
      label: model.name,
      type: 'model',
      modelType: model.type,
      filePath: model.filePath,
      model,
      collapsibleState: hasColumns ? 'collapsed' : 'none',
      description: model.schema,
      tooltip: this.createModelTooltip(model),
      children: hasColumns ? this.createColumnItems(model) : undefined
    };
  }

  /**
   * Create tree items for model columns
   */
  protected createColumnItems(model: DbtModel): TreeItemData[] {
    return model.columns.map(col => ({
      id: `model-${model.name}-col-${col.name}`,
      label: col.name,
      type: 'column' as const,
      collapsibleState: 'none' as const,
      description: col.dataType || this.getColumnCategory(col.name),
      tooltip: col.description || `${col.name}${col.dataType ? ': ' + col.dataType : ''}`,
      icon: this.getColumnIcon(col.name)
    }));
  }

  /**
   * Get column category for description (fallback when no data type)
   */
  protected getColumnCategory(colName: string): string {
    const colLower = colName.toLowerCase();
    if (colLower.startsWith('hk_')) return 'Hash Key';
    if (colLower.startsWith('hd_')) return 'Hash Diff';
    if (colLower.startsWith('dss_')) return 'Metadata';
    if (colLower === 'load_date' || colLower === 'record_source') return 'Metadata';
    return 'Attribute';
  }

  /**
   * Get icon for column based on naming convention
   */
  protected getColumnIcon(colName: string): string {
    const colLower = colName.toLowerCase();
    if (colLower.startsWith('hk_')) return 'key';
    if (colLower.startsWith('hd_')) return 'diff';
    if (colLower.startsWith('dss_') || colLower === 'load_date' || colLower === 'record_source') return 'info';
    return 'symbol-field';
  }

  /**
   * Create tooltip for model
   */
  protected createModelTooltip(model: DbtModel): string {
    const lines = [
      `**${model.name}**`,
      `Type: ${this.formatTypeName(model.type)}`,
      `Schema: ${model.schema}`,
      `Materialized: ${model.materialized}`
    ];

    if (model.refs.length > 0) {
      lines.push(`References: ${model.refs.join(', ')}`);
    }

    if (model.columns.length > 0) {
      lines.push(`Columns: ${model.columns.length}`);
    }

    return lines.join('\n');
  }

  /**
   * Format concept name for display
   */
  protected formatConceptName(concept: string): string {
    return concept
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Format type name for display
   */
  protected formatTypeName(type: ModelType): string {
    const names: Record<ModelType, string> = {
      hub: 'Hubs',
      satellite: 'Satellites',
      effectivity_satellite: 'Effectivity Satellites',
      link: 'Links',
      staging: 'Staging',
      mart: 'Marts',
      pit: 'PITs',
      bridge: 'Bridges',
      view: 'Views',
      table: 'Tables',
      ref: 'References',
      external_table: 'External Tables'
    };
    return names[type] || type;
  }
}
