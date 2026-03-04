import * as vscode from 'vscode';

/**
 * Get the HTML content for the Mart Designer webview.
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
    vscode.Uri.joinPath(extensionUri, 'out', 'webviews', 'martDesigner.js')
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
  <title>Mart Designer</title>
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

    /* React Flow Controls */
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

    /* React Flow MiniMap */
    .react-flow__minimap {
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
    }

    /* React Flow Panel */
    .react-flow__panel {
      margin: 10px;
    }

    /* Custom Node Styles - Dynamic width based on content */
    .dimension-node, .fact-node {
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      min-width: 180px;
      max-width: 350px;
      width: auto;
      font-size: 12px;
      cursor: grab;
    }

    .dimension-node:active, .fact-node:active {
      cursor: grabbing;
    }

    .dimension-node.selected, .fact-node.selected {
      border-color: var(--vscode-focusBorder);
      box-shadow: 0 0 0 1px var(--vscode-focusBorder);
    }

    .node-header {
      padding: 6px 10px;
      border-bottom: 1px solid var(--vscode-panel-border);
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      background: var(--vscode-editor-background);
      border-radius: 3px 3px 0 0;
    }

    .node-type {
      font-weight: 600;
      opacity: 0.6;
      font-size: 10px;
    }

    .node-name {
      font-weight: 500;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .node-badge {
      font-size: 9px;
      padding: 1px 4px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 3px;
    }

    .node-body {
      padding: 6px 10px;
    }

    .node-row {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 2px 0;
      font-size: 11px;
    }

    .row-label {
      font-weight: 500;
      opacity: 0.6;
      min-width: 22px;
      font-size: 10px;
      text-align: center;
    }

    /* Label color coding */
    .row-label-sk { color: var(--vscode-symbolIcon-keywordForeground); }
    .row-label-bk { color: var(--vscode-symbolIcon-variableForeground); }
    .row-label-hk { color: var(--vscode-symbolIcon-classForeground); }
    .row-label-fk { color: var(--vscode-symbolIcon-referenceForeground); }
    .row-label-dd { color: var(--vscode-symbolIcon-enumForeground); }
    .row-label-m { color: var(--vscode-symbolIcon-numberForeground); }

    .row-value {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 60px;
    }

    /* Source info column - shows origin (full model.column) */
    .row-source {
      font-size: 9px;
      opacity: 0.6;
      white-space: nowrap;
      font-family: var(--vscode-editor-font-family);
      text-align: right;
      flex-shrink: 0;
    }

    /* FK points to dimension name */
    .row-source-dim {
      color: var(--vscode-textLink-foreground);
    }

    .row-agg {
      font-size: 9px;
      opacity: 0.8;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 0 4px;
      border-radius: 2px;
      margin-left: 4px;
    }

    .node-divider {
      border-top: 1px solid var(--vscode-panel-border);
      margin: 4px 0;
    }

    .node-more, .node-hint {
      font-style: italic;
      opacity: 0.5;
      font-size: 10px;
    }

    .node-footer {
      padding: 4px 10px;
      border-top: 1px solid var(--vscode-panel-border);
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
    }

    /* React Flow Handle styling */
    .react-flow__handle {
      width: 8px;
      height: 8px;
      background: var(--vscode-foreground);
      opacity: 0.4;
    }

    .react-flow__handle:hover {
      opacity: 1;
    }

    /* Header handle - small dot in header for creating new connections */
    .header-handle-right {
      right: -4px;
      top: 14px;
      width: 8px;
      height: 8px;
      background: var(--vscode-button-background);
      opacity: 0.5;
    }

    .header-handle-right:hover {
      opacity: 1;
    }

    /* Row with handle - positioned relative for absolute handle placement */
    .node-row-with-handle {
      position: relative;
    }

    /* RIGHT side handle (for Fact FK → Dimension) */
    .row-handle-right {
      position: absolute;
      right: -14px;
      top: 50%;
      transform: translateY(-50%);
      width: 6px;
      height: 6px;
    }

    /* LEFT side handle (for Dimension receiving connections) */
    .row-handle-left {
      position: absolute;
      left: -14px;
      top: 50%;
      transform: translateY(-50%);
      width: 6px;
      height: 6px;
    }

    /* Legacy: support old .row-handle class */
    .node-row-with-handle .row-handle {
      position: absolute;
      right: -14px;
      top: 50%;
      transform: translateY(-50%);
      width: 6px;
      height: 6px;
    }

    /* Toolbar Styles */
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: var(--vscode-sideBar-background);
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .toolbar-left, .toolbar-center, .toolbar-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .toolbar-left {
      flex: 1;
    }

    .toolbar-center {
      flex: 0 0 auto;
    }

    .toolbar-right {
      flex: 1;
      justify-content: flex-end;
    }

    .mart-name {
      font-weight: 600;
      font-size: 14px;
    }

    .mart-concept {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }

    .dirty-indicator {
      color: var(--vscode-editorWarning-foreground);
    }

    .stats {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }

    .toolbar-btn {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 12px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }

    .toolbar-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .toolbar-btn.primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .toolbar-btn.primary:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .toolbar-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .toolbar-new-buttons {
      display: flex;
      gap: 4px;
      margin-left: 16px;
      padding-left: 16px;
      border-left: 1px solid var(--vscode-panel-border);
    }

    .toolbar button {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 12px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }

    .toolbar button:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .toolbar button.primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .toolbar button.primary:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .toolbar .spacer {
      flex: 1;
    }

    /* Validation Button */
    .validation-btn {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }

    .validation-btn.valid {
      background: var(--vscode-charts-green);
      color: white;
    }

    .validation-btn.has-warnings {
      background: var(--vscode-charts-yellow);
      color: black;
    }

    .validation-btn.has-errors {
      background: var(--vscode-errorForeground);
      color: white;
    }

    .validation-btn .icon {
      font-size: 14px;
    }

    .validation-btn .count {
      font-weight: 600;
    }

    /* Validation Panel */
    .validation-panel {
      position: absolute;
      left: 10px;
      bottom: 10px;
      max-width: 400px;
      max-height: 200px;
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      overflow: auto;
      z-index: 10;
    }

    .validation-panel-header {
      padding: 8px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
      font-weight: 600;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .validation-panel-close {
      background: none;
      border: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      font-size: 14px;
      padding: 2px 6px;
    }

    .validation-panel-close:hover {
      background: var(--vscode-button-secondaryHoverBackground);
      border-radius: 4px;
    }

    .validation-panel-body {
      padding: 8px 12px;
    }

    .validation-message {
      padding: 4px 0;
      font-size: 12px;
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }

    .validation-message.error {
      color: var(--vscode-errorForeground);
    }

    .validation-message.warning {
      color: var(--vscode-charts-yellow);
    }

    .validation-message.info {
      color: var(--vscode-charts-blue);
    }

    .validation-icon {
      flex-shrink: 0;
    }

    /* Properties Panel */
    .properties-panel {
      position: absolute;
      right: 10px;
      top: 60px;
      width: 280px;
      max-height: calc(100% - 80px);
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      overflow: auto;
      z-index: 10;
    }

    .properties-panel-header {
      padding: 10px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
      font-weight: 600;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .close-btn {
      background: none;
      border: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      font-size: 18px;
      padding: 0 4px;
      opacity: 0.7;
    }

    .close-btn:hover {
      opacity: 1;
    }

    .properties-panel-body {
      padding: 12px;
    }

    .property-section {
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .property-section:last-child {
      border-bottom: none;
      margin-bottom: 0;
    }

    .section-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--vscode-foreground);
      margin: 0 0 8px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .property-group {
      margin-bottom: 12px;
    }

    .property-info {
      display: flex;
      gap: 8px;
      font-size: 11px;
      margin-bottom: 4px;
    }

    .info-label {
      color: var(--vscode-descriptionForeground);
      min-width: 60px;
    }

    .info-value {
      color: var(--vscode-foreground);
      word-break: break-word;
    }

    .property-input, .property-select {
      width: 100%;
      padding: 6px 8px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      font-size: 12px;
    }

    .property-input:focus, .property-select:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }

    /* Attributes List */
    .attributes-list, .measures-list, .dimension-refs-list, .dd-list {
      max-height: 200px;
      overflow-y: auto;
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
    }

    .dd-grain-badge {
      font-size: 9px;
      padding: 1px 4px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 3px;
      margin-left: auto;
    }

    .attribute-item, .measure-item, .dim-ref-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-bottom: 1px solid var(--vscode-panel-border);
      font-size: 11px;
    }

    .attribute-item:last-child, .measure-item:last-child, .dim-ref-item:last-child {
      border-bottom: none;
    }

    /* Editable attribute/measure items with two rows */
    .attribute-item-editable, .measure-item-editable {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px;
      border-bottom: 1px solid var(--vscode-panel-border);
      font-size: 11px;
    }

    .attribute-item-editable:last-child, .measure-item-editable:last-child {
      border-bottom: none;
    }

    .attr-row-top, .measure-row-top {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .attr-name-input, .measure-name-input {
      flex: 1;
      padding: 4px 6px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 3px;
      font-size: 11px;
    }

    .attr-name-input:focus, .measure-name-input:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }

    .attr-source-info, .measure-source-info {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      font-family: var(--vscode-editor-font-family);
      padding-left: 2px;
    }

    .attr-name, .measure-name, .ref-fk {
      font-weight: 500;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .attr-source, .ref-dim, .ref-role {
      color: var(--vscode-descriptionForeground);
      font-size: 10px;
    }

    .measure-agg-select {
      padding: 2px 4px;
      font-size: 10px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 3px;
    }

    .grain-display {
      padding: 8px;
      background: var(--vscode-input-background);
      border-radius: 4px;
      font-size: 11px;
      font-family: monospace;
    }

    .empty-hint {
      padding: 12px;
      text-align: center;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      font-style: italic;
    }

    .property-label {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
    }

    .property-value {
      font-size: 12px;
    }

    /* Property Items (Attributes, Measures, etc.) */
    .property-items {
      max-height: 150px;
      overflow-y: auto;
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
    }

    .property-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 8px;
      border-bottom: 1px solid var(--vscode-panel-border);
      font-size: 11px;
    }

    .property-item:last-child {
      border-bottom: none;
    }

    .property-item-name {
      font-weight: 500;
    }

    .property-item-source {
      color: var(--vscode-descriptionForeground);
      font-size: 10px;
    }

    .property-item-info {
      flex: 1;
      overflow: hidden;
    }

    .property-item-actions {
      flex-shrink: 0;
      margin-left: 8px;
    }

    .remove-btn {
      background: none;
      border: none;
      color: var(--vscode-errorForeground);
      cursor: pointer;
      padding: 2px 4px;
      font-size: 12px;
      opacity: 0.7;
    }

    .remove-btn:hover {
      opacity: 1;
    }

    .empty-items {
      padding: 12px;
      text-align: center;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      font-style: italic;
    }

    /* Dimension Ref Items */
    .dim-ref-item {
      padding: 8px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .dim-ref-item:last-child {
      border-bottom: none;
    }

    .dim-ref-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }

    .dim-ref-name {
      font-weight: 500;
      font-size: 12px;
    }

    .dim-ref-details {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
    }

    /* Expanded Dimension Ref with Join Config */
    .dim-ref-item-expanded {
      padding: 8px;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-input-background);
      border-radius: 4px;
      margin-bottom: 6px;
    }

    .dim-ref-item-expanded:last-child {
      margin-bottom: 0;
    }

    .dim-ref-item-expanded .dim-ref-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .dim-ref-join-config {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding-left: 8px;
      border-left: 2px solid var(--vscode-panel-border);
    }

    .join-field {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .join-field label {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      min-width: 100px;
    }

    .property-input-small {
      flex: 1;
      padding: 4px 6px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 3px;
      font-size: 11px;
    }

    .property-input-small:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }

    .property-input-small::placeholder {
      color: var(--vscode-input-placeholderForeground);
    }

    /* Measure Items - ensure flex layout */
    .measure-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .measure-item:last-child {
      border-bottom: none;
    }

    .measure-item .measure-name {
      flex: 1;
      font-weight: 500;
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .measure-aggregation {
      margin-top: 4px;
    }

    .measure-aggregation select {
      width: auto;
      padding: 2px 6px;
      font-size: 10px;
    }

    /* Form Elements */
    select, input {
      width: 100%;
      padding: 6px 8px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      font-size: 12px;
    }

    select:focus, input:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }

    /* Loading State */
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--vscode-descriptionForeground);
    }

    /* Empty State */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--vscode-descriptionForeground);
      text-align: center;
      padding: 40px;
    }

    .empty-state h2 {
      margin: 0 0 8px 0;
      color: var(--vscode-foreground);
    }

    .empty-state p {
      margin: 0 0 16px 0;
      max-width: 400px;
    }
  </style>
</head>
<body>
  <div id="root">
    <div class="loading">Loading Mart Designer...</div>
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
