import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import { App } from './App';

// Note: React Flow CSS is loaded inline via getWebviewContent.ts

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <ReactFlowProvider>
        <App />
      </ReactFlowProvider>
    </React.StrictMode>
  );
}
