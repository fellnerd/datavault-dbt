import { useEffect, useCallback } from 'react';
import { Node, Edge, useReactFlow } from '@xyflow/react';
import { useVSCodeApi } from './useVSCodeApi';

/**
 * Message payload types (matching extension types)
 */
interface AddDimensionPayload {
  name: string;
  sourceType: 'hub' | 'pit' | 'seed' | 'static';
  sourceHub?: string;
  sourceSeed?: string;
  businessKey: string;
  hashKey?: string;
  columns: Array<{ name: string; dataType?: string }>;
  concept: string;
  surrogateKey: string;
  scdType: 'type1' | 'type2';
  materialization: 'view' | 'table' | 'incremental';
  surrogateKeyStrategy: 'row_number' | 'identity' | 'hash';
  includeHashKey: boolean;
  sourceSatellites: string[];
  attributes: Array<{
    name: string;
    sourceModel: string;
    sourceColumn: string;
    dataType: string;
  }>;
}

interface AddFactPayload {
  name: string;
  sourceLink: string;
  foreignKeys: string[];
  columns: Array<{ name: string; dataType?: string }>;
  concept: string;
}

interface AddAttributesPayload {
  targetNodeId: string;
  sourceModel: string;
  columns: Array<{ name: string; dataType?: string }>;
}

interface AddColumnPayload {
  targetNodeId: string;
  sourceModel: string;
  column: { name: string; dataType?: string };
}

interface SetSourcePayload {
  targetNodeId: string;
  sourceType: 'pit' | 'bridge';
  sourceName: string;
}

interface LoadStatePayload {
  martName: string;
  concept: string;
  nodes: Node[];
  edges: Edge[];
}

type MartDesignerMessage =
  | { type: 'loadState'; payload: LoadStatePayload }
  | { type: 'addDimension'; payload: AddDimensionPayload }
  | { type: 'addFact'; payload: AddFactPayload }
  | { type: 'addAttributes'; payload: AddAttributesPayload }
  | { type: 'addColumn'; payload: AddColumnPayload }
  | { type: 'setSource'; payload: SetSourcePayload };

interface UseMessageHandlerOptions {
  onStateLoaded: (martName: string, concept: string) => void;
  onLoadingComplete: () => void;
  getNextNodePosition: (type: 'dimension' | 'fact') => { x: number; y: number };
}

/**
 * Hook for handling messages from the VS Code extension.
 *
 * Responsibilities:
 * - Listen for postMessage events from the extension
 * - Process incoming messages (add dimension, add fact, etc.)
 * - Update React Flow state accordingly
 * - Notify extension of state changes
 */
