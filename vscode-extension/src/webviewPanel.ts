import * as vscode from 'vscode';
import { DbtModel, ProjectMetadata } from './types';

/**
 * Webview panel for displaying model details and lineage
 */
export class ModelDetailsPanel {
  public static currentPanel: ModelDetailsPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  /**
   * Create or show the panel
   */
  public static createOrShow(
    extensionUri: vscode.Uri,
    model: DbtModel,
    metadata: ProjectMetadata
  ): ModelDetailsPanel {
    const column = vscode.ViewColumn.Beside;

    if (ModelDetailsPanel.currentPanel) {
      ModelDetailsPanel.currentPanel._panel.reveal(column);
      ModelDetailsPanel.currentPanel.updateContent(model, metadata);
      return ModelDetailsPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'datavaultModelDetails',
      `Model: ${model.name}`,
      column,
      {
        enableScripts: true,
        localResourceRoots: [extensionUri]
      }
    );

    ModelDetailsPanel.currentPanel = new ModelDetailsPanel(panel, extensionUri);
    ModelDetailsPanel.currentPanel.updateContent(model, metadata);
    return ModelDetailsPanel.currentPanel;
  }

  /**
   * Update the panel content
   */
  public updateContent(model: DbtModel, metadata: ProjectMetadata): void {
    this._panel.title = `Model: ${model.name}`;
    this._panel.webview.html = this.getHtmlForWebview(model, metadata);
  }

