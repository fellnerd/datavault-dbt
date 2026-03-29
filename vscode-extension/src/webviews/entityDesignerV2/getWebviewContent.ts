import * as vscode from 'vscode';

/**
 * Get the HTML content for the Entity Designer v2 webview.
 *
 * Security:
 * - Uses nonce for script execution
 * - CSP restricts script sources
 * - Only loads bundled React app
 */
export function getWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): string {
  // Get URIs for resources
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'out', 'webviews', 'entityDesignerV2.js')
  );

  // Generate nonce for CSP
  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    style-src ${webview.cspSource} 'unsafe-inline';
    font-src ${webview.cspSource};
    img-src ${webview.cspSource} https: data:;
    script-src 'nonce-${nonce}';
  ">
  <title>Entity Designer v2</title>
  <style>
    /* ========== REACT FLOW BASE CSS ========== */
    .react-flow {
      direction: ltr;
      --xy-edge-stroke-default: #b1b1b7;
      --xy-edge-stroke-width-default: 1;
      --xy-edge-stroke-selected-default: #555;
      --xy-connectionline-stroke-default: #b1b1b7;
      --xy-connectionline-stroke-width-default: 1;
      --xy-attribution-background-color-default: rgba(255, 255, 255, 0.5);
      --xy-minimap-background-color-default: #fff;
      --xy-minimap-mask-background-color-default: rgba(240, 240, 240, 0.6);
      --xy-minimap-mask-stroke-color-default: transparent;
      --xy-minimap-mask-stroke-width-default: 1;
      --xy-minimap-node-background-color-default: #e2e2e2;
      --xy-minimap-node-stroke-color-default: transparent;
      --xy-minimap-node-stroke-width-default: 2;
      --xy-background-color-default: transparent;
      --xy-background-pattern-dots-color-default: #91919a;
      --xy-background-pattern-lines-color-default: #eee;
      --xy-background-pattern-cross-color-default: #e2e2e2;
      background-color: var(--xy-background-color, var(--xy-background-color-default));
      --xy-node-border-default: 1px solid #bbb;
      --xy-node-border-selected-default: 1px solid #555;
      --xy-handle-background-color-default: #333;
      --xy-selection-background-color-default: rgba(150, 150, 180, 0.1);
      --xy-selection-border-default: 1px dotted rgba(155, 155, 155, 0.8);
      --xy-resize-background-color-default: #3367d9;
    }
    .react-flow__background {
      background-color: var(--xy-background-color-props, var(--xy-background-color, var(--xy-background-color-default)));
      pointer-events: none;
      z-index: -1;
    }
    .react-flow__container {
      position: absolute;
      width: 100%;
      height: 100%;
      top: 0;
      left: 0;
    }
    .react-flow__pane {
      z-index: 1;
    }
    .react-flow__pane.draggable { cursor: grab; }
    .react-flow__pane.dragging { cursor: grabbing; }
    .react-flow__pane.selection { cursor: pointer; }
    .react-flow__viewport {
      transform-origin: 0 0;
      z-index: 2;
      pointer-events: none;
    }
    .react-flow__renderer { z-index: 4; }
    .react-flow__selection { z-index: 6; }
    .react-flow__nodesselection-rect:focus,
    .react-flow__nodesselection-rect:focus-visible { outline: none; }
    .react-flow__edge-path {
      stroke: var(--xy-edge-stroke, var(--xy-edge-stroke-default));
      stroke-width: var(--xy-edge-stroke-width, var(--xy-edge-stroke-width-default));
      fill: none;
    }
    .react-flow__connection-path {
      stroke: var(--xy-connectionline-stroke, var(--xy-connectionline-stroke-default));
      stroke-width: var(--xy-connectionline-stroke-width, var(--xy-connectionline-stroke-width-default));
      fill: none;
    }
    .react-flow .react-flow__edges { position: absolute; }
    .react-flow .react-flow__edges svg {
      overflow: visible;
      position: absolute;
      pointer-events: none;
    }
    .react-flow__edge { pointer-events: visibleStroke; }
    .react-flow__edge.selectable { cursor: pointer; }
    .react-flow__edge.animated path {
      stroke-dasharray: 5;
      animation: dashdraw 0.5s linear infinite;
    }
    .react-flow__edge.animated path.react-flow__edge-interaction {
      stroke-dasharray: none;
      animation: none;
    }
    .react-flow__edge.inactive { pointer-events: none; }
    .react-flow__edge.selected,
    .react-flow__edge:focus,
    .react-flow__edge:focus-visible { outline: none; }
    .react-flow__edge.selected .react-flow__edge-path,
    .react-flow__edge.selectable:focus .react-flow__edge-path,
    .react-flow__edge.selectable:focus-visible .react-flow__edge-path {
      stroke: var(--xy-edge-stroke-selected, var(--xy-edge-stroke-selected-default));
    }
    .react-flow__edge-textwrapper { pointer-events: all; }
    .react-flow__edge .react-flow__edge-text {
      pointer-events: none;
      user-select: none;
    }
    .react-flow__connection { pointer-events: none; }
    .react-flow__connection .animated {
      stroke-dasharray: 5;
      animation: dashdraw 0.5s linear infinite;
    }
    svg.react-flow__connectionline {
      z-index: 1001;
      overflow: visible;
      position: absolute;
    }
    .react-flow__nodes {
      pointer-events: none;
      transform-origin: 0 0;
    }
    .react-flow__node {
      position: absolute;
      user-select: none;
      pointer-events: all;
      transform-origin: 0 0;
      box-sizing: border-box;
      cursor: default;
    }
    .react-flow__node.selectable { cursor: pointer; }
    .react-flow__node.draggable {
      cursor: grab;
      pointer-events: all;
    }
    .react-flow__node.draggable.dragging { cursor: grabbing; }
    .react-flow__nodesselection {
      z-index: 3;
      transform-origin: left top;
      pointer-events: none;
    }
    .react-flow__nodesselection-rect {
      position: absolute;
      pointer-events: all;
      cursor: grab;
    }
    .react-flow__handle {
      position: absolute;
      pointer-events: none;
      min-width: 5px;
      min-height: 5px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background-color: var(--xy-handle-background-color, var(--xy-handle-background-color-default));
    }
    .react-flow__handle.connectingfrom { pointer-events: all; }
    .react-flow__handle.connectionindicator {
      pointer-events: all;
      cursor: crosshair;
    }
    .react-flow__handle-bottom { top: auto; left: 50%; bottom: 0; transform: translate(-50%, 50%); }
    .react-flow__handle-top { top: 0; left: 50%; transform: translate(-50%, -50%); }
    .react-flow__handle-left { top: 50%; left: 0; transform: translate(-50%, -50%); }
    .react-flow__handle-right { top: 50%; right: 0; transform: translate(50%, -50%); }
    .react-flow__edgeupdater { cursor: move; pointer-events: all; }
    .react-flow__panel {
      position: absolute;
      z-index: 5;
      margin: 15px;
    }
    .react-flow__panel.top { top: 0; }
    .react-flow__panel.bottom { bottom: 0; }
    .react-flow__panel.left { left: 0; }
    .react-flow__panel.right { right: 0; }
    .react-flow__attribution {
      font-size: 10px;
      background: var(--xy-attribution-background-color, var(--xy-attribution-background-color-default));
      padding: 2px 3px;
      margin: 0;
    }
    .react-flow__attribution a { text-decoration: none; color: #999; }
    @keyframes dashdraw { from { stroke-dashoffset: 10; } }
    .react-flow__edgelabel-renderer {
      position: absolute;
      width: 100%;
      height: 100%;
      pointer-events: none;
      user-select: none;
      left: 0;
      top: 0;
    }
    .react-flow__viewport-portal {
      position: absolute;
      width: 100%;
      height: 100%;
      left: 0;
      top: 0;
      user-select: none;
    }
    .react-flow__minimap {
      background: var(--xy-minimap-background-color-props, var(--xy-minimap-background-color, var(--xy-minimap-background-color-default)));
    }
    .react-flow__minimap-svg { display: block; }
    .react-flow__minimap-mask {
      fill: var(--xy-minimap-mask-background-color-props, var(--xy-minimap-mask-background-color, var(--xy-minimap-mask-background-color-default)));
    }
    .react-flow__minimap-node {
      fill: var(--xy-minimap-node-background-color-props, var(--xy-minimap-node-background-color, var(--xy-minimap-node-background-color-default)));
    }
    .react-flow__background-pattern.dots {
      fill: var(--xy-background-pattern-color-props, var(--xy-background-pattern-color, var(--xy-background-pattern-dots-color-default)));
    }
    .react-flow__controls {
      display: flex;
      flex-direction: column;
    }
    .react-flow__controls-button {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 26px;
      width: 26px;
      padding: 4px;
    }
    .react-flow__controls-button svg {
      width: 100%;
      max-width: 12px;
      max-height: 12px;
      fill: currentColor;
    }
    .react-flow__nodesselection-rect,
    .react-flow__selection {
      background: var(--xy-selection-background-color, var(--xy-selection-background-color-default));
      border: var(--xy-selection-border, var(--xy-selection-border-default));
    }
    /* ========== END REACT FLOW BASE CSS ========== */

    /* Base Layout */
    html, body, #root {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
    }

    /* React Flow Container Override */
    .react-flow {
      background-color: var(--vscode-editor-background);
    }

    /* React Flow Controls — dark theme */
    .react-flow__controls {
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
    }

    .react-flow__controls button {
      background: var(--vscode-button-secondaryBackground);
      border: none;
      color: var(--vscode-button-secondaryForeground);
    }

    .react-flow__controls button:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    /* React Flow MiniMap — dark theme */
    .react-flow__minimap {
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
    }

    .react-flow__panel {
      margin: 10px;
    }

    /* ========== Entity Designer v2 Layout ========== */

    /* Toolbar */
    .ed-toolbar {
      display: flex;
      align-items: center;
      height: 40px;
      padding: 0 12px;
      background: var(--vscode-titleBar-activeBackground, #2d2d2d);
      border-bottom: 1px solid var(--vscode-panel-border, #333);
      gap: 12px;
      flex-shrink: 0;
    }

    .ed-toolbar-left, .ed-toolbar-center, .ed-toolbar-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .ed-toolbar-left { flex: 1; }
    .ed-toolbar-center { flex: 0; }
    .ed-toolbar-right { flex: 0; white-space: nowrap; }

    .ed-entity-name {
      font-weight: 600;
      color: var(--vscode-foreground);
    }
    .ed-concept-badge {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 3px;
      background: var(--vscode-badge-background, #4d4d4d);
      color: var(--vscode-badge-foreground, #ccc);
    }
    .ed-dirty { color: var(--vscode-editorWarning-foreground, #cca700); }

    .ed-btn {
      padding: 4px 10px;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 3px;
      background: var(--vscode-button-secondaryBackground, #3a3a3a);
      color: var(--vscode-button-secondaryForeground, #ccc);
      cursor: pointer;
      font-size: 12px;
      white-space: nowrap;
    }
    .ed-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, #454545);
    }
    .ed-btn.primary {
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
    }
    .ed-btn.primary:hover {
      background: var(--vscode-button-hoverBackground, #1177bb);
    }
    .ed-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .ed-btn.danger {
      background: var(--vscode-errorForeground, #f44747);
      color: #fff;
    }

    .ed-select {
      padding: 3px 6px;
      border: 1px solid var(--vscode-input-border, #555);
      border-radius: 3px;
      background: var(--vscode-input-background, #3c3c3c);
      color: var(--vscode-input-foreground, #ccc);
      font-size: 12px;
    }

    .ed-validation-badge {
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
    }
    .ed-validation-badge.valid { background: #2d5a2d; color: #4ec94e; }
    .ed-validation-badge.warnings { background: #5a4a2d; color: #cca700; }
    .ed-validation-badge.errors { background: #5a2d2d; color: #f44747; }

    /* Source Browser (Left Panel) */
    .ed-source-browser {
      width: 240px;
      background: var(--vscode-sideBar-background, #252526);
      border-right: 1px solid var(--vscode-panel-border, #333);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      overflow: hidden;
    }
    .ed-source-header {
      padding: 8px 12px;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      color: var(--vscode-sideBarSectionHeader-foreground, #bbb);
      border-bottom: 1px solid var(--vscode-panel-border, #333);
    }
    .ed-source-search {
      padding: 6px 12px;
      border-bottom: 1px solid var(--vscode-panel-border, #333);
    }
    .ed-source-search input {
      width: 100%;
      padding: 4px 8px;
      border: 1px solid var(--vscode-input-border, #555);
      border-radius: 3px;
      background: var(--vscode-input-background, #3c3c3c);
      color: var(--vscode-input-foreground, #ccc);
      font-size: 12px;
      box-sizing: border-box;
    }
    .ed-source-list {
      flex: 1;
      overflow-y: auto;
      padding: 4px 0;
    }
    .ed-source-col {
      padding: 4px 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
    }
    .ed-source-col:hover {
      background: var(--vscode-list-hoverBackground, #2a2d2e);
    }
    .ed-source-col.assigned { opacity: 0.5; }
    .ed-source-col-name { flex: 1; font-family: var(--vscode-editor-font-family, monospace); }
    .ed-source-col-type { color: var(--vscode-descriptionForeground, #888); font-size: 10px; }
    .ed-source-col-badge {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .ed-reserved-badge {
      font-size: 9px;
      padding: 0 3px;
      border-radius: 2px;
      background: #5a4a2d;
      color: #cca700;
    }

    /* Property Editor (Right Panel) */
    .ed-property-editor {
      width: 300px;
      background: var(--vscode-sideBar-background, #252526);
      border-left: 1px solid var(--vscode-panel-border, #333);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      overflow: hidden;
    }
    .ed-prop-header {
      padding: 8px 12px;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      color: var(--vscode-sideBarSectionHeader-foreground, #bbb);
      border-bottom: 1px solid var(--vscode-panel-border, #333);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .ed-prop-body {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }
    .ed-prop-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--vscode-descriptionForeground, #888);
      text-align: center;
      padding: 20px;
      font-size: 12px;
    }
    .ed-form-group {
      margin-bottom: 12px;
    }
    .ed-form-group label {
      display: block;
      font-size: 11px;
      color: var(--vscode-descriptionForeground, #888);
      margin-bottom: 4px;
      text-transform: uppercase;
    }
    .ed-form-group input[type="text"],
    .ed-form-group textarea,
    .ed-form-group select {
      width: 100%;
      padding: 4px 8px;
      border: 1px solid var(--vscode-input-border, #555);
      border-radius: 3px;
      background: var(--vscode-input-background, #3c3c3c);
      color: var(--vscode-input-foreground, #ccc);
      font-size: 12px;
      font-family: var(--vscode-editor-font-family, monospace);
      box-sizing: border-box;
    }
    .ed-form-group textarea { min-height: 60px; resize: vertical; }
    .ed-column-picker {
      max-height: 200px;
      overflow-y: auto;
      border: 1px solid var(--vscode-input-border, #555);
      border-radius: 3px;
      background: var(--vscode-input-background, #3c3c3c);
    }
    .ed-column-picker-item {
      padding: 3px 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-family: var(--vscode-editor-font-family, monospace);
    }
    .ed-column-picker-item:hover {
      background: var(--vscode-list-hoverBackground, #2a2d2e);
    }
    .ed-column-picker-item input[type="checkbox"] {
      margin: 0;
    }
    .ed-toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 0;
    }

    /* Code Preview (Bottom Panel) */
    .ed-code-preview {
      height: 220px;
      background: var(--vscode-editor-background, #1e1e1e);
      border-top: 1px solid var(--vscode-panel-border, #333);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      overflow: hidden;
    }
    .ed-code-tabs {
      display: flex;
      background: var(--vscode-editorGroupHeader-tabsBackground, #2d2d2d);
      overflow-x: auto;
      flex-shrink: 0;
    }
    .ed-code-tab {
      padding: 6px 14px;
      cursor: pointer;
      font-size: 12px;
      border: none;
      background: transparent;
      color: var(--vscode-tab-inactiveForeground, #888);
      border-bottom: 2px solid transparent;
      white-space: nowrap;
    }
    .ed-code-tab:hover {
      color: var(--vscode-tab-activeForeground, #fff);
    }
    .ed-code-tab.active {
      color: var(--vscode-tab-activeForeground, #fff);
      border-bottom-color: var(--vscode-tab-activeBorderTop, #4a9eff);
    }
    .ed-code-content {
      flex: 1;
      overflow: auto;
      padding: 8px 16px;
    }
    .ed-code-content pre {
      margin: 0;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscode-editor-font-size, 13px);
      line-height: 1.5;
      white-space: pre;
      color: var(--vscode-editor-foreground, #ccc);
    }
    .ed-code-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--vscode-descriptionForeground, #888);
      font-size: 12px;
    }

    /* Loading state */
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      color: var(--vscode-descriptionForeground);
    }
  </style>
</head>
<body>
  <div id="root">
    <div class="loading">Loading Entity Designer v2...</div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

/**
 * Generate a random nonce for CSP
 */
function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