export function useMessageHandler({
  onStateLoaded,
  onLoadingComplete,
  getNextNodePosition
}: UseMessageHandlerOptions) {
  const vscode = useVSCodeApi();
  const { setNodes, setEdges, getNodes } = useReactFlow();

  // Handle incoming messages - all handlers defined inside useEffect to avoid stale closures
  useEffect(() => {
    const handleMessage = (event: MessageEvent<MartDesignerMessage>) => {
      const message = event.data;
      console.log('[MartDesigner] Received message:', message.type, message);

      switch (message.type) {
        case 'loadState': {
          const payload = message.payload;
          console.log('[MartDesigner] Loading state:', payload);
          onStateLoaded(payload.martName || '', payload.concept || '');
          setNodes(payload.nodes || []);
          setEdges(payload.edges || []);
          onLoadingComplete();
          break;
        }

        case 'addDimension': {
          const payload = message.payload;
          console.log('[MartDesigner] Adding dimension:', payload.name);
          const existingNodes = getNodes();
          const existingDim = existingNodes.find(n => n.id === payload.name);

          if (existingDim) {
            console.warn(`[MartDesigner] Dimension ${payload.name} already exists`);
            return;
          }

          const newDimNode: Node = {
            id: payload.name,
            type: 'dimension',
            position: getNextNodePosition('dimension'),
            data: {
              name: payload.name,
              concept: payload.concept,
              sourceType: payload.sourceType,
              sourceHub: payload.sourceHub,
              sourceSeed: payload.sourceSeed,
              sourceSatellites: payload.sourceSatellites || [],
              scdType: payload.scdType,
              surrogateKey: payload.surrogateKey,
              businessKey: payload.businessKey,
              hashKey: payload.hashKey,
              includeHashKey: payload.includeHashKey,
              surrogateKeyStrategy: payload.surrogateKeyStrategy,
              attributes: payload.attributes || [],
              materialization: payload.materialization,
            },
          };

          setNodes((nds) => [...nds, newDimNode]);
          vscode.postMessage({ type: 'stateChanged' });
          break;
        }

        case 'addFact': {
          const payload = message.payload;
          console.log('[MartDesigner] Adding fact:', payload.name);
          const existingNodes = getNodes();
          const existingFact = existingNodes.find(n => n.id === payload.name);

          if (existingFact) {
            console.warn(`[MartDesigner] Fact ${payload.name} already exists`);
            return;
          }

          const newFactNode: Node = {
            id: payload.name,
            type: 'fact',
            position: getNextNodePosition('fact'),
            data: {
              name: payload.name,
              concept: payload.concept,
              sourceLink: payload.sourceLink,
              sourceSatellites: [],
              grain: [],
              dimensionRefs: [],
              degenerateDimensions: [],
              measures: [],
              materialization: 'table',
            },
          };

          setNodes((nds) => [...nds, newFactNode]);
          vscode.postMessage({ type: 'stateChanged' });
          break;
        }

        case 'addAttributes': {
          const payload = message.payload;
          console.log('[MartDesigner] Adding attributes to:', payload.targetNodeId);
          setNodes((nds) =>
            nds.map((n) => {
              if (n.id === payload.targetNodeId && n.type === 'dimension') {
                const newAttributes = payload.columns.map((col) => ({
                  name: col.name,
                  sourceModel: payload.sourceModel,
                  sourceColumn: col.name,
                  dataType: col.dataType || 'NVARCHAR(MAX)',
                }));

                const existingSourceSats = (n.data.sourceSatellites as string[]) || [];
                const newSourceSats = existingSourceSats.includes(payload.sourceModel)
                  ? existingSourceSats
                  : [...existingSourceSats, payload.sourceModel];

                return {
                  ...n,
                  data: {
                    ...n.data,
                    sourceSatellites: newSourceSats,
                    attributes: [...((n.data.attributes as unknown[]) || []), ...newAttributes],
                  },
                };
              }
              return n;
            })
          );
          vscode.postMessage({ type: 'stateChanged' });
          break;
        }

        case 'addColumn': {
          const payload = message.payload;
          console.log('[MartDesigner] Adding column:', payload.column.name);
          setNodes((nds) =>
            nds.map((n) => {
              if (n.id === payload.targetNodeId) {
                if (n.type === 'dimension') {
                  return {
                    ...n,
                    data: {
                      ...n.data,
                      attributes: [
                        ...((n.data.attributes as unknown[]) || []),
                        {
                          name: payload.column.name,
                          sourceModel: payload.sourceModel,
                          sourceColumn: payload.column.name,
                          dataType: payload.column.dataType || 'NVARCHAR(MAX)',
                        },
                      ],
                    },
                  };
                } else if (n.type === 'fact') {
                  return {
                    ...n,
                    data: {
                      ...n.data,
                      measures: [
                        ...((n.data.measures as unknown[]) || []),
                        {
                          name: payload.column.name,
                          sourceColumn: payload.column.name,
                          sourceModel: payload.sourceModel,
                          dataType: payload.column.dataType || 'DECIMAL(18,2)',
                          aggregation: 'SUM',
                        },
                      ],
                    },
                  };
                }
              }
              return n;
            })
          );
          vscode.postMessage({ type: 'stateChanged' });
          break;
        }

        case 'setSource': {
          const payload = message.payload;
          console.log('[MartDesigner] Setting source:', payload.sourceName);
          setNodes((nds) =>
            nds.map((n) => {
              if (n.id === payload.targetNodeId) {
                if (n.type === 'dimension' && payload.sourceType === 'pit') {
                  return {
                    ...n,
                    data: {
                      ...n.data,
                      sourcePIT: payload.sourceName,
                      sourceType: 'pit',
                      scdType: 'type2',
                    },
                  };
                } else if (n.type === 'fact' && payload.sourceType === 'bridge') {
                  return {
                    ...n,
                    data: {
                      ...n.data,
                      sourceBridge: payload.sourceName,
                    },
                  };
                }
              }
              return n;
            })
          );
          vscode.postMessage({ type: 'stateChanged' });
          break;
        }
      }
    };

    window.addEventListener('message', handleMessage);

    // Signal that we're ready to receive state
    console.log('[MartDesigner] Sending ready message');
    vscode.postMessage({ type: 'ready' });

    return () => window.removeEventListener('message', handleMessage);
  }, [vscode, setNodes, setEdges, getNodes, onStateLoaded, onLoadingComplete, getNextNodePosition]);

  /**
   * Notify extension that state has changed
   */
  const notifyStateChanged = useCallback(() => {
    vscode.postMessage({ type: 'stateChanged' });
  }, [vscode]);

  /**
   * Notify extension of node selection change
   */
  const notifySelectionChange = useCallback((nodeId: string | null) => {
    vscode.postMessage({
      type: 'nodeSelected',
      payload: { nodeId }
    });
  }, [vscode]);

  return {
    notifyStateChanged,
    notifySelectionChange
  };
}
