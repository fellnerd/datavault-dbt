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
 * Format source reference for display (full model.column)
 */
function formatSource(sourceModel: string, sourceColumn: string, name: string): string {
  if (!sourceModel) return '';
  if (sourceColumn && sourceColumn !== name) {
    return `${sourceModel}.${sourceColumn}`;
  }
  return sourceModel;
}

/**
 * Custom node component for Facts in the Mart Designer.
 * 
 * Features:
 * - General source handle on RIGHT for creating NEW connections to dimensions
 * - Per-FK handles on RIGHT side for existing dimension connections
 * - Source info column showing where each column comes from
 * - Aggregation badges for measures
 */
export const FactNode = memo(({ data, selected }: FactNodeProps) => {
  const config = data as FactData;

  // Safely access arrays with defaults
  const dimensionRefs = config.dimensionRefs || [];
  const degenerateDimensions = config.degenerateDimensions || [];
  const measures = config.measures || [];

  return (
    <div className={`fact-node ${selected ? 'selected' : ''}`}>
      {/* Header with RIGHT handle for creating NEW dimension connections */}
      <Handle
        type="source"
        position={Position.Right}
        id="fact-out"
        className="header-handle-right"
      />
      <div className="node-header">
        <span className="node-type">FACT</span>
        <span className="node-name">{config.name || 'Fact'}</span>
      </div>

      {/* Body - Table with 3 columns: Label | Name | Source/Agg */}
      <div className="node-body">
        {/* Foreign Keys (Dimension References) - each with RIGHT handle */}
        {dimensionRefs.length > 0 && (
          <>
            {dimensionRefs.map((ref, index) => (
              <div key={ref.foreignKey || index} className="node-row node-row-with-handle">
                <span className="row-label row-label-fk">FK</span>
                <span className="row-value">{ref.foreignKey}</span>
                <span className="row-source row-source-dim">→{ref.dimensionName}</span>
                {/* RIGHT handle for outgoing connection to dimension */}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`fk-${ref.foreignKey}`}
                  className="row-handle-right"
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
                <span className="row-label row-label-dd">DD</span>
                <span className="row-value">{dd.name}</span>
                <span className="row-source">{formatSource(dd.sourceModel, dd.sourceColumn, dd.name)}</span>
              </div>
            ))}
            {degenerateDimensions.length > 3 && (
              <div className="node-row node-more">
                <span className="row-label"></span>
                <span className="row-value">+{degenerateDimensions.length - 3} more...</span>
                <span className="row-source"></span>
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
                <span className="row-label row-label-m">M</span>
                <span className="row-value">{measure.name}</span>
                <span className="row-source">
                  {formatSource(measure.sourceModel, measure.sourceColumn, measure.name)}
                  {measure.aggregation && measure.aggregation !== 'NONE' && (
                    <span className="row-agg">{measure.aggregation}</span>
                  )}
                </span>
              </div>
            ))}
            {measures.length > 5 && (
              <div className="node-row node-more">
                <span className="row-label"></span>
                <span className="row-value">+{measures.length - 5} more...</span>
                <span className="row-source"></span>
              </div>
            )}
          </>
        )}

        {/* Hint if empty */}
        {measures.length === 0 && degenerateDimensions.length === 0 && dimensionRefs.length === 0 && (
          <div className="node-row node-hint">
            <span className="row-label"></span>
            <span className="row-value">Connect to dims or add columns</span>
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

FactNode.displayName = 'FactNode';
