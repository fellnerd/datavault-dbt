import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

/**
 * Fact configuration (subset of types.ts for webview)
 */
interface FactData {
  name: string;
  concept: string;
  sourceLink?: string;
  sourceBridge?: string;
  sourceSatellites?: string[];
  grain: string[];
  dimensionRefs: Array<{
    dimensionName: string;
    foreignKey: string;
    sourceColumn: string;
    joinColumn: string;
    roleAlias?: string;
    isRolePlaying: boolean;
  }>;
  degenerateDimensions: Array<{
    name: string;
    sourceColumn: string;
    sourceModel: string;
    dataType: string;
    isPartOfGrain: boolean;
  }>;
  measures: Array<{
    name: string;
    sourceColumn: string;
    sourceModel: string;
    dataType: string;
    aggregation?: 'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX' | 'NONE';
  }>;
  materialization: 'view' | 'table' | 'incremental';
}

type FactNodeProps = NodeProps & {
  data: FactData;
};

/**
 * Custom node component for Facts in the Mart Designer.
 */
export const FactNode = memo(({ data, selected }: FactNodeProps) => {
  const config = data as FactData;

  // Safely access arrays with defaults
  const dimensionRefs = config.dimensionRefs || [];
  const degenerateDimensions = config.degenerateDimensions || [];
  const measures = config.measures || [];

  return (
    <div className={`fact-node ${selected ? 'selected' : ''}`}>
      {/* Left side handles - for incoming connections */}
      <Handle
        type="target"
        position={Position.Left}
        id="fact-in"
      />

      {/* Right side handle - for creating new connections to dimensions */}
      <Handle
        type="source"
        position={Position.Right}
        id="fact-out"
      />

      {/* Header */}
      <div className="node-header">
        <span className="node-type">FACT</span>
        <span className="node-name">{config.name || 'Fact'}</span>
      </div>

      {/* Body */}
      <div className="node-body">
        {/* Foreign Keys (Dimension References) - each with its own handle */}
        {dimensionRefs.length > 0 && (
          <>
            {dimensionRefs.map((ref, index) => (
              <div key={ref.foreignKey || index} className="node-row node-row-with-handle">
                <span className="row-label">FK</span>
                <span className="row-value">{ref.foreignKey}</span>
                {/* Individual handle for this FK */}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`fk-${ref.foreignKey}`}
                  className="row-handle"
                />
              </div>
            ))}
          </>
        )}

        {/* Degenerate Dimensions */}
        {degenerateDimensions.length > 0 && (
          <>
            {dimensionRefs.length > 0 && <div className="node-divider" />}
            {degenerateDimensions.slice(0, 3).map((dd, idx) => (
              <div key={dd.name || idx} className="node-row">
                <span className="row-label">DD</span>
                <span className="row-value">{dd.name}</span>
              </div>
            ))}
            {degenerateDimensions.length > 3 && (
              <div className="node-row node-more">
                +{degenerateDimensions.length - 3} more...
              </div>
            )}
          </>
        )}

        {/* Measures */}
        {measures.length > 0 && (
          <>
            {(dimensionRefs.length > 0 || degenerateDimensions.length > 0) && <div className="node-divider" />}
            {measures.slice(0, 5).map((measure, idx) => (
              <div key={measure.name || idx} className="node-row">
                <span className="row-label">M</span>
                <span className="row-value">{measure.name}</span>
                {measure.aggregation && measure.aggregation !== 'NONE' && (
                  <span className="row-agg">{measure.aggregation}</span>
                )}
              </div>
            ))}
            {measures.length > 5 && (
              <div className="node-row node-more">
                +{measures.length - 5} more...
              </div>
            )}
          </>
        )}

        {/* Hint if empty */}
        {measures.length === 0 && degenerateDimensions.length === 0 && dimensionRefs.length === 0 && (
          <div className="node-row node-hint">
            Connect to dimensions or add columns
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

FactNode.displayName = 'FactNode';
