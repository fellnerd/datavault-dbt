import React, { useCallback } from 'react';
import { Node } from '@xyflow/react';

/**
 * Type definitions for properties panel
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
  surrogateKeyStrategy: 'row_number' | 'identity' | 'hash';
  attributes: Array<{
    name: string;
    sourceModel: string;
    sourceColumn: string;
    dataType: string;
  }>;
  materialization: 'view' | 'table' | 'incremental';
}

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
    factJoinColumn?: string;   // Column in fact source for JOIN
    dimJoinColumn?: string;    // Column in dimension for JOIN
    sourceColumn?: string;     // Legacy
    joinColumn?: string;       // Legacy
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
  incrementalUniqueKey?: string[];
}

interface PropertiesPanelProps {
  node: Node;
  onUpdate: (nodeId: string, data: Partial<DimensionData | FactData>) => void;
  onClose: () => void;
}

/**
 * Properties Panel for editing selected node configuration.
 *
 * Features:
 * - Edit dimension properties (SCD Type, Materialization, Surrogate Key Strategy)
 * - Edit fact properties (Materialization, Grain)
 * - Manage attributes and measures
 * - Remove attributes/measures
 */
export function PropertiesPanel({ node, onUpdate, onClose }: PropertiesPanelProps) {
  const isDimension = node.type === 'dimension';
  const data = node.data as DimensionData | FactData;

  const handleChange = useCallback((field: string, value: string | boolean | string[]) => {
    onUpdate(node.id, { [field]: value });
  }, [node.id, onUpdate]);

  const handleRemoveAttribute = useCallback((index: number) => {
    if (isDimension) {
      const dimData = data as DimensionData;
      const newAttributes = [...dimData.attributes];
      newAttributes.splice(index, 1);
      onUpdate(node.id, { attributes: newAttributes });
    }
  }, [node.id, data, isDimension, onUpdate]);

  const handleRemoveMeasure = useCallback((index: number) => {
    if (!isDimension) {
      const factData = data as FactData;
      const newMeasures = [...factData.measures];
      newMeasures.splice(index, 1);
      onUpdate(node.id, { measures: newMeasures });
    }
  }, [node.id, data, isDimension, onUpdate]);

  const handleUpdateMeasureAggregation = useCallback((index: number, aggregation: string) => {
    if (!isDimension) {
      const factData = data as FactData;
      const newMeasures = [...factData.measures];
      newMeasures[index] = { ...newMeasures[index], aggregation: aggregation as FactData['measures'][0]['aggregation'] };
      onUpdate(node.id, { measures: newMeasures });
    }
  }, [node.id, data, isDimension, onUpdate]);

  const handleRemoveDimensionRef = useCallback((index: number) => {
    if (!isDimension) {
      const factData = data as FactData;
      const newRefs = [...factData.dimensionRefs];
      newRefs.splice(index, 1);
      onUpdate(node.id, { dimensionRefs: newRefs });
    }
  }, [node.id, data, isDimension, onUpdate]);

  const handleUpdateDimensionRefJoin = useCallback((index: number, field: 'factJoinColumn' | 'dimJoinColumn', value: string) => {
    if (!isDimension) {
      const factData = data as FactData;
      const newRefs = [...factData.dimensionRefs];
      newRefs[index] = { ...newRefs[index], [field]: value };
      onUpdate(node.id, { dimensionRefs: newRefs });
    }
  }, [node.id, data, isDimension, onUpdate]);

  // Rename attribute (updates 'name' field, keeps sourceColumn intact)
  const handleRenameAttribute = useCallback((index: number, newName: string) => {
    if (isDimension) {
      const dimData = data as DimensionData;
      const newAttributes = [...dimData.attributes];
      newAttributes[index] = { ...newAttributes[index], name: newName };
      onUpdate(node.id, { attributes: newAttributes });
    }
  }, [node.id, data, isDimension, onUpdate]);

  // Rename measure (updates 'name' field, keeps sourceColumn intact)
  const handleRenameMeasure = useCallback((index: number, newName: string) => {
    if (!isDimension) {
      const factData = data as FactData;
      const newMeasures = [...factData.measures];
      newMeasures[index] = { ...newMeasures[index], name: newName };
      onUpdate(node.id, { measures: newMeasures });
    }
  }, [node.id, data, isDimension, onUpdate]);

  // Rename degenerate dimension
  const handleRenameDegenerateDim = useCallback((index: number, newName: string) => {
    if (!isDimension) {
      const factData = data as FactData;
      const newDDs = [...factData.degenerateDimensions];
      newDDs[index] = { ...newDDs[index], name: newName };
      onUpdate(node.id, { degenerateDimensions: newDDs });
    }
  }, [node.id, data, isDimension, onUpdate]);

  // Stop keyboard events from propagating to ReactFlow (so inputs work)
  const stopKeyboardPropagation = (e: React.KeyboardEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      className="properties-panel"
      onKeyDown={stopKeyboardPropagation}
      onKeyUp={stopKeyboardPropagation}
    >
      <div className="properties-panel-header">
        <span>Properties: {data.name}</span>
        <button className="close-btn" onClick={onClose} title="Close">×</button>
      </div>

      <div className="properties-panel-body">
        {/* Common Properties */}
        <div className="property-section">
          <div className="property-group">
            <label className="property-label">Name</label>
            <input
              type="text"
              value={data.name}
              onChange={(e) => handleChange('name', e.target.value)}
                            className="property-input"
            />
          </div>

          <div className="property-group">
            <label className="property-label">Materialization</label>
            <select
              value={data.materialization}
              onChange={(e) => handleChange('materialization', e.target.value)}
              className="property-select"
            >
              <option value="view">View (virtual)</option>
              <option value="table">Table (persisted)</option>
              <option value="incremental">Incremental</option>
            </select>
          </div>
        </div>

        {/* Dimension-specific Properties */}
        {isDimension && (
          <>
            <div className="property-section">
              <h4 className="section-title">Keys</h4>

              <div className="property-info">
                <span className="info-label">Surrogate Key:</span>
                <span className="info-value">{data.name}_key</span>
              </div>

              <div className="property-group">
                <label className="property-label">Business Key (BK)</label>
                <select
                  value={(data as DimensionData).businessKey || ''}
                  onChange={(e) => handleChange('businessKey', e.target.value)}
                  className="property-select"
                >
                  <option value="">-- Select from attributes --</option>
                  {(data as DimensionData).attributes.map((attr) => (
                    <option key={attr.name} value={attr.name}>{attr.name}</option>
                  ))}
                </select>
                {(data as DimensionData).attributes.length === 0 && (
                  <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '4px' }}>
                    Add attributes first to select BK
                  </div>
                )}
              </div>

              <div className="property-group">
                <label className="property-label">
                  <input
                    type="checkbox"
                    checked={(data as DimensionData).includeHashKey}
                    onChange={(e) => handleChange('includeHashKey', e.target.checked)}
                  />
                  {' '}Include Hash Key (HK)
                </label>
              </div>
            </div>

            <div className="property-section">
              <h4 className="section-title">Dimension Settings</h4>

              <div className="property-group">
                <label className="property-label">SCD Type</label>
                <select
                  value={(data as DimensionData).scdType}
                  onChange={(e) => handleChange('scdType', e.target.value)}
                  className="property-select"
                >
                  <option value="type1">Type 1 (Overwrite)</option>
                  <option value="type2">Type 2 (History)</option>
                </select>
              </div>

              <div className="property-group">
                <label className="property-label">Surrogate Key Strategy</label>
                <select
                  value={(data as DimensionData).surrogateKeyStrategy}
                  onChange={(e) => handleChange('surrogateKeyStrategy', e.target.value)}
                  className="property-select"
                >
                  <option value="row_number">ROW_NUMBER (auto)</option>
                  <option value="identity">IDENTITY (table only)</option>
                  <option value="hash">HASH (deterministic)</option>
                </select>
              </div>
            </div>

            {/* Source Info */}
            <div className="property-section">
              <h4 className="section-title">Source</h4>
              <div className="property-info">
                <span className="info-label">Type:</span>
                <span className="info-value">{(data as DimensionData).sourceType}</span>
              </div>
              {(data as DimensionData).sourceHub && (
                <div className="property-info">
                  <span className="info-label">Hub:</span>
                  <span className="info-value">{(data as DimensionData).sourceHub}</span>
                </div>
              )}
              {(data as DimensionData).sourcePIT && (
                <div className="property-info">
                  <span className="info-label">PIT:</span>
                  <span className="info-value">{(data as DimensionData).sourcePIT}</span>
                </div>
              )}
              {(data as DimensionData).sourceSeed && (
                <div className="property-info">
                  <span className="info-label">Seed:</span>
                  <span className="info-value">{(data as DimensionData).sourceSeed}</span>
                </div>
              )}
              {(data as DimensionData).sourceSatellites.length > 0 && (
                <div className="property-info">
                  <span className="info-label">Satellites:</span>
                  <span className="info-value">{(data as DimensionData).sourceSatellites.join(', ')}</span>
                </div>
              )}
            </div>

            {/* Attributes */}
            <div className="property-section">
              <h4 className="section-title">
                Attributes ({(data as DimensionData).attributes.length})
              </h4>
              <div className="attributes-list">
                {(data as DimensionData).attributes.map((attr, index) => (
                  <div key={`${attr.sourceColumn}-${index}`} className="attribute-item-editable">
                    <div className="attr-row-top">
                      <input
                        type="text"
                        value={attr.name}
                        onChange={(e) => handleRenameAttribute(index, e.target.value)}
                        className="attr-name-input"
                        title="Column name in dimension (rename here)"
                      />
                      <button
                        className="remove-btn"
                        onClick={() => handleRemoveAttribute(index)}
                        title="Remove attribute"
                      >
                        ×
                      </button>
                    </div>
                    <div className="attr-source-info">
                      ← {attr.sourceModel}.{attr.sourceColumn}
                    </div>
                  </div>
                ))}
                {(data as DimensionData).attributes.length === 0 && (
                  <div className="empty-hint">
                    Right-click on a Satellite in the tree to add attributes
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Fact-specific Properties */}
        {!isDimension && (
          <>
            <div className="property-section">
              <h4 className="section-title">Fact Settings</h4>

              {/* Source Info */}
              <div className="property-info">
                <span className="info-label">Source Link:</span>
                <span className="info-value">{(data as FactData).sourceLink || 'None'}</span>
              </div>
              {(data as FactData).sourceBridge && (
                <div className="property-info">
                  <span className="info-label">Bridge:</span>
                  <span className="info-value">{(data as FactData).sourceBridge}</span>
                </div>
              )}
            </div>

            {/* Dimension References */}
            <div className="property-section">
              <h4 className="section-title">
                Dimension References ({(data as FactData).dimensionRefs.length})
              </h4>
              <div className="dimension-refs-list">
                {(data as FactData).dimensionRefs.map((ref, index) => (
                  <div key={`${ref.foreignKey}-${index}`} className="dim-ref-item-expanded">
                    <div className="dim-ref-header">
                      <span className="ref-fk">{ref.foreignKey}</span>
                      <span className="ref-dim">→ {ref.dimensionName}</span>
                      <button
                        className="remove-btn"
                        onClick={() => handleRemoveDimensionRef(index)}
                        title="Remove reference"
                      >
                        ×
                      </button>
                    </div>
                    <div className="dim-ref-join-config">
                      <div className="join-field">
                        <label>Fact Join Column:</label>
                        <input
                          type="text"
                          value={ref.factJoinColumn || ''}
                          onChange={(e) => handleUpdateDimensionRefJoin(index, 'factJoinColumn', e.target.value)}
                                                    placeholder="e.g., issue_status_id"
                          className="property-input-small"
                        />
                      </div>
                      <div className="join-field">
                        <label>Dim Join Column:</label>
                        <input
                          type="text"
                          value={ref.dimJoinColumn || ''}
                          onChange={(e) => handleUpdateDimensionRefJoin(index, 'dimJoinColumn', e.target.value)}
                                                    placeholder="e.g., issue_status_id"
                          className="property-input-small"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {(data as FactData).dimensionRefs.length === 0 && (
                  <div className="empty-hint">
                    Connect this fact to dimensions by drawing edges
                  </div>
                )}
              </div>
            </div>

            {/* Grain */}
            <div className="property-section">
              <h4 className="section-title">Grain</h4>
              <div className="grain-display">
                {(data as FactData).grain.length > 0
                  ? (data as FactData).grain.join(' + ')
                  : '(not defined)'}
              </div>
            </div>

            {/* Degenerate Dimensions */}
            {(data as FactData).degenerateDimensions.length > 0 && (
              <div className="property-section">
                <h4 className="section-title">
                  Degenerate Dimensions ({(data as FactData).degenerateDimensions.length})
                </h4>
                <div className="dd-list">
                  {(data as FactData).degenerateDimensions.map((dd, index) => (
                    <div key={`${dd.sourceColumn}-${index}`} className="attribute-item-editable">
                      <div className="attr-row-top">
                        <input
                          type="text"
                          value={dd.name}
                          onChange={(e) => handleRenameDegenerateDim(index, e.target.value)}
                          className="attr-name-input"
                          title="Column name (rename here)"
                        />
                        <span className="dd-grain-badge">
                          {dd.isPartOfGrain ? 'GRAIN' : ''}
                        </span>
                      </div>
                      <div className="attr-source-info">
                        ← {dd.sourceModel}.{dd.sourceColumn}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Measures */}
            <div className="property-section">
              <h4 className="section-title">
                Measures ({(data as FactData).measures.length})
              </h4>
              <div className="measures-list">
                {(data as FactData).measures.map((measure, index) => (
                  <div key={`${measure.sourceColumn}-${index}`} className="measure-item-editable">
                    <div className="measure-row-top">
                      <input
                        type="text"
                        value={measure.name}
                        onChange={(e) => handleRenameMeasure(index, e.target.value)}
                        className="measure-name-input"
                        title="Column name in fact (rename here)"
                      />
                      <select
                        value={measure.aggregation || 'SUM'}
                        onChange={(e) => handleUpdateMeasureAggregation(index, e.target.value)}
                        className="measure-agg-select"
                      >
                        <option value="SUM">SUM</option>
                        <option value="COUNT">COUNT</option>
                        <option value="AVG">AVG</option>
                        <option value="MIN">MIN</option>
                        <option value="MAX">MAX</option>
                        <option value="NONE">NONE</option>
                      </select>
                      <button
                        className="remove-btn"
                        onClick={() => handleRemoveMeasure(index)}
                        title="Remove measure"
                      >
                        ×
                      </button>
                    </div>
                    <div className="measure-source-info">
                      ← {measure.sourceModel}.{measure.sourceColumn}
                    </div>
                  </div>
                ))}
                {(data as FactData).measures.length === 0 && (
                  <div className="empty-hint">
                    Right-click on columns in the tree to add measures
                  </div>
                )}
              </div>
            </div>

            {/* Incremental Settings */}
            {(data as FactData).materialization === 'incremental' && (
              <div className="property-section">
                <h4 className="section-title">Incremental Settings</h4>
                <div className="property-info">
                  <span className="info-label">Unique Key:</span>
                  <span className="info-value">
                    {(data as FactData).incrementalUniqueKey?.join(', ') || '(not set)'}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
