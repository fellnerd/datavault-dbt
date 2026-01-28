import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Node,
  Edge,
  BackgroundVariant,
  NodeTypes,
  OnConnect,
  OnSelectionChangeFunc,
  OnEdgesDelete,
  OnNodesDelete
} from '@xyflow/react';
// CSS is loaded inline via getWebviewContent.ts

import { DimensionNode } from './components/DimensionNode';
import { FactNode } from './components/FactNode';
import { PropertiesPanel } from './components/PropertiesPanel';
import { Toolbar, EmptyToolbar } from './components/Toolbar';
import { useVSCodeApi } from './hooks/useVSCodeApi';

// Custom node types
const nodeTypes: NodeTypes = {
  dimension: DimensionNode,
  fact: FactNode,
};

// Simple validation for webview (matches extension validation)
interface ValidationResult {
  errors: number;
  warnings: number;
  messages: string[];
}

function validateDesignerState(nodes: Node[], edges: Edge[]): ValidationResult {
  const messages: string[] = [];
  let errors = 0;
  let warnings = 0;

  for (const node of nodes) {
    if (node.type === 'dimension') {
      const data = node.data as {
        name: string;
        sourceHub?: string;
        sourceSeed?: string;
        sourcePIT?: string;
        attributes?: unknown[];
        scdType?: string;
        sourceSatellites?: string[];
      };

      // Warning: No attributes (source comes from where attributes are added)
      if (!data.attributes || data.attributes.length === 0) {
        warnings++;
        messages.push(`[WARN] ${data.name}: No attributes`);
      }

      // Warning: SCD2 without PIT for multi-satellite
      if (data.scdType === 'type2' && !data.sourcePIT && (data.sourceSatellites?.length || 0) > 1) {
        warnings++;
        messages.push(`[WARN] ${data.name}: SCD Type 2 without PIT`);
      }
    }

    if (node.type === 'fact') {
      const data = node.data as {
        name: string;
        sourceLink?: string;
        sourceBridge?: string;
        dimensionRefs?: unknown[];
        measures?: unknown[];
        degenerateDimensions?: unknown[];
        materialization?: string;
        incrementalUniqueKey?: string[];
      };

      // Warning: No dimension refs (not error - factless facts exist)
      if (!data.dimensionRefs || data.dimensionRefs.length === 0) {
        warnings++;
        messages.push(`[WARN] ${data.name}: No dimension references`);
      }

      // Warning: No measures and no degenerate dimensions
      if ((!data.measures || data.measures.length === 0) && (!data.degenerateDimensions || data.degenerateDimensions.length === 0)) {
        warnings++;
        messages.push(`[WARN] ${data.name}: No measures or degenerate dimensions`);
      }

      // Error: Incremental without unique key
      if (data.materialization === 'incremental' && (!data.incrementalUniqueKey || data.incrementalUniqueKey.length === 0)) {
        errors++;
        messages.push(`[ERROR] ${data.name}: Incremental without unique key`);
      }
    }
  }

  return { errors, warnings, messages };
}

/**
 * Main Mart Designer App Component
 *
 * Features:
 * - React Flow canvas for visual star schema design
 * - Custom dimension and fact nodes
 * - Toolbar with validation status
 * - Properties panel for editing selected node
 * - Message handling for VS Code extension communication
 */
