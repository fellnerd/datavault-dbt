"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MartTreeProvider = exports.BusinessVaultTreeProvider = exports.RawVaultTreeProvider = exports.StagingTreeProvider = exports.DataVaultTreeProvider = void 0;
const vscode = __importStar(require("vscode"));
/**
 * Base TreeDataProvider for Data Vault layers
 */
class DataVaultTreeProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    metadata = null;
    /**
     * Update the tree with new metadata
     */
    setMetadata(metadata) {
        this.metadata = metadata;
        this._onDidChangeTreeData.fire();
    }
    /**
     * Clear the tree
     */
    clear() {
        this.metadata = null;
        this._onDidChangeTreeData.fire();
    }
    /**
     * Refresh the tree
     */
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        const item = new vscode.TreeItem(element.label, element.collapsibleState === 'expanded'
            ? vscode.TreeItemCollapsibleState.Expanded
            : element.collapsibleState === 'collapsed'
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None);
        item.id = element.id;
        item.description = element.description;
        item.tooltip = element.tooltip || element.label;
        item.contextValue = element.type;
        // Set icon based on type
        if (element.icon) {
            item.iconPath = new vscode.ThemeIcon(element.icon);
        }
        else {
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
    /**
     * Get icon for model type
     */
    getIconForType(type) {
        switch (type) {
            case 'hub':
                return new vscode.ThemeIcon('key', new vscode.ThemeColor('charts.yellow'));
            case 'satellite':
                return new vscode.ThemeIcon('note', new vscode.ThemeColor('charts.blue'));
            case 'effectivity_satellite':
                return new vscode.ThemeIcon('history', new vscode.ThemeColor('charts.purple'));
            case 'link':
                return new vscode.ThemeIcon('link', new vscode.ThemeColor('charts.green'));
            case 'staging':
                return new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.orange'));
            case 'mart':
                return new vscode.ThemeIcon('pie-chart', new vscode.ThemeColor('charts.red'));
            case 'pit':
                return new vscode.ThemeIcon('timeline-pin', new vscode.ThemeColor('charts.purple'));
            case 'bridge':
                return new vscode.ThemeIcon('git-merge', new vscode.ThemeColor('charts.green'));
            case 'concept':
                return new vscode.ThemeIcon('folder');
            case 'category':
                return new vscode.ThemeIcon('symbol-folder');
            case 'ref':
                return new vscode.ThemeIcon('references');
            default:
                return new vscode.ThemeIcon('file-code');
        }
    }
    /**
     * Create tree items for models grouped by concept
     */
    createConceptTree(models, filterTypes) {
        if (!models.length) {
            return [];
        }
        // Filter by types if specified
        let filtered = models;
        if (filterTypes) {
            filtered = models.filter(m => filterTypes.includes(m.type));
        }
        // Group by concept
        const byConceptMap = new Map();
        for (const model of filtered) {
            const concept = model.concept || '_other';
            if (!byConceptMap.has(concept)) {
                byConceptMap.set(concept, []);
            }
            byConceptMap.get(concept).push(model);
        }
        // Sort concepts (_common first, then alphabetically)
        const sortedConcepts = [...byConceptMap.keys()].sort((a, b) => {
            if (a === '_common')
                return -1;
            if (b === '_common')
                return 1;
            return a.localeCompare(b);
        });
        // Create tree structure
        return sortedConcepts.map(concept => ({
            id: `concept-${concept}`,
            label: concept === '_common' ? 'Common' : this.formatConceptName(concept),
            type: 'concept',
            collapsibleState: 'collapsed',
            description: `${byConceptMap.get(concept).length} models`,
            children: this.createModelItems(byConceptMap.get(concept))
        }));
    }
    /**
     * Create tree items for models (optionally grouped by type)
     */
    createModelItems(models, groupByType = true) {
        if (!groupByType) {
            return models.map(m => this.modelToTreeItem(m));
        }
        // Group by type
        const byType = new Map();
        for (const model of models) {
            if (!byType.has(model.type)) {
                byType.set(model.type, []);
            }
            byType.get(model.type).push(model);
        }
        // Create category items
        const typeOrder = ['hub', 'satellite', 'effectivity_satellite', 'link', 'pit', 'bridge', 'staging', 'mart', 'view', 'table', 'ref'];
        const result = [];
        for (const type of typeOrder) {
            const typeModels = byType.get(type);
            if (typeModels && typeModels.length > 0) {
                result.push({
                    id: `category-${type}`,
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
    modelToTreeItem(model) {
        return {
            id: `model-${model.name}`,
            label: model.name,
            type: 'model',
            modelType: model.type,
            filePath: model.filePath,
            model,
            collapsibleState: 'none',
            description: model.schema,
            tooltip: this.createModelTooltip(model)
        };
    }
    /**
     * Create tooltip for model
     */
    createModelTooltip(model) {
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
    formatConceptName(concept) {
        return concept
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
    /**
     * Format type name for display
     */
    formatTypeName(type) {
        const names = {
            hub: '🔑 Hubs',
            satellite: '📋 Satellites',
            effectivity_satellite: '⏱️ Effectivity Satellites',
            link: '🔗 Links',
            staging: '📥 Staging',
            mart: '📊 Marts',
            pit: '📍 PITs',
            bridge: '🌉 Bridges',
            view: '👁️ Views',
            table: '📄 Tables',
            ref: '📚 References'
        };
        return names[type] || type;
    }
}
exports.DataVaultTreeProvider = DataVaultTreeProvider;
/**
 * Staging Layer TreeDataProvider
 */
class StagingTreeProvider extends DataVaultTreeProvider {
    async getChildren(element) {
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
            // Root level - group staging models by concept
            const stagingModels = this.metadata.models.filter(m => m.layer === 'staging');
            if (stagingModels.length === 0) {
                return [{
                        id: 'empty',
                        label: 'No staging models found',
                        type: 'layer',
                        collapsibleState: 'none',
                        icon: 'info'
                    }];
            }
            return this.createConceptTree(stagingModels);
        }
        // Return children for nested elements
        return element.children || [];
    }
}
exports.StagingTreeProvider = StagingTreeProvider;
/**
 * Raw Vault Layer TreeDataProvider
 */
class RawVaultTreeProvider extends DataVaultTreeProvider {
    async getChildren(element) {
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
            // Root level - group by concept, then by type (hub/sat/link)
            const rawVaultModels = this.metadata.models.filter(m => m.layer === 'raw_vault');
            if (rawVaultModels.length === 0) {
                return [{
                        id: 'empty',
                        label: 'No raw vault models found',
                        type: 'layer',
                        collapsibleState: 'none',
                        icon: 'info'
                    }];
            }
            return this.createConceptTree(rawVaultModels);
        }
        // Return children for nested elements
        return element.children || [];
    }
}
exports.RawVaultTreeProvider = RawVaultTreeProvider;
/**
 * Business Vault Layer TreeDataProvider
 */
class BusinessVaultTreeProvider extends DataVaultTreeProvider {
    async getChildren(element) {
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
            // Root level - group PITs and Bridges
            const businessVaultModels = this.metadata.models.filter(m => m.layer === 'business_vault');
            if (businessVaultModels.length === 0) {
                return [{
                        id: 'empty',
                        label: 'No business vault models found',
                        type: 'layer',
                        collapsibleState: 'none',
                        icon: 'info'
                    }];
            }
            // Group by type (PITs, Bridges, etc.)
            return this.createModelItems(businessVaultModels, true);
        }
        // Return children for nested elements
        return element.children || [];
    }
}
exports.BusinessVaultTreeProvider = BusinessVaultTreeProvider;
/**
 * Mart Layer TreeDataProvider
 */
class MartTreeProvider extends DataVaultTreeProvider {
    async getChildren(element) {
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
            // Root level - group mart models by concept (domain)
            const martModels = this.metadata.models.filter(m => m.layer === 'mart');
            if (martModels.length === 0) {
                return [{
                        id: 'empty',
                        label: 'No mart models found',
                        type: 'layer',
                        collapsibleState: 'none',
                        icon: 'info'
                    }];
            }
            return this.createConceptTree(martModels);
        }
        // Return children for nested elements
        return element.children || [];
    }
}
exports.MartTreeProvider = MartTreeProvider;
//# sourceMappingURL=treeProviders.js.map