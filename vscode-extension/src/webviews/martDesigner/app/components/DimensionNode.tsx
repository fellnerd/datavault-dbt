import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

/**
 * Dimension configuration (subset of types.ts for webview)
 */
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
  attributes: Array<{
    name: string;
    sourceModel: string;
    sourceColumn: string;
    dataType: string;
  }>;
  materialization: 'view' | 'table' | 'incremental';
}

type DimensionNodeProps = NodeProps & {
  data: DimensionData;
};

/**
 * Custom node component for Dimensions in the Mart Designer.
 */
export const DimensionNode = memo(({ data, selected }: DimensionNodeProps) => {
  const config = data as DimensionData;

  // Safely access arrays with defaults
  const allAttributes = config.attributes || [];
  // Filter out BK from attributes list (it's shown separately)
  const attributes = allAttributes.filter(attr => attr.name !== config.businessKey);

  const skName = `${config.name}_key`;

  return (
    <div className={`dimension-node ${selected ? 'selected' : ''}`}>
      {/* Left side handle - for incoming connections from facts */}
      <Handle
        type="target"
        position={Position.Left}
        id="dim-in"
      />

      {/* Right side handle - for outgoing connections to facts */}
      <Handle
        type="source"
        position={Position.Right}
        id="dim-out"
      />

      {/* Header */}
      <div className="node-header">
        <span className="node-type">DIM</span>
        <span className="node-name">{config.name || 'Dimension'}</span>
        <span className="node-badge">{config.scdType === 'type2' ? 'SCD2' : 'SCD1'}</span>
      </div>

      {/* Body */}
      <div className="node-body">
        {/* Surrogate Key - auto-derived from name */}
        <div className="node-row">
          <span className="row-label">SK</span>
          <span className="row-value">{skName}</span>
        </div>

        {/* Business Key - only if set */}
        {config.businessKey && (
          <div className="node-row">
            <span className="row-label">BK</span>
            <span className="row-value">{config.businessKey}</span>
          </div>
        )}

        {/* Hash Key - only if enabled and set */}
        {config.includeHashKey && config.hashKey && (
          <div className="node-row">
            <span className="row-label">HK</span>
            <span className="row-value">{config.hashKey}</span>
          </div>
        )}

        {/* Divider if we have attributes */}
        {attributes.length > 0 && <div className="node-divider" />}

        {/* Attributes */}
        {attributes.slice(0, 5).map((attr, idx) => (
          <div key={attr.name || idx} className="node-row">
            <span className="row-value">{attr.name}</span>
          </div>
        ))}

        {/* Show count if more than 5 attributes */}
        {attributes.length > 5 && (
          <div className="node-row node-more">
            +{attributes.length - 5} more...
          </div>
        )}

        {/* Hint if no attributes yet */}
        {attributes.length === 0 && !config.businessKey && (
          <div className="node-row node-hint">
            Add attributes from tree
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