export function App() {
  const vscode = useVSCodeApi();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Derive selectedNode from nodes array (so it updates when nodes change)
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find(n => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);
  const [isDirty, setIsDirty] = useState(false);
  const [martName, setMartName] = useState('');
  const [concept, setConcept] = useState('');
  const [showValidation, setShowValidation] = useState(false);

  // Compute validation on nodes/edges change
  const validation = useMemo(() => validateDesignerState(nodes, edges), [nodes, edges]);

  // Compute counts
  const dimensionCount = useMemo(() => nodes.filter(n => n.type === 'dimension').length, [nodes]);
  const factCount = useMemo(() => nodes.filter(n => n.type === 'fact').length, [nodes]);

  // Get position for new nodes
  const getNextNodePosition = useCallback((type: 'dimension' | 'fact'): { x: number; y: number } => {
    const existingNodes = nodes.filter((n) => n.type === type);
    const baseX = type === 'dimension' ? 100 : 500;
    const y = 100 + existingNodes.length * 250;
    return { x: baseX, y };
  }, [nodes]);

  // Handle edge connections
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      // Find source and target nodes
      const sourceNode = nodes.find(n => n.id === connection.source);
      const targetNode = nodes.find(n => n.id === connection.target);
      if (!sourceNode || !targetNode) return;

      // Determine which is fact and which is dimension
      let factNode: Node | undefined;
      let dimNode: Node | undefined;

      if (sourceNode.type === 'fact' && targetNode.type === 'dimension') {
        factNode = sourceNode;
        dimNode = targetNode;
      } else if (sourceNode.type === 'dimension' && targetNode.type === 'fact') {
        factNode = targetNode;
        dimNode = sourceNode;
      } else {
        // Invalid connection (both same type)
        return;
      }

      const dimData = dimNode.data as { name: string };
      const dimName = dimData.name;
      const fkName = `${dimName}_key`; // e.g., dim_vorgang_key

      // Check if this dimension is already connected
      const existingRefs = (factNode.data.dimensionRefs || []) as Array<{ dimensionName: string }>;
      if (existingRefs.some(ref => ref.dimensionName === dimName)) {
        // Already connected
        return;
      }

      // Create unique edge ID
      const edgeId = `e-${factNode.id}-${dimNode.id}-${Date.now()}`;

      // Create edge - use FK-specific handle on fact, dim-in on dimension
      const newEdge: Edge = {
        id: edgeId,
        source: factNode.id,
        target: dimNode.id,
        sourceHandle: `fk-${fkName}`,
        targetHandle: 'dim-in',
        type: 'smoothstep',
        animated: false,
        style: { strokeWidth: 2 },
      } as Edge;

      // Update fact with dimension reference FIRST (so FK handle exists)
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === factNode!.id) {
            const currentRefs = (n.data.dimensionRefs || []) as Array<{
              dimensionName: string;
              foreignKey: string;
              sourceColumn: string;
              joinColumn: string;
              isRolePlaying: boolean;
            }>;

            return {
              ...n,
              data: {
                ...n.data,
                dimensionRefs: [
                  ...currentRefs,
                  {
                    dimensionName: dimName,
                    foreignKey: fkName,
                    factJoinColumn: '',  // To be configured in Properties Panel
                    dimJoinColumn: '',   // To be configured in Properties Panel
                    isRolePlaying: false
                  }
                ],
                grain: [...(n.data.grain || []), fkName]
              }
            };
          }
          return n;
        })
      );

      // Create edge AFTER FK handle exists
      setEdges((eds) => addEdge(newEdge, eds));

      setIsDirty(true);
      vscode.postMessage({ type: 'stateChanged' });
    },
    [setEdges, setNodes, nodes, vscode]
  );

  // Handle edge deletion - remove FK from fact node
  const onEdgesDelete: OnEdgesDelete = useCallback(
    (deletedEdges) => {
      // For each deleted edge, find the fact and remove the dimension ref
      for (const edge of deletedEdges) {
        // Find which node is the fact
        const sourceNode = nodes.find(n => n.id === edge.source);
        const targetNode = nodes.find(n => n.id === edge.target);

        let factNodeId: string | undefined;
        let dimName: string | undefined;

        if (sourceNode?.type === 'fact' && targetNode?.type === 'dimension') {
          factNodeId = sourceNode.id;
          dimName = (targetNode.data as { name: string }).name;
        } else if (sourceNode?.type === 'dimension' && targetNode?.type === 'fact') {
          factNodeId = targetNode.id;
          dimName = (sourceNode.data as { name: string }).name;
        }

        if (factNodeId && dimName) {
          setNodes((nds) =>
            nds.map((n) => {
              if (n.id === factNodeId) {
                const currentRefs = (n.data.dimensionRefs || []) as Array<{ dimensionName: string; foreignKey: string }>;
                const fkName = `${dimName}_key`;
                const newRefs = currentRefs.filter(ref => ref.dimensionName !== dimName);
                const currentGrain = (n.data.grain || []) as string[];
                const newGrain = currentGrain.filter(g => g !== fkName);

                return {
                  ...n,
                  data: {
                    ...n.data,
                    dimensionRefs: newRefs,
                    grain: newGrain
                  }
                };
              }
              return n;
            })
          );
        }
      }

      setIsDirty(true);
      vscode.postMessage({ type: 'stateChanged' });
    },
    [nodes, setNodes, vscode]
  );

  // Handle node deletion
  const onNodesDelete: OnNodesDelete = useCallback(
    (deletedNodes) => {
      for (const node of deletedNodes) {
        // If a dimension is deleted, remove its FK from any connected facts
        if (node.type === 'dimension') {
          const dimName = (node.data as { name: string }).name;

          setNodes((nds) =>
            nds.map((n) => {
              if (n.type === 'fact') {
                const currentRefs = (n.data.dimensionRefs || []) as Array<{ dimensionName: string; foreignKey: string }>;
                const newRefs = currentRefs.filter(ref => ref.dimensionName !== dimName);

                if (newRefs.length !== currentRefs.length) {
                  const fkName = `${dimName}_key`;
                  const currentGrain = (n.data.grain || []) as string[];
                  const newGrain = currentGrain.filter(g => g !== fkName);

                  return {
                    ...n,
                    data: {
                      ...n.data,
                      dimensionRefs: newRefs,
                      grain: newGrain
                    }
                  };
                }
              }
              return n;
            })
          );

          // Remove edges connected to this dimension
          setEdges((eds) => eds.filter(e => e.source !== node.id && e.target !== node.id));
        }

        // If a fact is deleted, just remove its edges
        if (node.type === 'fact') {
          setEdges((eds) => eds.filter(e => e.source !== node.id && e.target !== node.id));
        }
      }

      setIsDirty(true);
      vscode.postMessage({ type: 'stateChanged' });
    },
    [setNodes, setEdges, vscode]
  );

  // Handle selection changes
  const onSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes: selectedNodes }) => {
      const selectedId = selectedNodes.length === 1 ? selectedNodes[0].id : null;
      setSelectedNodeId(selectedId);
      vscode.postMessage({
        type: 'nodeSelected',
        payload: { nodeId: selectedId }
      });
    },
    [vscode]
  );

  // Handle node data update from properties panel
  const handleNodeUpdate = useCallback((nodeId: string, data: Record<string, unknown>) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === nodeId) {
          // Don't change node ID when name changes - keep ID stable
          return {
            ...n,
            data: { ...n.data, ...data }
          };
        }
        return n;
      })
    );
    setIsDirty(true);
    vscode.postMessage({ type: 'stateChanged' });
  }, [setNodes, vscode]);

  // Handle messages from VS Code extension
  // IMPORTANT: Keep dependencies minimal to avoid re-registering listener on every render
  useEffect(() => {
    // Helper to calculate position for new nodes
    const calcNodePosition = (type: 'dimension' | 'fact', currentNodes: Node[]): { x: number; y: number } => {
      const existingNodes = currentNodes.filter((n) => n.type === type);
      const baseX = type === 'dimension' ? 100 : 500;
      const y = 100 + existingNodes.length * 250;
      return { x: baseX, y };
    };

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      console.log('[MartDesigner] Received message:', message.type, message);

      switch (message.type) {
        case 'loadState': {
          // Load state from extension
          const state = message.payload;
          console.log('[MartDesigner] Loading state:', state);
          setMartName(state.martName || '');
          setConcept(state.concept || '');
          setNodes(state.nodes || []);
          setEdges(state.edges || []);
          setIsLoading(false);
          setIsDirty(false);
          break;
        }

        case 'addDimension': {
          // Add new dimension node
          const dimPayload = message.payload;
          console.log('[MartDesigner] Adding dimension:', dimPayload.name);

          // Use functional update to check existing and add node atomically
          setNodes((currentNodes) => {
            const existingDim = currentNodes.find(n => n.id === dimPayload.name);
            if (existingDim) {
              console.warn(`Dimension ${dimPayload.name} already exists`);
              return currentNodes;
            }

            const newDimNode: Node = {
              id: dimPayload.name,
              type: 'dimension',
              position: calcNodePosition('dimension', currentNodes),
              data: {
                name: dimPayload.name,
                concept: dimPayload.concept,
                sourceType: dimPayload.sourceType,
                sourceHub: dimPayload.sourceHub,
                sourceSeed: dimPayload.sourceSeed,
                sourceSatellites: dimPayload.sourceSatellites || [],
                scdType: dimPayload.scdType,
                surrogateKey: dimPayload.surrogateKey,
                surrogateKeyStrategy: dimPayload.surrogateKeyStrategy || 'row_number',
                businessKey: dimPayload.businessKey,
                hashKey: dimPayload.hashKey,
                includeHashKey: dimPayload.includeHashKey,
                attributes: dimPayload.attributes || [],
                materialization: dimPayload.materialization,
              },
            };
            console.log('[MartDesigner] Created dimension node:', newDimNode);
            return [...currentNodes, newDimNode];
          });
          setIsDirty(true);
          vscode.postMessage({ type: 'stateChanged' });
          break;
        }

        case 'addFact': {
          // Add new fact node
          const factPayload = message.payload;
          console.log('[MartDesigner] Adding fact:', factPayload.name);

          // Use functional update to check existing and add node atomically
          setNodes((currentNodes) => {
            const existingFact = currentNodes.find(n => n.id === factPayload.name);
            if (existingFact) {
              console.warn(`Fact ${factPayload.name} already exists`);
              return currentNodes;
            }

            const newFactNode: Node = {
              id: factPayload.name,
              type: 'fact',
              position: calcNodePosition('fact', currentNodes),
              data: {
                name: factPayload.name,
                concept: factPayload.concept,
                sourceLink: factPayload.sourceLink,
                sourceSatellites: [],
                grain: [],
                dimensionRefs: [],
                degenerateDimensions: [],
                measures: [],
                materialization: 'table',
              },
            };
            console.log('[MartDesigner] Created fact node:', newFactNode);
            return [...currentNodes, newFactNode];
          });
          setIsDirty(true);
          vscode.postMessage({ type: 'stateChanged' });
          break;
        }

        case 'addAttributes': {
          // Add attributes to selected node (dimension or fact)
          const attrPayload = message.payload;
          console.log('[MartDesigner] Adding attributes to:', attrPayload.targetNodeId);
          setNodes((nds) =>
            nds.map((n) => {
              if (n.id === attrPayload.targetNodeId) {
                if (n.type === 'dimension') {
                  // For dimensions: add as attributes
                  const newAttributes = attrPayload.columns.map((col: { name: string; dataType?: string }) => ({
                    name: col.name,
                    sourceModel: attrPayload.sourceModel,
                    sourceColumn: col.name,
                    dataType: col.dataType || 'NVARCHAR(MAX)',
                  }));
                  const existingSats = (n.data.sourceSatellites || []) as string[];
                  return {
                    ...n,
                    data: {
                      ...n.data,
                      sourceSatellites: existingSats.includes(attrPayload.sourceModel)
                        ? existingSats
                        : [...existingSats, attrPayload.sourceModel],
                      attributes: [...(n.data.attributes || []), ...newAttributes],
                    },
                  };
                } else if (n.type === 'fact') {
                  // For facts: add numeric columns as measures, others as degenerate dimensions
                  const numericTypes = ['INT', 'BIGINT', 'DECIMAL', 'NUMERIC', 'FLOAT', 'REAL', 'MONEY', 'SMALLMONEY'];
                  const newMeasures: Array<{ name: string; sourceColumn: string; sourceModel: string; dataType: string; aggregation: string }> = [];
                  const newDegenerates: Array<{ name: string; sourceColumn: string; sourceModel: string; dataType: string; isPartOfGrain: boolean }> = [];

                  for (const col of attrPayload.columns as Array<{ name: string; dataType?: string }>) {
                    const dataType = col.dataType || 'NVARCHAR(MAX)';
                    const isNumeric = numericTypes.some(t => dataType.toUpperCase().includes(t));

                    if (isNumeric) {
                      newMeasures.push({
                        name: col.name,
                        sourceColumn: col.name,
                        sourceModel: attrPayload.sourceModel,
                        dataType,
                        aggregation: 'SUM',
                      });
                    } else {
                      newDegenerates.push({
                        name: col.name,
                        sourceColumn: col.name,
                        sourceModel: attrPayload.sourceModel,
                        dataType,
                        isPartOfGrain: false,
                      });
                    }
                  }

                  const existingSats = (n.data.sourceSatellites || []) as string[];
                  return {
                    ...n,
                    data: {
                      ...n.data,
                      sourceSatellites: existingSats.includes(attrPayload.sourceModel)
                        ? existingSats
                        : [...existingSats, attrPayload.sourceModel],
                      measures: [...(n.data.measures || []), ...newMeasures],
                      degenerateDimensions: [...(n.data.degenerateDimensions || []), ...newDegenerates],
                    },
                  };
                }
              }
              return n;
            })
          );
          setIsDirty(true);
          vscode.postMessage({ type: 'stateChanged' });
          break;
        }

        case 'addColumn': {
          // Add single column to selected node
          const colPayload = message.payload;
          console.log('[MartDesigner] Adding column:', colPayload.column?.name);
          setNodes((nds) =>
            nds.map((n) => {
              if (n.id === colPayload.targetNodeId) {
                if (n.type === 'dimension') {
                  return {
                    ...n,
                    data: {
                      ...n.data,
                      attributes: [
                        ...(n.data.attributes || []),
                        {
                          name: colPayload.column.name,
                          sourceModel: colPayload.sourceModel,
                          sourceColumn: colPayload.column.name,
                          dataType: colPayload.column.dataType || 'NVARCHAR(MAX)',
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
                        ...(n.data.measures || []),
                        {
                          name: colPayload.column.name,
                          sourceColumn: colPayload.column.name,
                          sourceModel: colPayload.sourceModel,
                          dataType: colPayload.column.dataType || 'DECIMAL(18,2)',
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
          setIsDirty(true);
          vscode.postMessage({ type: 'stateChanged' });
          break;
        }

        case 'setSource': {
          // Set PIT/Bridge as source
          const srcPayload = message.payload;
          console.log('[MartDesigner] Setting source:', srcPayload.sourceName);
          setNodes((nds) =>
            nds.map((n) => {
              if (n.id === srcPayload.targetNodeId) {
                if (n.type === 'dimension' && srcPayload.sourceType === 'pit') {
                  return {
                    ...n,
                    data: {
                      ...n.data,
                      sourcePIT: srcPayload.sourceName,
                      sourceType: 'pit',
                      scdType: 'type2',
                    },
                  };
                } else if (n.type === 'fact' && srcPayload.sourceType === 'bridge') {
                  return {
                    ...n,
                    data: {
                      ...n.data,
                      sourceBridge: srcPayload.sourceName,
                    },
                  };
                }
              }
              return n;
            })
          );
          setIsDirty(true);
          vscode.postMessage({ type: 'stateChanged' });
          break;
        }
      }
    };

    window.addEventListener('message', handleMessage);

    // Signal that we're ready
    console.log('[MartDesigner] Sending ready message to extension');
    vscode.postMessage({ type: 'ready' });

    return () => {
      console.log('[MartDesigner] Removing message listener');
      window.removeEventListener('message', handleMessage);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vscode]); // Only depend on vscode - use functional updates for state

  // Handle save
  const handleSave = useCallback(() => {
    vscode.postMessage({
      type: 'save',
      payload: {
        version: '1.0',
        concept,
        martName,
        lastModified: new Date().toISOString(),
        nodes,
        edges,
      },
    });
    setIsDirty(false);
  }, [vscode, concept, martName, nodes, edges]);

  // Handle generate
  const handleGenerate = useCallback(() => {
    if (validation.errors > 0) {
      setShowValidation(true);
      return;
    }

    vscode.postMessage({
      type: 'generate',
      payload: {
        version: '1.0',
        concept,
        martName,
        lastModified: new Date().toISOString(),
        nodes,
        edges,
      },
    });
    setIsDirty(false);
  }, [vscode, concept, martName, nodes, edges, validation.errors]);

  // Handle validate
  const handleValidate = useCallback(() => {
    setShowValidation(prev => !prev);
  }, []);

  // Close properties panel
  const handleCloseProperties = useCallback(() => {
    setSelectedNodeId(null);
    vscode.postMessage({
      type: 'nodeSelected',
      payload: { nodeId: null }
    });
  }, [vscode]);

  // Create new dimension
  const handleNewDimension = useCallback(() => {
    setNodes((currentNodes) => {
      // Generate unique name
      const existingDims = currentNodes.filter(n => n.type === 'dimension');
      const num = existingDims.length + 1;
      const dimName = `dim_new_${num}`;

      const newNode: Node = {
        id: dimName,
        type: 'dimension',
        position: { x: 100, y: 100 + existingDims.length * 250 },
        data: {
          name: dimName,
          concept,
          sourceSatellites: [],
          scdType: 'type1',
          surrogateKeyStrategy: 'row_number',
          businessKey: '',  // Select from attributes dropdown
          includeHashKey: false,
          attributes: [],
          materialization: 'table',
        },
      };
      return [...currentNodes, newNode];
    });
    setIsDirty(true);
    vscode.postMessage({ type: 'stateChanged' });
  }, [concept, vscode]);

  // Create new fact
  const handleNewFact = useCallback(() => {
    setNodes((currentNodes) => {
      // Generate unique name
      const existingFacts = currentNodes.filter(n => n.type === 'fact');
      const num = existingFacts.length + 1;
      const factName = `fact_new_${num}`;

      const newNode: Node = {
        id: factName,
        type: 'fact',
        position: { x: 500, y: 100 + existingFacts.length * 250 },
        data: {
          name: factName,
          concept,
          sourceSatellites: [],
          grain: [],
          dimensionRefs: [],
          degenerateDimensions: [],
          measures: [],
          materialization: 'table',
        },
      };
      return [...currentNodes, newNode];
    });
    setIsDirty(true);
    vscode.postMessage({ type: 'stateChanged' });
  }, [concept, vscode]);

  if (isLoading) {
    return (
      <div className="loading">
        Loading Mart Designer...
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <EmptyToolbar
          martName={martName}
          concept={concept}
          onSave={handleSave}
          onGenerate={handleGenerate}
          onNewDimension={handleNewDimension}
          onNewFact={handleNewFact}
        />

        {/* Empty State */}
        <div className="empty-state">
          <h2>Star Schema Designer</h2>
          <p>
            Start building your dimensional model by creating dimensions and facts.
          </p>
          <p style={{ fontSize: '12px', opacity: 0.7 }}>
            1. Click "+ Dimension" or "+ Fact" to create nodes<br />
            2. Select a node, then right-click on models in the tree<br />
            3. Choose "Add Attributes to Node" to add columns
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <Toolbar
        martName={martName}
        concept={concept}
        dimensionCount={dimensionCount}
        factCount={factCount}
        isDirty={isDirty}
        validationErrors={validation.errors}
        validationWarnings={validation.warnings}
        onSave={handleSave}
        onGenerate={handleGenerate}
        onValidate={handleValidate}
        onNewDimension={handleNewDimension}
        onNewFact={handleNewFact}
      />

      {/* Validation Messages */}
      {showValidation && validation.messages.length > 0 && (
        <div className="validation-panel">
          <div className="validation-header">
            <span>Validation ({validation.errors} errors, {validation.warnings} warnings)</span>
            <button onClick={() => setShowValidation(false)}>×</button>
          </div>
          <div className="validation-messages">
            {validation.messages.map((msg, i) => (
              <div key={i} className={`validation-msg ${msg.startsWith('[ERROR]') ? 'error' : 'warning'}`}>
                {msg}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* React Flow Canvas */}
      <div style={{ flex: 1, position: 'relative' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete}
          onNodesDelete={onNodesDelete}
          onSelectionChange={onSelectionChange}
          nodeTypes={nodeTypes}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView
          snapToGrid
          snapGrid={[20, 20]}
          defaultEdgeOptions={{
            type: 'smoothstep',
            style: { strokeWidth: 1 },
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          <Controls />
          <MiniMap
            nodeColor={() => 'var(--vscode-editor-foreground)'}
            maskColor="rgba(0, 0, 0, 0.3)"
          />
        </ReactFlow>

        {/* Properties Panel */}
        {selectedNode && (
          <PropertiesPanel
            node={selectedNode}
            onUpdate={handleNodeUpdate}
            onClose={handleCloseProperties}
          />
        )}
      </div>
    </div>
  );
}
