import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';
import type {
  EntityConfigV2,
  DvObject,
  DvObjectType,
  ColumnDefinition,
  ValidationError,
  GeneratedFile,
  ExtensionMessage,
  HubObject,
  SatelliteObject,
  LinkObject,
  DcSatelliteObject,
  DV_TYPE_COLORS,
} from '../types';
import { useVSCodeApi } from './useVSCodeApi';

interface DesignerState {
  config: EntityConfigV2 | null;
  availableHubs: string[];
  availableConcepts: string[];
  sourceColumns: Record<string, ColumnDefinition>;
  selectedObjectName: string | null;
  isDirty: boolean;
  validationErrors: ValidationError[];
  previewFiles: GeneratedFile[];
  previewTab: string;
}

const INITIAL_STATE: DesignerState = {
  config: null,
  availableHubs: [],
  availableConcepts: [],
  sourceColumns: {},
  selectedObjectName: null,
  isDirty: false,
  validationErrors: [],
  previewFiles: [],
  previewTab: '',
};

/**
 * Main state management hook for Entity Designer v2.
 * Handles config state, node/edge derivation, and VS Code messaging.
 */
export function useEntityDesigner() {
  const vscode = useVSCodeApi();
  const [state, setState] = useState<DesignerState>(INITIAL_STATE);
  const configRef = useRef<EntityConfigV2 | null>(null);

  // Keep ref in sync
  useEffect(() => {
    configRef.current = state.config;
  }, [state.config]);

  // ─── Message Handling ──────────────────────────────────────────
  const handleMessage = useCallback((event: MessageEvent<ExtensionMessage>) => {
    const msg = event.data;
    switch (msg.type) {
      case 'init':
        setState(prev => ({
          ...prev,
          config: msg.config,
          availableHubs: msg.availableHubs,
          availableConcepts: msg.availableConcepts,
          sourceColumns: msg.sourceColumns,
          isDirty: false,
        }));
        break;
      case 'validationResult':
        setState(prev => ({ ...prev, validationErrors: msg.errors }));
        break;
      case 'generateResult':
        // Generation complete — extension shows notification
        break;
      case 'codePreview':
        setState(prev => ({
          ...prev,
          previewFiles: msg.files,
          previewTab: msg.files[0]?.path || '',
        }));
        break;
      case 'error':
        console.error('[EntityDesignerV2]', msg.message);
        break;
    }
  }, []);

  // Listen for messages
  useEffect(() => {
    window.addEventListener('message', handleMessage);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage, vscode]);

  // ─── Config Mutations ──────────────────────────────────────────
  const updateConfig = useCallback((updater: (config: EntityConfigV2) => EntityConfigV2) => {
    setState(prev => {
      if (!prev.config) return prev;
      const newConfig = updater(prev.config);
      return { ...prev, config: newConfig, isDirty: true };
    });
  }, []);

  const addObject = useCallback((objectType: DvObjectType, name: string) => {
    updateConfig(config => {
      const newObj = createDefaultObject(objectType, name, config);
      return {
        ...config,
        objects: { ...config.objects, [name]: newObj },
      };
    });
    setState(prev => ({ ...prev, selectedObjectName: name }));
  }, [updateConfig]);

  const updateObject = useCallback((name: string, object: DvObject) => {
    // Keep the config map KEY stable (it is the React Flow node id and the
    // relationship reference target). The editable display name lives in
    // object.name and is what the canvas shows + generation uses, so renaming
    // never churns the node id (which would deselect it).
    updateConfig(config => ({
      ...config,
      objects: { ...config.objects, [name]: object },
    }));
  }, [updateConfig]);

  const removeObject = useCallback((name: string) => {
    updateConfig(config => {
      const { [name]: _removed, ...rest } = config.objects;
      return { ...config, objects: rest };
    });
    setState(prev => ({
      ...prev,
      selectedObjectName: prev.selectedObjectName === name ? null : prev.selectedObjectName,
    }));
  }, [updateConfig]);

  const selectObject = useCallback((name: string | null) => {
    setState(prev => {
      if (prev.selectedObjectName === name) return prev; // no-op guard
      return { ...prev, selectedObjectName: name };
    });
    if (name) {
      vscode.postMessage({ type: 'previewCode', objectName: name });
    }
  }, [vscode]);

  // ─── Actions ───────────────────────────────────────────────────
  const save = useCallback(() => {
    if (state.config) {
      vscode.postMessage({
        type: 'save',
        config: { ...state.config, savedAt: new Date().toISOString() },
      });
      setState(prev => ({ ...prev, isDirty: false }));
    }
  }, [state.config, vscode]);

  const generate = useCallback(() => {
    vscode.postMessage({ type: 'generate' });
  }, [vscode]);

  const validate = useCallback(() => {
    vscode.postMessage({ type: 'validate' });
  }, [vscode]);

  const setPreviewTab = useCallback((tab: string) => {
    setState(prev => ({ ...prev, previewTab: tab }));
  }, []);

  // ─── Derived Data: Nodes & Edges ──────────────────────────────
  // Memoize to prevent re-computation on every render.
  // IMPORTANT: selectedObjectName is NOT a dependency — selection is
  // handled by React Flow internally to avoid infinite loops.
  const objectsKey = JSON.stringify(state.config?.objects || {});
  const { nodes, edges } = useMemo(
    () => deriveNodesAndEdges(state.config),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [objectsKey]
  );

  // Assigned columns mapping
  const assignedColumns = useMemo(
    () => deriveAssignedColumns(state.config),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [objectsKey]
  );

  // Available hubs/links from config
  const configHubs = state.config
    ? Object.entries(state.config.objects)
        .filter(([, obj]) => obj.type === 'hub')
        .map(([name]) => name)
    : [];

  const configLinks = state.config
    ? Object.entries(state.config.objects)
        .filter(([, obj]) => obj.type === 'link')
        .map(([name]) => name)
    : [];

  const allAvailableHubs = [...new Set([...state.availableHubs, ...configHubs])];

  // Available (unassigned) columns
  const availableColumns = state.config
    ? Object.keys(state.config.columns).filter(col => !assignedColumns[col])
    : [];

  const selectedObject = state.selectedObjectName && state.config?.objects[state.selectedObjectName]
    ? { name: state.selectedObjectName, object: state.config.objects[state.selectedObjectName] }
    : null;

  return {
    config: state.config,
    nodes,
    edges,
    selectedObject,
    isDirty: state.isDirty,
    validationErrors: state.validationErrors,
    previewFiles: state.previewFiles,
    previewTab: state.previewTab,
    sourceColumns: state.config?.columns || state.sourceColumns,
    reservedKeywords: state.config?.reservedKeywords || [],
    assignedColumns,
    availableColumns,
    availableHubs: allAvailableHubs,
    availableLinks: configLinks,
    entityName: state.config?.stagingModel || '',
    concept: state.config?.concept || '',
    sourceTable: state.config?.sourceTable || '',

    addObject,
    updateObject,
    removeObject,
    selectObject,
    save,
    generate,
    validate,
    setPreviewTab,
    updateConfig,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────

function createDefaultObject(
  type: DvObjectType,
  name: string,
  config: EntityConfigV2
): DvObject {
  const baseSourceModel = config.stagingModel;
  const base = { name, sourceModel: baseSourceModel, srcLdts: 'dss_load_date', srcSource: 'dss_record_source' };

  // Clean entity name for hashdiff: sat_internet_service__idms[_ma|_dc] → internet_service
  const satEntity = name.replace(/^sat_/, '').replace(/__.*$/, '');

  switch (type) {
    case 'hub':
      return { ...base, type: 'hub', srcPk: `hk_${name.replace('hub_', '')}`, srcNk: [], srcExtraColumns: ['dss_business_key', 'dss_create_datetime'] };
    case 'satellite':
      return {
        ...base, type: 'satellite',
        srcPk: '', srcHashdiff: { sourceColumn: `hd_${satEntity}`, alias: 'HASHDIFF' },
        srcPayload: [], parentHub: '', generateCurrentView: true,
        srcExtraColumns: ['dss_create_datetime'],
      };
    case 'link':
      return { ...base, type: 'link', srcPk: `hk_${name.replace('link_', '')}`, srcFk: [], srcExtraColumns: ['dss_create_datetime'] };
    case 'ma_satellite':
      return {
        ...base, type: 'ma_satellite',
        srcPk: '', srcCdk: [], srcHashdiff: { sourceColumn: `hd_${satEntity}_ma`, alias: 'HASHDIFF' },
        srcPayload: [], parentHub: '',
      };
    case 'dc_satellite':
      return {
        ...base, type: 'dc_satellite',
        srcPk: '', srcHashdiff: { sourceColumn: `hd_${satEntity}_dc`, alias: 'HASHDIFF' },
        srcPayload: [], parentLink: '',
      };
    case 'reference':
      return { ...base, type: 'reference', primaryKey: '', columns: [] };
    default:
      return { ...base, type: 'hub', srcPk: '', srcNk: [] } as HubObject;
  }
}

const NODE_COLORS: Record<string, string> = {
  hub: '#4a9eff',
  satellite: '#50c878',
  link: '#ff8c42',
  ma_satellite: '#9b59b6',
  dc_satellite: '#e67e22',
  reference: '#95a5a6',
};

function deriveNodesAndEdges(
  config: EntityConfigV2 | null
): { nodes: Node[]; edges: Edge[] } {
  if (!config) return { nodes: [], edges: [] };

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const layout = config.layout?.nodes || {};

  // Position counters per type
  const counters: Record<string, number> = { hub: 0, satellite: 0, link: 0, other: 0 };

  for (const [name, obj] of Object.entries(config.objects)) {
    const pos = layout[name] || getDefaultPosition(obj.type, counters);

    const nodeType = obj.type === 'ma_satellite' || obj.type === 'dc_satellite'
      ? 'satellite' : obj.type === 't_link' ? 'link' : obj.type;

    nodes.push({
      id: name,
      type: nodeType,
      position: pos,
      data: { objectName: obj.name || name, object: obj },
    });

    // Derive edges from relationships
    if (obj.type === 'satellite' || obj.type === 'ma_satellite') {
      const parentHub = (obj as SatelliteObject).parentHub;
      if (parentHub && config.objects[parentHub]) {
        edges.push({
          id: `${name}->${parentHub}`,
          source: name,
          target: parentHub,
          sourceHandle: 'hub-source',
          targetHandle: 'sat-target',
          style: { stroke: NODE_COLORS.satellite },
          animated: true,
        });
      }
    }
    if (obj.type === 'dc_satellite') {
      const parentLink = (obj as DcSatelliteObject).parentLink;
      if (parentLink && config.objects[parentLink]) {
        edges.push({
          id: `${name}->${parentLink}`,
          source: name,
          target: parentLink,
          style: { stroke: NODE_COLORS.dc_satellite },
          animated: true,
        });
      }
    }
    if (obj.type === 'link') {
      const fks = (obj as LinkObject).srcFk;
      for (const fk of fks) {
        // FK references a hub hash key like "hk_projekt" → find "hub_projekt"
        const hubName = Object.keys(config.objects).find(n => {
          const o = config.objects[n];
          return o.type === 'hub' && (o as HubObject).srcPk === fk;
        });
        if (hubName) {
          edges.push({
            id: `${name}->${hubName}`,
            source: name,
            target: hubName,
            sourceHandle: `fk-${fk}`,
            targetHandle: 'link-target',
            style: { stroke: NODE_COLORS.link },
          });
        }
      }
    }
  }

  return { nodes, edges };
}

function getDefaultPosition(type: string, counters: Record<string, number>): { x: number; y: number } {
  const col = type === 'satellite' || type === 'ma_satellite' || type === 'dc_satellite'
    ? 0 : type === 'hub' ? 350 : type === 'link' ? 700 : 350;
  const group = type === 'satellite' || type === 'ma_satellite' || type === 'dc_satellite'
    ? 'satellite' : type === 'hub' ? 'hub' : type === 'link' ? 'link' : 'other';

  const idx = counters[group] || 0;
  counters[group] = idx + 1;
  return { x: col, y: 80 + idx * 250 };
}

function deriveAssignedColumns(config: EntityConfigV2 | null): Record<string, string> {
  if (!config) return {};
  const assigned: Record<string, string> = {};

  for (const [name, obj] of Object.entries(config.objects)) {
    if (obj.type === 'hub') {
      const hub = obj as HubObject;
      const nks = Array.isArray(hub.srcNk) ? hub.srcNk : [hub.srcNk];
      for (const nk of nks) assigned[nk] = name;
    }
    if (obj.type === 'satellite' || obj.type === 'ma_satellite') {
      const sat = obj as SatelliteObject;
      for (const col of sat.srcPayload) assigned[col] = name;
    }
    if (obj.type === 'reference') {
      const ref = obj as ReferenceObject;
      assigned[ref.primaryKey] = name;
      for (const col of ref.columns) assigned[col] = name;
    }
  }
  return assigned;
}