  /**
   * Generate HTML content for the webview
   */
  private getHtmlForWebview(model: DbtModel, metadata: ProjectMetadata): string {
    const lineage = this.calculateLineage(model, metadata);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Model: ${model.name}</title>
  <style>
    :root {
      --vscode-font-family: var(--vscode-editor-font-family, 'Segoe UI', sans-serif);
    }
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
    }
    h1, h2, h3 {
      color: var(--vscode-foreground);
      margin-top: 1.5em;
      margin-bottom: 0.5em;
    }
    h1 { font-size: 1.5em; margin-top: 0; }
    h2 { font-size: 1.2em; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 0.3em; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.85em;
      margin-right: 8px;
    }
    .badge-hub { background-color: #d4a017; color: #000; }
    .badge-satellite { background-color: #3498db; color: #fff; }
    .badge-link { background-color: #2ecc71; color: #fff; }
    .badge-staging { background-color: #e67e22; color: #fff; }
    .badge-mart { background-color: #e74c3c; color: #fff; }
    .badge-pit { background-color: #9b59b6; color: #fff; }
    .badge-bridge { background-color: #1abc9c; color: #fff; }
    .badge-effectivity_satellite { background-color: #8e44ad; color: #fff; }
    .badge-view { background-color: #7f8c8d; color: #fff; }
    .badge-table { background-color: #34495e; color: #fff; }
    .property {
      display: flex;
      margin: 8px 0;
    }
    .property-label {
      font-weight: 600;
      min-width: 120px;
      color: var(--vscode-descriptionForeground);
    }
    .property-value {
      flex: 1;
    }
    .code {
      font-family: var(--vscode-editor-font-family, monospace);
      background-color: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 3px;
    }
    .list {
      list-style: none;
      padding-left: 0;
      margin: 0;
    }
    .list li {
      padding: 4px 0;
      display: flex;
      align-items: center;
    }
    .list li::before {
      content: '→';
      margin-right: 8px;
      color: var(--vscode-descriptionForeground);
    }
    .lineage-section {
      margin: 16px 0;
    }
    .lineage-item {
      display: flex;
      align-items: center;
      padding: 6px 12px;
      margin: 4px 0;
      background-color: var(--vscode-list-hoverBackground);
      border-radius: 4px;
      cursor: pointer;
    }
    .lineage-item:hover {
      background-color: var(--vscode-list-activeSelectionBackground);
    }
    .lineage-icon {
      margin-right: 8px;
    }
    .columns-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 8px;
    }
    .column-item {
      padding: 6px 10px;
      background-color: var(--vscode-list-hoverBackground);
      border-radius: 4px;
      font-family: monospace;
      font-size: 0.9em;
    }
    .empty {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }
  </style>
</head>
<body>
  <h1>
    <span class="badge badge-${model.type}">${this.formatType(model.type)}</span>
    ${model.name}
  </h1>

  <h2>📋 Properties</h2>
  <div class="property">
    <span class="property-label">Schema:</span>
    <span class="property-value"><span class="code">${model.schema}</span></span>
  </div>
  <div class="property">
    <span class="property-label">Layer:</span>
    <span class="property-value">${this.formatLayer(model.layer)}</span>
  </div>
  <div class="property">
    <span class="property-label">Concept:</span>
    <span class="property-value">${model.concept || 'N/A'}</span>
  </div>
  <div class="property">
    <span class="property-label">Materialized:</span>
    <span class="property-value"><span class="code">${model.materialized}</span></span>
  </div>
  <div class="property">
    <span class="property-label">File:</span>
    <span class="property-value"><span class="code">${model.relativePath}</span></span>
  </div>

  <h2>🔗 Upstream (Dependencies)</h2>
  <div class="lineage-section">
    ${lineage.upstream.length > 0 ? lineage.upstream.map(m => `
      <div class="lineage-item" data-model="${m.name}">
        <span class="lineage-icon">${this.getTypeIcon(m.type)}</span>
        <span class="badge badge-${m.type}">${this.formatType(m.type)}</span>
        <span>${m.name}</span>
      </div>
    `).join('') : '<p class="empty">No upstream dependencies</p>'}
  </div>

  ${model.sources.length > 0 ? `
  <h2>📥 Sources</h2>
  <div class="lineage-section">
    ${model.sources.map(s => `
      <div class="lineage-item">
        <span class="lineage-icon">📁</span>
        <span class="code">${s}</span>
      </div>
    `).join('')}
  </div>
  ` : ''}

  <h2>⬇️ Downstream (Dependents)</h2>
  <div class="lineage-section">
    ${lineage.downstream.length > 0 ? lineage.downstream.map(m => `
      <div class="lineage-item" data-model="${m.name}">
        <span class="lineage-icon">${this.getTypeIcon(m.type)}</span>
        <span class="badge badge-${m.type}">${this.formatType(m.type)}</span>
        <span>${m.name}</span>
      </div>
    `).join('') : '<p class="empty">No downstream dependents</p>'}
  </div>

  <h2>📊 Columns (${model.columns.length})</h2>
  ${model.columns.length > 0 ? `
  <div class="columns-grid">
    ${model.columns.map(col => `<div class="column-item">${col}</div>`).join('')}
  </div>
  ` : '<p class="empty">No columns detected</p>'}

  <script>
    const vscode = acquireVsCodeApi();
    
    document.querySelectorAll('.lineage-item[data-model]').forEach(item => {
      item.addEventListener('click', () => {
        const modelName = item.getAttribute('data-model');
        vscode.postMessage({ command: 'openModel', model: modelName });
      });
    });
  </script>
</body>
</html>`;
  }

  /**
   * Calculate upstream and downstream lineage
   */
  private calculateLineage(
    model: DbtModel,
    metadata: ProjectMetadata
  ): { upstream: DbtModel[]; downstream: DbtModel[] } {
    // Upstream: models this model references
    const upstream = metadata.models.filter(m => model.refs.includes(m.name));

    // Downstream: models that reference this model
    const downstream = metadata.models.filter(m => m.refs.includes(model.name));

    return { upstream, downstream };
  }

  /**
   * Format model type for display
   */
  private formatType(type: string): string {
    const names: Record<string, string> = {
      hub: 'Hub',
      satellite: 'Satellite',
      effectivity_satellite: 'Eff. Satellite',
      link: 'Link',
      staging: 'Staging',
      mart: 'Mart',
      pit: 'PIT',
      bridge: 'Bridge',
      view: 'View',
      table: 'Table',
      ref: 'Reference'
    };
    return names[type] || type;
  }

  /**
   * Format layer for display
   */
  private formatLayer(layer: string): string {
    const names: Record<string, string> = {
      staging: '📥 Staging',
      raw_vault: '🏛️ Raw Vault',
      business_vault: '📊 Business Vault',
      mart: '🎯 Mart'
    };
    return names[layer] || layer;
  }

  /**
   * Get icon for type
   */
  private getTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      hub: '🔑',
      satellite: '📋',
      effectivity_satellite: '⏱️',
      link: '🔗',
      staging: '📥',
      mart: '📊',
      pit: '📍',
      bridge: '🌉',
      view: '👁️',
      table: '📄',
      ref: '📚'
    };
    return icons[type] || '📄';
  }

  /**
   * Dispose the panel
   */
  public dispose(): void {
    ModelDetailsPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
