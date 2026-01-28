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
  ColumnInfo,
  GroupConfig
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
    
    // Set contextValue for context menu - include model type for filtering
    if (element.type === 'model') {
      const modelType = element.modelType || 'unknown';
      const inGroup = element.groupName && element.groupName !== 'All';
      // Format: model-hub, model-satellite, model-link, model-hub-in-group, etc.
      item.contextValue = inGroup ? `model-${modelType}-in-group` : `model-${modelType}`;
    } else if (element.type === 'external_table' && element.groupName && element.groupName !== 'All') {
      item.contextValue = 'external_table-in-group';
    } else if (element.type === 'psa_table' && element.groupName && element.groupName !== 'All') {
      item.contextValue = 'psa_table-in-group';
    } else {
      item.contextValue = element.type;
    }

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
      case 'psa_table':
        return new vscode.ThemeIcon('database');
      case 'group':
        return new vscode.ThemeIcon('folder-library');
      case 'groupAll':
        return new vscode.ThemeIcon('list-tree');
      default:
        return new vscode.ThemeIcon('file-code');
    }
  }

  /**
   * Get the layer identifier for this provider (override in subclasses)
   */
  protected getLayerName(): 'sources' | 'staging' | 'raw_vault' | 'business_vault' | 'mart' {
    return 'raw_vault';  // Default, override in subclasses
  }

  /**
   * Get configured groups from settings for the current layer
   */
  protected getGroupsForLayer(layer: 'sources' | 'staging' | 'raw_vault' | 'business_vault' | 'mart'): GroupConfig[] {
    const config = vscode.workspace.getConfiguration('datavault');
    const allGroups = config.get<GroupConfig[]>('groups') || [];
    return allGroups.filter(g => g.layer === layer);
  }

  /**
   * Get groups for a specific concept and layer
   */
  protected getGroupsForConcept(concept: string, layer: 'sources' | 'staging' | 'raw_vault' | 'business_vault' | 'mart'): GroupConfig[] {
    return this.getGroupsForLayer(layer).filter(g => g.concept === concept);
  }

  /**
   * Create tree items for models grouped by concept, with group support
   */
  protected createConceptTree(
    models: DbtModel[],
    filterTypes?: ModelType[]
  ): TreeItemData[] {
    if (!models.length) {
      return [];
    }

    const layer = this.getLayerName();

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
      concept,
      layer,
      description: `${byConceptMap.get(concept)!.length} models`,
      children: this.createGroupedModelItems(
        byConceptMap.get(concept)!,
        concept,
        layer,
        `${layerPrefix}-${concept}`
      )
    }));
  }

  /**
   * Create tree items with groups (All + custom groups)
   */
  protected createGroupedModelItems(
    models: DbtModel[],
    concept: string,
    layer: 'sources' | 'staging' | 'raw_vault' | 'business_vault' | 'mart',
    idPrefix: string
  ): TreeItemData[] {
    const groups = this.getGroupsForConcept(concept, layer);
    const result: TreeItemData[] = [];

    // Always create "All" group first
    const allGroupChildren = this.shouldGroupByType()
      ? this.createModelItems(models, true, `${idPrefix}-all`)
      : models.map(m => this.modelToTreeItemWithGroup(m, 'All'));

    result.push({
      id: `${idPrefix}-group-all`,
      label: 'All',
      type: 'groupAll',
      collapsibleState: 'collapsed',
      concept,
      layer,
      description: `${models.length}`,
      children: allGroupChildren
    });

    // Add custom groups (only if they have models)
    for (const group of groups) {
      const groupModels = models.filter(m => group.models.includes(m.name));
      if (groupModels.length > 0) {
        const groupChildren = this.shouldGroupByType()
          ? this.createModelItemsForGroup(groupModels, group.name, `${idPrefix}-${group.name}`)
          : groupModels.map(m => this.modelToTreeItemWithGroup(m, group.name));

        result.push({
          id: `${idPrefix}-group-${group.name}`,
          label: group.name,
          type: 'group',
          collapsibleState: 'collapsed',
          concept,
          layer,
          groupName: group.name,
          description: `${groupModels.length}`,
          children: groupChildren
        });
      }
    }

    return result;
  }

  /**
   * Create model items for a custom group (with type grouping)
   */
  protected createModelItemsForGroup(models: DbtModel[], groupName: string, idPrefix: string): TreeItemData[] {
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
          children: typeModels.map(m => this.modelToTreeItemWithGroup(m, groupName))
        });
      }
    }

    return result;
  }

  /**
   * Convert a model to a tree item with group context
   */
  protected modelToTreeItemWithGroup(model: DbtModel, groupName: string): TreeItemData {
    const hasColumns = model.columns && model.columns.length > 0;
    return {
      id: `model-${model.name}-${groupName}`,
      label: model.name,
      type: 'model',
      modelType: model.type,
      filePath: model.filePath,
      model,
      groupName,
      concept: model.concept,
      layer: model.layer,
      collapsibleState: hasColumns ? 'collapsed' : 'none',
      description: model.schema,
      tooltip: this.createModelTooltip(model),
      children: hasColumns ? this.createColumnItems(model) : undefined
    };
  }

  /**
   * Override in subclasses to control grouping behavior
   */
  protected shouldGroupByType(): boolean {
    return true;
  }

  /**
   * Create tree items for models (optionally grouped by type) - for "All" group
   */
  protected createModelItems(models: DbtModel[], groupByType = true, idPrefix = ''): TreeItemData[] {
    if (!groupByType) {
      return models.map(m => this.modelToTreeItemWithGroup(m, 'All'));
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
          children: typeModels.map(m => this.modelToTreeItemWithGroup(m, 'All'))
        });
      }
    }

    return result;
  }

  /**
   * Convert a model to a tree item (legacy - uses "All" group)
   */
  protected modelToTreeItem(model: DbtModel): TreeItemData {
    return this.modelToTreeItemWithGroup(model, 'All');
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
      icon: this.getColumnIcon(col.name),
      model,  // Include parent model for context menu actions
      concept: model.concept,
      layer: model.layer
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
