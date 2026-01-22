import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface DbtModel {
  name: string;
  fullPath: string;
  concept: string;
  layer: string;
  type: string;
}

interface ModelTreeItem extends vscode.TreeItem {
  model?: DbtModel;
  children?: ModelTreeItem[];
  isGroup?: boolean;
}

/**
 * TreeDataProvider for dbt model selection with checkboxes
 */
export class DbtModelTreeProvider implements vscode.TreeDataProvider<ModelTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ModelTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private models: DbtModel[] = [];
  private treeItems: ModelTreeItem[] = [];
  private projectPath: string = '';

  async loadModels(projectPath: string): Promise<void> {
    this.projectPath = projectPath;
    this.models = await this.getDbtModels(projectPath);
    this.treeItems = this.buildTree();
    this._onDidChangeTreeData.fire(undefined);
  }

  private async getDbtModels(projectPath: string): Promise<DbtModel[]> {
    const dbtCmd = this.getDbtCommand(projectPath);
    
    try {
      const { stdout } = await execAsync(`${dbtCmd} ls --resource-type model`, {
        cwd: projectPath,
        env: { ...process.env, DBT_PROFILES_DIR: path.join(process.env.USERPROFILE || '', '.dbt') }
      });

      const models: DbtModel[] = [];
      const lines = stdout.trim().split('\n').filter(l => !l.startsWith('[') && l.includes('.'));

      for (const line of lines) {
        const fullPath = line.trim();
        const parts = fullPath.split('.');
        const name = parts[parts.length - 1];
        
        let concept = 'other';
        let layer = 'other';
        let type = 'model';

        if (parts.includes('raw_vault')) {
          layer = 'Raw Vault';
          const rawVaultIndex = parts.indexOf('raw_vault');
          if (rawVaultIndex + 1 < parts.length - 1) {
            concept = parts[rawVaultIndex + 1];
          }
          if (name.startsWith('hub_')) type = 'hub';
          else if (name.startsWith('sat_')) type = 'satellite';
          else if (name.startsWith('link_')) type = 'link';
        } else if (parts.includes('staging')) {
          layer = 'Staging';
          concept = 'staging';
          type = 'staging';
        } else if (parts.includes('business_vault')) {
          layer = 'Business Vault';
          concept = 'business_vault';
        } else if (parts.includes('mart')) {
          layer = 'Mart';
          const martIndex = parts.indexOf('mart');
          if (martIndex + 1 < parts.length - 1) {
            concept = parts[martIndex + 1];
          }
        }

        models.push({ name, fullPath, concept, layer, type });
      }

      return models;
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to list dbt models: ${error}`);
      return [];
    }
  }

  private getDbtCommand(projectPath: string): string {
    const isWindows = process.platform === 'win32';
    const venvDbt = isWindows
      ? path.join(projectPath, '.venv', 'Scripts', 'dbt.exe')
      : path.join(projectPath, '.venv', 'bin', 'dbt');
    
    if (fs.existsSync(venvDbt)) {
      return `"${venvDbt}"`;
    }
    return 'dbt';
  }

  private buildTree(): ModelTreeItem[] {
    const layerMap = new Map<string, Map<string, DbtModel[]>>();
    
    for (const model of this.models) {
      if (!layerMap.has(model.layer)) {
        layerMap.set(model.layer, new Map());
      }
      const conceptMap = layerMap.get(model.layer)!;
      if (!conceptMap.has(model.concept)) {
        conceptMap.set(model.concept, []);
      }
      conceptMap.get(model.concept)!.push(model);
    }

    const layerOrder = ['Staging', 'Raw Vault', 'Business Vault', 'Mart', 'other'];
    const items: ModelTreeItem[] = [];

    for (const layer of layerOrder) {
      const conceptMap = layerMap.get(layer);
      if (!conceptMap) continue;

      const layerChildren: ModelTreeItem[] = [];
      const concepts = Array.from(conceptMap.keys()).sort();

      for (const concept of concepts) {
        const conceptModels = conceptMap.get(concept)!;
        
        // Sort by type then name
        const typeOrder = ['hub', 'satellite', 'link', 'staging', 'model'];
        conceptModels.sort((a, b) => {
          const typeA = typeOrder.indexOf(a.type);
          const typeB = typeOrder.indexOf(b.type);
          if (typeA !== typeB) return typeA - typeB;
          return a.name.localeCompare(b.name);
        });

        const modelItems: ModelTreeItem[] = conceptModels.map(model => ({
          label: model.name,
          description: model.type,
          iconPath: this.getModelIcon(model.type),
          model,
          collapsibleState: vscode.TreeItemCollapsibleState.None,
          checkboxState: vscode.TreeItemCheckboxState.Unchecked
        }));

        if (concept !== layer.toLowerCase().replace(' ', '_') && concept !== 'staging') {
          // Create concept group
          layerChildren.push({
            label: concept,
            iconPath: new vscode.ThemeIcon('package'),
            isGroup: true,
            children: modelItems,
            collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
            checkboxState: vscode.TreeItemCheckboxState.Unchecked
          });
        } else {
          layerChildren.push(...modelItems);
        }
      }

      items.push({
        label: layer,
        iconPath: this.getLayerIcon(layer),
        isGroup: true,
        children: layerChildren,
        collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
        checkboxState: vscode.TreeItemCheckboxState.Unchecked
      });
    }

    return items;
  }

  private getModelIcon(type: string): vscode.ThemeIcon {
    switch (type) {
      case 'hub': return new vscode.ThemeIcon('key');
      case 'satellite': return new vscode.ThemeIcon('list-unordered');
      case 'link': return new vscode.ThemeIcon('git-merge');
      case 'staging': return new vscode.ThemeIcon('database');
      default: return new vscode.ThemeIcon('file');
    }
  }

  private getLayerIcon(layer: string): vscode.ThemeIcon {
    switch (layer) {
      case 'Staging': return new vscode.ThemeIcon('database');
      case 'Raw Vault': return new vscode.ThemeIcon('symbol-structure');
      case 'Business Vault': return new vscode.ThemeIcon('graph');
      case 'Mart': return new vscode.ThemeIcon('pie-chart');
      default: return new vscode.ThemeIcon('folder');
    }
  }

  getTreeItem(element: ModelTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ModelTreeItem): ModelTreeItem[] {
    if (!element) {
      return this.treeItems;
    }
    return element.children || [];
  }

  getParent(element: ModelTreeItem): ModelTreeItem | undefined {
    // Find parent by searching through tree
    for (const layer of this.treeItems) {
      if (layer.children?.includes(element)) {
        return layer;
      }
      for (const concept of layer.children || []) {
        if (concept.children?.includes(element)) {
          return concept;
        }
      }
    }
    return undefined;
  }

  /**
   * Get all selected models from checkbox state
   */
  getSelectedModels(view: vscode.TreeView<ModelTreeItem>): DbtModel[] {
    const selected: DbtModel[] = [];
    
    const collectSelected = (items: ModelTreeItem[]) => {
      for (const item of items) {
        if (item.model && item.checkboxState === vscode.TreeItemCheckboxState.Checked) {
          selected.push(item.model);
        }
        if (item.children) {
          collectSelected(item.children);
        }
      }
    };
    
    collectSelected(this.treeItems);
    return selected;
  }

  /**
   * Update checkbox state and handle parent/child cascading
   */
  updateCheckboxState(item: ModelTreeItem, checked: boolean): void {
    item.checkboxState = checked 
      ? vscode.TreeItemCheckboxState.Checked 
      : vscode.TreeItemCheckboxState.Unchecked;
    
    // Cascade to children
    if (item.children) {
      for (const child of item.children) {
        this.updateCheckboxState(child, checked);
      }
    }
    
    this._onDidChangeTreeData.fire(undefined);
  }

  selectAll(): void {
    const setAll = (items: ModelTreeItem[], checked: boolean) => {
      for (const item of items) {
        item.checkboxState = checked 
          ? vscode.TreeItemCheckboxState.Checked 
          : vscode.TreeItemCheckboxState.Unchecked;
        if (item.children) {
          setAll(item.children, checked);
        }
      }
    };
    setAll(this.treeItems, true);
    this._onDidChangeTreeData.fire(undefined);
  }

  clearAll(): void {
    const setAll = (items: ModelTreeItem[], checked: boolean) => {
      for (const item of items) {
        item.checkboxState = checked 
          ? vscode.TreeItemCheckboxState.Checked 
          : vscode.TreeItemCheckboxState.Unchecked;
        if (item.children) {
          setAll(item.children, checked);
        }
      }
    };
    setAll(this.treeItems, false);
    this._onDidChangeTreeData.fire(undefined);
  }
}

// ============================================================================
// Panel für Model-Auswahl
// ============================================================================

export class DbtModelPickerPanel {
  public static currentPanel: DbtModelPickerPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _onSelect: ((models: DbtModel[], command: string) => void) | undefined;
  private _models: DbtModel[] = [];
  private _command: string = 'run';

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.webview.html = this._getHtmlContent();
    
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'execute':
            if (this._onSelect) {
              this._onSelect(message.selected, message.command);
            }
            this._panel.dispose();
            break;
          case 'cancel':
            this._panel.dispose();
            break;
        }
      },
      null,
      this._disposables
    );

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public static async show(
    extensionUri: vscode.Uri,
    projectPath: string,
    title: string,
    command: string,
    onSelect: (models: DbtModel[], command: string) => void
  ): Promise<void> {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (DbtModelPickerPanel.currentPanel) {
      DbtModelPickerPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'dbtModelPicker',
      title,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [extensionUri]
      }
    );

    DbtModelPickerPanel.currentPanel = new DbtModelPickerPanel(panel, extensionUri);
    DbtModelPickerPanel.currentPanel._onSelect = onSelect;
    DbtModelPickerPanel.currentPanel._command = command;

    // Load models
    const models = await DbtModelPickerPanel.currentPanel.loadModels(projectPath);
    DbtModelPickerPanel.currentPanel._models = models;
    
    // Send to webview
    panel.webview.postMessage({
      type: 'init',
      models,
      command,
      title
    });
  }

  private async loadModels(projectPath: string): Promise<DbtModel[]> {
    const dbtCmd = this.getDbtCommand(projectPath);
    
    try {
      const { stdout } = await execAsync(`${dbtCmd} ls --resource-type model`, {
        cwd: projectPath,
        env: { ...process.env, DBT_PROFILES_DIR: path.join(process.env.USERPROFILE || '', '.dbt') }
      });

      const models: DbtModel[] = [];
      const lines = stdout.trim().split('\n').filter(l => !l.startsWith('[') && l.includes('.'));

      for (const line of lines) {
        const fullPath = line.trim();
        const parts = fullPath.split('.');
        const name = parts[parts.length - 1];
        
        let concept = 'other';
        let layer = 'other';
        let type = 'model';

        if (parts.includes('raw_vault')) {
          layer = 'Raw Vault';
          const rawVaultIndex = parts.indexOf('raw_vault');
          if (rawVaultIndex + 1 < parts.length - 1) {
            concept = parts[rawVaultIndex + 1];
          }
          if (name.startsWith('hub_')) type = 'hub';
          else if (name.startsWith('sat_')) type = 'satellite';
          else if (name.startsWith('link_')) type = 'link';
        } else if (parts.includes('staging')) {
          layer = 'Staging';
          concept = 'staging';
          type = 'staging';
        } else if (parts.includes('business_vault')) {
          layer = 'Business Vault';
          concept = 'business_vault';
        } else if (parts.includes('mart')) {
          layer = 'Mart';
          const martIndex = parts.indexOf('mart');
          if (martIndex + 1 < parts.length - 1) {
            concept = parts[martIndex + 1];
          }
        }

        models.push({ name, fullPath, concept, layer, type });
      }

      return models;
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to list dbt models: ${error}`);
      return [];
    }
  }

  private getDbtCommand(projectPath: string): string {
    const isWindows = process.platform === 'win32';
    const venvDbt = isWindows
      ? path.join(projectPath, '.venv', 'Scripts', 'dbt.exe')
      : path.join(projectPath, '.venv', 'bin', 'dbt');
    
    if (fs.existsSync(venvDbt)) {
      return `"${venvDbt}"`;
    }
    return 'dbt';
  }

  private _getHtmlContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Select dbt Models</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px;
      margin: 0;
    }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    
    h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 500;
    }
    
    .actions {
      display: flex;
      gap: 8px;
    }
    
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 14px;
      cursor: pointer;
      border-radius: 2px;
      font-size: 13px;
    }
    
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    
    button.secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    
    .toolbar {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }
    
    .toolbar button {
      padding: 4px 8px;
      font-size: 12px;
    }
    
    .search {
      flex: 1;
      padding: 6px 10px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 2px;
      font-size: 13px;
    }
    
    .search:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }
    
    .tree {
      max-height: calc(100vh - 180px);
      overflow-y: auto;
    }
    
    .layer {
      margin-bottom: 8px;
    }
    
    .layer-header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 0;
      cursor: pointer;
      font-weight: 500;
    }
    
    .layer-header:hover {
      background: var(--vscode-list-hoverBackground);
    }
    
    .concept {
      margin-left: 20px;
      margin-bottom: 4px;
    }
    
    .concept-header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 0;
      cursor: pointer;
      color: var(--vscode-descriptionForeground);
    }
    
    .concept-header:hover {
      background: var(--vscode-list-hoverBackground);
    }
    
    .model {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-left: 40px;
      padding: 3px 0;
    }
    
    .model:hover {
      background: var(--vscode-list-hoverBackground);
    }
    
    .model.direct {
      margin-left: 20px;
    }
    
    .model-name {
      flex: 1;
    }
    
    .model-type {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
    }
    
    input[type="checkbox"] {
      width: 16px;
      height: 16px;
      cursor: pointer;
    }
    
    .icon {
      width: 16px;
      text-align: center;
    }
    
    .expand {
      width: 16px;
      text-align: center;
      cursor: pointer;
    }
    
    .hidden {
      display: none;
    }
    
    .selected-count {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid var(--vscode-panel-border);
    }
  </style>
