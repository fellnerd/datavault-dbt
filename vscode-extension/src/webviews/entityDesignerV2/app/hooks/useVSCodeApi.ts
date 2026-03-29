import { useMemo } from 'react';

interface VSCodeApi {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
}

function acquireVsCodeApi(): VSCodeApi {
  // @ts-expect-error - acquireVsCodeApi is injected by VS Code
  return window.acquireVsCodeApi?.() ?? {
    postMessage: (msg: unknown) => console.log('[Mock VSCode] postMessage:', msg),
    getState: () => undefined,
    setState: () => {}
  };
}

let vscodeApi: VSCodeApi | null = null;

export function useVSCodeApi(): VSCodeApi {
  return useMemo(() => {
    if (!vscodeApi) {
      vscodeApi = acquireVsCodeApi();
    }
    return vscodeApi;
  }, []);
}
