/**
 * Hook for accessing the VS Code API in webviews
 */

interface VSCodeApi {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
}

// Declare the acquireVsCodeApi function that VS Code injects
declare function acquireVsCodeApi(): VSCodeApi;

// Cache the API instance
let vscodeApi: VSCodeApi | undefined;

/**
 * Get the VS Code API instance
 * This must be called exactly once per webview session
 */
export function useVSCodeApi(): VSCodeApi {
  if (!vscodeApi) {
    vscodeApi = acquireVsCodeApi();
  }
  return vscodeApi;
}
