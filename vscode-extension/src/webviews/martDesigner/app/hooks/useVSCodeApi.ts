import { useMemo } from 'react';

/**
 * VS Code API interface for webview communication
 */
interface VSCodeApi {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
}

/**
 * Acquire the VS Code API instance.
 * This is a singleton provided by VS Code to webviews.
 */
function acquireVsCodeApi(): VSCodeApi {
  // @ts-expect-error - acquireVsCodeApi is injected by VS Code
  return window.acquireVsCodeApi?.() ?? {
    postMessage: (msg: unknown) => console.log('[Mock VSCode] postMessage:', msg),
    getState: () => undefined,
    setState: () => {}
  };
}

// Singleton instance
let vscodeApi: VSCodeApi | null = null;

/**
 * Hook to get the VS Code API instance.
 * Ensures only one instance is created.
 */
export function useVSCodeApi(): VSCodeApi {
  return useMemo(() => {
    if (!vscodeApi) {
      vscodeApi = acquireVsCodeApi();
    }
    return vscodeApi;
  }, []);
}