</head>
<body>
  <div class="header">
    <h2 id="title">Select Models</h2>
    <div class="actions">
      <button class="secondary" onclick="cancel()">Cancel</button>
      <button onclick="execute()">Run Selected</button>
    </div>
  </div>
  
  <div class="toolbar">
    <input type="text" class="search" placeholder="Filter models..." oninput="filterModels(this.value)">
    <button class="secondary" onclick="selectAll()">Select All</button>
    <button class="secondary" onclick="clearAll()">Clear</button>
  </div>
  
  <div class="tree" id="tree">
    <div class="loading">Loading models...</div>
  </div>
  
  <div class="footer">
    <span class="selected-count" id="selectedCount">0 models selected</span>
    <div class="actions">
      <button class="secondary" onclick="cancel()">Cancel</button>
      <button onclick="execute()">Run Selected</button>
    </div>
  </div>
  
  <script>
    const vscode = acquireVsCodeApi();
    let models = [];
    let command = 'run';
    
    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'init') {
        models = message.models;
        command = message.command;
        document.getElementById('title').textContent = message.title;
        renderTree();
      }
    });
    
    function renderTree() {
      const tree = document.getElementById('tree');
      
      // Group by layer, then concept
      const grouped = {};
      for (const model of models) {
        if (!grouped[model.layer]) grouped[model.layer] = {};
        if (!grouped[model.layer][model.concept]) grouped[model.layer][model.concept] = [];
        grouped[model.layer][model.concept].push(model);
      }
      
      const layerOrder = ['Staging', 'Raw Vault', 'Business Vault', 'Mart', 'other'];
      let html = '';
      
      for (const layer of layerOrder) {
        if (!grouped[layer]) continue;
        
        const layerIcon = getLayerIcon(layer);
        html += '<div class="layer">';
        html += '<div class="layer-header" onclick="toggleLayer(this)">';
        html += '<span class="expand">▼</span>';
        html += '<input type="checkbox" onchange="toggleLayerCheckbox(this, \\''+layer+'\\')" onclick="event.stopPropagation()">';
        html += '<span class="icon">'+layerIcon+'</span>';
        html += '<span>'+layer+'</span>';
        html += '</div>';
        html += '<div class="layer-content">';
        
        const concepts = Object.keys(grouped[layer]).sort();
        for (const concept of concepts) {
          const conceptModels = grouped[layer][concept];
          
          // Sort models
          conceptModels.sort((a, b) => {
            const typeOrder = ['hub', 'satellite', 'link', 'staging', 'model'];
            const typeA = typeOrder.indexOf(a.type);
            const typeB = typeOrder.indexOf(b.type);
            if (typeA !== typeB) return typeA - typeB;
            return a.name.localeCompare(b.name);
          });
          
          if (concept !== layer.toLowerCase().replace(' ', '_') && concept !== 'staging') {
            html += '<div class="concept">';
            html += '<div class="concept-header" onclick="toggleConcept(this)">';
            html += '<span class="expand">▼</span>';
            html += '<input type="checkbox" onchange="toggleConceptCheckbox(this)" onclick="event.stopPropagation()">';
            html += '<span class="icon">📦</span>';
            html += '<span>'+concept+'</span>';
            html += '</div>';
            html += '<div class="concept-content">';
            
            for (const model of conceptModels) {
              html += renderModel(model, false);
            }
            
            html += '</div></div>';
          } else {
            for (const model of conceptModels) {
              html += renderModel(model, true);
            }
          }
        }
        
        html += '</div></div>';
      }
      
      tree.innerHTML = html;
      updateSelectedCount();
    }
    
    function renderModel(model, isDirect) {
      const icon = getModelIcon(model.type);
      return '<div class="model'+(isDirect ? ' direct' : '')+'">' +
        '<input type="checkbox" data-model="'+model.fullPath+'" onchange="updateSelectedCount()">' +
        '<span class="icon">'+icon+'</span>' +
        '<span class="model-name">'+model.name+'</span>' +
        '<span class="model-type">'+model.type+'</span>' +
        '</div>';
    }
    
    function getLayerIcon(layer) {
      switch(layer) {
        case 'Staging': return '🗄️';
        case 'Raw Vault': return '🏗️';
        case 'Business Vault': return '📊';
        case 'Mart': return '📈';
        default: return '📁';
      }
    }
    
    function getModelIcon(type) {
      switch(type) {
        case 'hub': return '🔑';
        case 'satellite': return '📋';
        case 'link': return '🔗';
        case 'staging': return '📥';
        default: return '📄';
      }
    }
    
    function toggleLayer(header) {
      const content = header.nextElementSibling;
      const expand = header.querySelector('.expand');
      if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        expand.textContent = '▼';
      } else {
        content.classList.add('hidden');
        expand.textContent = '▶';
      }
    }
    
    function toggleConcept(header) {
      const content = header.nextElementSibling;
      const expand = header.querySelector('.expand');
      if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        expand.textContent = '▼';
      } else {
        content.classList.add('hidden');
        expand.textContent = '▶';
      }
    }
    
    function toggleLayerCheckbox(checkbox, layer) {
      const layerDiv = checkbox.closest('.layer');
      const modelCheckboxes = layerDiv.querySelectorAll('.model input[type="checkbox"]');
      const conceptCheckboxes = layerDiv.querySelectorAll('.concept-header input[type="checkbox"]');
      
      for (const cb of modelCheckboxes) {
        cb.checked = checkbox.checked;
      }
      for (const cb of conceptCheckboxes) {
        cb.checked = checkbox.checked;
      }
      updateSelectedCount();
    }
    
    function toggleConceptCheckbox(checkbox) {
      const conceptDiv = checkbox.closest('.concept');
      const modelCheckboxes = conceptDiv.querySelectorAll('.model input[type="checkbox"]');
      
      for (const cb of modelCheckboxes) {
        cb.checked = checkbox.checked;
      }
      updateSelectedCount();
    }
    
    function selectAll() {
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      for (const cb of checkboxes) {
        cb.checked = true;
      }
      updateSelectedCount();
    }
    
    function clearAll() {
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      for (const cb of checkboxes) {
        cb.checked = false;
      }
      updateSelectedCount();
    }
    
    function filterModels(query) {
      const q = query.toLowerCase();
      const modelDivs = document.querySelectorAll('.model');
      
      for (const div of modelDivs) {
        const name = div.querySelector('.model-name').textContent.toLowerCase();
        const type = div.querySelector('.model-type').textContent.toLowerCase();
        if (q === '' || name.includes(q) || type.includes(q)) {
          div.style.display = '';
        } else {
          div.style.display = 'none';
        }
      }
    }
    
    function updateSelectedCount() {
      const selected = document.querySelectorAll('.model input[type="checkbox"]:checked');
      document.getElementById('selectedCount').textContent = selected.length + ' models selected';
    }
    
    function getSelectedModels() {
      const selected = [];
      const checkboxes = document.querySelectorAll('.model input[type="checkbox"]:checked');
      for (const cb of checkboxes) {
        selected.push(cb.dataset.model);
      }
      return selected;
    }
    
    function execute() {
      const selected = getSelectedModels();
      if (selected.length === 0) {
        return;
      }
      vscode.postMessage({ type: 'execute', selected, command });
    }
    
    function cancel() {
      vscode.postMessage({ type: 'cancel' });
    }
  </script>
</body>
</html>`;
  }

  public dispose(): void {
    DbtModelPickerPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) d.dispose();
    }
  }
}
