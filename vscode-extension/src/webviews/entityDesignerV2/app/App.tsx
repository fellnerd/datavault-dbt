import React, { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  NodeTypes,
  Node,
  OnSelectionChangeFunc,
  OnNodesDelete,
} from '@xyflow/react';

import { HubNode } from './components/nodes/HubNode';
import { SatelliteNode } from './components/nodes/SatelliteNode';
import { LinkNode } from './components/nodes/LinkNode';
import { ReferenceNode } from './components/nodes/ReferenceNode';
import { Toolbar } from './components/Toolbar';
import { SourceBrowser } from './components/SourceBrowser';
import { PropertyEditor } from './components/PropertyEditor';
import { CodePreview } from './components/CodePreview';
import { useEntityDesigner } from './hooks/useEntityDesigner';
import type { DvObjectType } from './types';

const nodeTypes: NodeTypes = {
  hub: HubNode,
  satellite: SatelliteNode,
  link: LinkNode,
  reference: ReferenceNode,
};

/**
 * Entity Designer v2 — Main App Component
 *
 * Object-first Data Vault 2.1 designer with React Flow canvas.
 * Users model Hub/Sat/Link objects; staging is auto-derived.
 */
export function App() {
  const designer = useEntityDesigner();

  const [nodes, setNodes, onNodesChange] = useNodesState(designer.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(designer.edges);

  // Sync derived nodes/edges into React Flow state
  React.useEffect(() => {
    setNodes(designer.nodes);
  }, [designer.nodes, setNodes]);

  React.useEffect(() => {
    setEdges(designer.edges);
  }, [designer.edges, setEdges]);

  // Selection handling
  const onSelectionChange: OnSelectionChangeFunc = useCallback(({ nodes: selectedNodes }) => {
    if (selectedNodes.length === 1) {
      designer.selectObject(selectedNodes[0].id);
    } else if (selectedNodes.length === 0) {
      designer.selectObject(null);
    }
  }, [designer]);

  // Node deletion
  const onNodesDelete: OnNodesDelete = useCallback((deletedNodes) => {
    for (const node of deletedNodes) {
      designer.removeObject(node.id);
    }
  }, [designer]);

  // Node position updates → save to layout
  const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
    designer.updateConfig(config => ({
      ...config,
      layout: {
        ...config.layout,
        nodes: {
          ...config.layout?.nodes,
          [node.id]: { x: node.position.x, y: node.position.y },
        },
        zoom: config.layout?.zoom || 1,
        panX: config.layout?.panX || 0,
        panY: config.layout?.panY || 0,
      },
    }));
  }, [designer]);

  // Add object with auto-naming
  const handleAddObject = useCallback((type: DvObjectType) => {
    const config = designer.config;
    if (!config) return;

    const baseName = getDefaultName(type, config.stagingModel);
    let name = baseName;
    let counter = 2;
    while (config.objects[name]) {
      name = `${baseName}_${counter++}`;
    }

    designer.addObject(type, name);
  }, [designer]);

  // Column click in source browser
  const handleColumnSelect = useCallback((columnName: string) => {
    // If an object is selected, add column to its payload
    if (designer.selectedObject) {
      const obj = designer.selectedObject.object;
      if (obj.type === 'satellite' || obj.type === 'ma_satellite') {
        const updated = {
          ...obj,
          srcPayload: [...(obj.srcPayload || []), columnName],
        };
        designer.updateObject(designer.selectedObject.name, updated);
      } else if (obj.type === 'hub') {
        const nks = Array.isArray(obj.srcNk) ? obj.srcNk : [obj.srcNk];
        const updated = { ...obj, srcNk: [...nks, columnName] };
        designer.updateObject(designer.selectedObject.name, updated);
      } else if (obj.type === 'reference') {
        const updated = { ...obj, columns: [...obj.columns, columnName] };
        designer.updateObject(designer.selectedObject.name, updated);
      }
    }
  }, [designer]);

  // Auto-layout
  const handleAutoLayout = useCallback(() => {
    const config = designer.config;
    if (!config) return;

    const layout: Record<string, { x: number; y: number }> = {};
    const counters: Record<string, number> = {};

    for (const [name, obj] of Object.entries(config.objects)) {
      const group = obj.type === 'satellite' || obj.type === 'ma_satellite' || obj.type === 'dc_satellite'
        ? 'satellite' : obj.type;
      const idx = counters[group] || 0;
      counters[group] = idx + 1;

      const col = group === 'satellite' ? 0 : group === 'hub' ? 400 : group === 'link' ? 800 : 400;
      layout[name] = { x: col, y: 80 + idx * 280 };
    }

    designer.updateConfig(c => ({
      ...c,
      layout: { nodes: layout, zoom: 1, panX: 0, panY: 0 },
    }));
  }, [designer]);

  // Keyboard shortcuts
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        designer.save();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [designer]);

  const errorCount = designer.validationErrors.filter(e => e.severity === 'error').length;
  const warnCount = designer.validationErrors.filter(e => e.severity === 'warning').length;

  if (!designer.config) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--vscode-foreground, #ccc)' }}>
        Loading Entity Designer v2...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Toolbar */}
      <Toolbar
        entityName={designer.entityName}
        concept={designer.concept}
        sourceTable={designer.sourceTable}
        objectCount={Object.keys(designer.config.objects).length}
        isDirty={designer.isDirty}
        validationErrors={errorCount}
        validationWarnings={warnCount}
        onAddObject={handleAddObject}
        onSave={designer.save}
        onGenerate={designer.generate}
        onValidate={designer.validate}
        onAutoLayout={handleAutoLayout}
      />

      {/* Main content: Source Browser | Canvas | Property Editor */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: Source Browser */}
        <SourceBrowser
          sourceTable={designer.sourceTable}
          columns={designer.sourceColumns}
          reservedKeywords={designer.reservedKeywords}
          onColumnSelect={handleColumnSelect}
          assignedColumns={designer.assignedColumns}
        />

        {/* Center: React Flow Canvas */}
        <div style={{ flex: 1, position: 'relative' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onSelectionChange={onSelectionChange}
            onNodesDelete={onNodesDelete}
            onNodeDragStop={onNodeDragStop}
            nodeTypes={nodeTypes}
            fitView
            deleteKeyCode="Delete"
            multiSelectionKeyCode="Shift"
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            <Controls />
            <MiniMap
              nodeColor={(node) => {
                const colors: Record<string, string> = {
                  hub: '#4a9eff',
                  satellite: '#50c878',
                  link: '#ff8c42',
                  reference: '#95a5a6',
                };
                return colors[node.type || ''] || '#666';
              }}
              style={{ background: '#1e1e1e' }}
            />
          </ReactFlow>
        </div>

        {/* Right: Property Editor */}
        <PropertyEditor
          selectedObject={designer.selectedObject}
          availableColumns={designer.availableColumns}
          availableHubs={designer.availableHubs}
          availableLinks={designer.availableLinks}
          onUpdateObject={designer.updateObject}
          onRemoveObject={designer.removeObject}
        />
      </div>

      {/* Bottom: Code Preview */}
      <CodePreview
        files={designer.previewFiles}
        activeTab={designer.previewTab}
        onTabChange={designer.setPreviewTab}
      />
    </div>
  );
}

function getDefaultName(type: DvObjectType, stagingModel: string): string {
  // Derive entity name from staging model: ewb_proj_npo_main → proj_npo
  const parts = stagingModel.replace(/^ewb_/, '').replace(/_main$/, '');
  switch (type) {
    case 'hub': return `hub_${parts}`;
    case 'satellite': return `sat_${parts}__abacus`;
    case 'link': return `link_${parts}`;
    case 'ma_satellite': return `sat_${parts}__abacus_ma`;
    case 'dc_satellite': return `sat_${parts}__abacus_dc`;
    case 'reference': return `ref_${parts}`;
    default: return `${type}_${parts}`;
  }
}
