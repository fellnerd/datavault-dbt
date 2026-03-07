import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

/**
 * Dimension configuration (subset of types.ts for webview)
 */
interface DimensionAttribute {
  name: string;           // Target column name (can be renamed)
  sourceModel: string;    // Source model (e.g., sat_vorgang)
  sourceColumn: string;   // Original source column name
  dataType: string;
}

interface DimensionData {
  name: string;
  concept: string;
  sourceType: 'hub' | 'pit' | 'seed' | 'static';
  sourceHub?: string;
  sourcePIT?: string;
  sourceSeed?: string;
  sourceSatellites: string[];
  scdType: 'type1' | 'type2';
  surrogateKey: string;
  businessKey: string;
  hashKey?: string;
  includeHashKey: boolean;
  attributes: DimensionAttribute[];
  materialization: 'view' | 'table' | 'incremental';
}

type DimensionNodeProps = NodeProps & {
  data: DimensionData;
};

/**
 * Format source reference for display (full model.column)
 */
function formatSource(attr: DimensionAttribute): string {
  if (!attr.sourceModel) return '';
  if (attr.sourceColumn && attr.sourceColumn !== attr.name) {
    return `${attr.sourceModel}.${attr.sourceColumn}`;
  }
  return attr.sourceModel;
}

/**
 * Custom node component for Dimensions in the Mart Designer.
 * 
 * Features:
 * - Per-row handles on LEFT side for incoming FK connections from facts
 * - Source info column showing attribute origin (model.column)
 * - Compact display with overflow handling (max 5 shown)
 */
export const DimensionNode = memo(({ data, selected }: DimensionNodeProps) => {
  const config = data as DimensionData;

  // Safely access arrays with defaults
  const allAttributes = config.attributes || [];
  // Filter out BK from attributes list (it's shown separately)
  const attributes = allAttributes.filter(attr => attr.name !== config.businessKey);

  const skName = `${config.name}_key`;
  
  // Find BK attribute for source info
  const bkAttr = allAttributes.find(attr => attr.name === config.businessKey);

  return (
    <div className={`dimension-node ${selected ? 'selected' : ''}`}>
      {/* Header */}
      <div className="node-header">
        <span className="node-type">DIM</span>
        <span className="node-name">{config.name || 'Dimension'}</span>
        <span className="node-badge">{config.scdType === 'type2' ? 'SCD2' : 'SCD1'}</span>
      </div>

      {/* Body - Table with 3 columns: Label | Name | Source */}
      <div className="node-body">
        {/* Surrogate Key Row - with LEFT handle for incoming FK connections */}
        <div className="node-row node-row-with-handle">
          <Handle
            type="target"
            position={Position.Left}
            id={`col-${skName}`}
            className="row-handle-left"
          />
          <span className="row-label row-label-sk">SK</span>
          <span className="row-value">{skName}</span>
          <span className="row-source">auto</span>
        </div>

        {/* Business Key Row - with LEFT handle */}
        {config.businessKey && (
          <div className="node-row node-row-with-handle">
            <Handle
              type="target"
              position={Position.Left}
              id={`col-${config.businessKey}`}
              className="row-handle-left"
            />
            <span className="row-label row-label-bk">BK</span>
            <span className="row-value">{config.businessKey}</span>
            <span className="row-source">{bkAttr ? formatSource(bkAttr) : ''}</span>
          </div>
        )}

        {/* Hash Key Row - with LEFT handle */}
        {config.includeHashKey && config.hashKey && (
          <div className="node-row node-row-with-handle">
            <Handle
              type="target"
              position={Position.Left}
              id={`col-${config.hashKey}`}
              className="row-handle-left"
            />
            <span className="row-label row-label-hk">HK</span>
            <span className="row-value">{config.hashKey}</span>
            <span className="row-source">{config.sourceHub || ''}</span>
          </div>
        )}

        {/* Divider if we have attributes */}
        {attributes.length > 0 && <div className="node-divider" />}

        {/* Attributes - each with source info */}
        {attributes.slice(0, 5).map((attr, idx) => (
          <div key={attr.name || idx} className="node-row">
            <span className="row-label"></span>
            <span className="row-value">{attr.name}</span>
            <span className="row-source">{formatSource(attr)}</span>
          </div>
        ))}

        {/* Show count if more than 5 attributes */}
        {attributes.length > 5 && (
          <div className="node-row node-more">
            <span className="row-label"></span>
            <span className="row-value">+{attributes.length - 5} more...</span>
            <span className="row-source"></span>
          </div>
        )}

        {/* Hint if no attributes yet */}
        {attributes.length === 0 && !config.businessKey && (
          <div className="node-row node-hint">
            <span className="row-label"></span>
            <span className="row-value">Add attributes from tree</span>
            <span className="row-source"></span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="node-footer">
        {config.materialization || 'table'}
      </div>
    </div>
  );
});

DimensionNode.displayName = 'DimensionNode';
