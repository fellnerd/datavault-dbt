import * as vscode from 'vscode';

/**
 * Generates the HTML content for the Entity Designer webview
 */
export function getWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): string {
  // Get the local path to the bundled webview script
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'out', 'webviews', 'entityDesigner.js')
  );

  // Get the local path to vscrui codicon CSS
  const codiconUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'node_modules', 'vscrui', 'dist', 'codicon.css')
  );

  // Use a nonce to whitelist which scripts can be run
  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <link href="${codiconUri}" rel="stylesheet" />
  <title>Entity Designer</title>
  <style>
    :root {
      --container-padding: 16px;
    }
    
    body {
      padding: 0;
      margin: 0;
      color: var(--vscode-foreground);
      font-size: var(--vscode-font-size);
      font-weight: var(--vscode-font-weight);
      font-family: var(--vscode-font-family);
      background-color: var(--vscode-editor-background);
    }
    
    #root {
      padding: var(--container-padding);
    }
    
    .entity-designer {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    
    .entity-designer header {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .entity-designer footer {
      display: flex;
      gap: 8px;
      padding-top: 8px;
    }
    
    .column-grid {
      width: 100%;
      border-collapse: collapse;
    }
    
    .column-grid th,
    .column-grid td {
      padding: 8px 12px;
      text-align: left;
      border-bottom: 1px solid var(--vscode-widget-border);
    }
    
    .column-grid th {
      background-color: var(--vscode-editor-selectionBackground);
      font-weight: 600;
    }
    
    .column-grid tr:hover {
      background-color: var(--vscode-list-hoverBackground);
    }
    
    .column-name {
      font-family: var(--vscode-editor-font-family);
      font-weight: 500;
    }
    
    .data-type {
      font-family: var(--vscode-editor-font-family);
      font-size: 0.9em;
      color: var(--vscode-descriptionForeground);
    }
    
    .preview-section {
      margin-top: 16px;
    }
    
    .preview-section pre {
      background-color: var(--vscode-textCodeBlock-background);
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      line-height: 1.4;
    }
    
    .loading-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
  </style>
</head>
<body>
  <div id="root">
    <div class="entity-designer">
      <p>Loading Entity Designer...</p>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

/**
 * Generate a nonce for CSP
 */
function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
