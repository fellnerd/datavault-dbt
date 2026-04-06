import React from 'react';
import { Dropdown, Checkbox, Tag, DropdownOption } from 'vscrui';
import type { DesignerColumnDefinition, DesignerColumnType } from '../../../../types';

interface ColumnGridProps {
  columns: DesignerColumnDefinition[];
  existingHubs: string[];
  onColumnTypeChange: (columnName: string, newType: DesignerColumnType, additionalTypes?: DesignerColumnType[]) => void;
  onHashDiffChange: (columnName: string, include: boolean) => void;
  onFKTargetChange: (columnName: string, targetHub: string) => void;
}

const COLUMN_TYPE_OPTIONS = [
  { label: 'Business Key (Hub)', value: 'hub' },
  { label: 'Attribute (Satellite)', value: 'satellite' },
  { label: 'Foreign Key (Link)', value: 'link' },
  { label: 'Dependent Child Key', value: 'dependent_child' },
  { label: 'Multi-Active Key', value: 'multi_active' },
  { label: 'Metadata', value: 'metadata' },
  { label: 'Ignore', value: 'ignore' }
];

// Helper to check if a type or additionalTypes includes a specific type
const hasType = (col: DesignerColumnDefinition, type: DesignerColumnType): boolean => {
  if (col.columnType === type) return true;
  return col.additionalTypes?.includes(type) ?? false;
};

/**
 * Column grid component for Entity Designer
 */
export const ColumnGrid: React.FC<ColumnGridProps> = ({
  columns,
  existingHubs,
  onColumnTypeChange,
  onHashDiffChange,
  onFKTargetChange
}) => {
  const hubOptions = [
    { label: '-- Select Hub --', value: '' },
    ...existingHubs.map(hub => ({ label: hub, value: hub })),
    { label: '+ Create new Hub...', value: '__new__' }
  ];

  const extractValue = (val: string | DropdownOption | undefined): string => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    return val.value;
  };

  const handleFKTargetChange = (columnName: string, rawValue: string | DropdownOption | undefined) => {
    const value = extractValue(rawValue);
    if (value === '__new__') {
      // TODO: Open dialog to create new hub
      console.log('Create new hub for:', columnName);
      return;
    }
    onFKTargetChange(columnName, value);
  };

  const handleColumnTypeChange = (columnName: string, rawValue: string | DropdownOption | undefined) => {
    const value = extractValue(rawValue) as DesignerColumnType;
    // When changing primary type, preserve satellite if it was additional
    const col = columns.find(c => c.name === columnName);
    const hadSatelliteAdditional = col?.additionalTypes?.includes('satellite');
    
    // If switching to link and previously had satellite additional, keep it
    if (value === 'link' && hadSatelliteAdditional) {
      onColumnTypeChange(columnName, value, ['satellite']);
    } else {
      onColumnTypeChange(columnName, value, undefined);
    }
  };

  const handleAlsoInSatelliteChange = (columnName: string, checked: boolean) => {
    const col = columns.find(c => c.name === columnName);
    if (!col) return;
    
    if (checked) {
      onColumnTypeChange(columnName, col.columnType, ['satellite']);
    } else {
      onColumnTypeChange(columnName, col.columnType, undefined);
    }
  };

  // Get display value for dropdown (map new names to display)
  const getDropdownValue = (col: DesignerColumnDefinition): string => {
    // Map legacy names to new names for display
    switch (col.columnType) {
      case 'business_key': return 'hub';
      case 'attribute': return 'satellite';
      case 'foreign_key': return 'link';
      default: return col.columnType;
    }
  };

  return (
    <table className="column-grid">
      <thead>
        <tr>
          <th>Column</th>
          <th>Data Type</th>
          <th>Column Type</th>
          <th>Options</th>
        </tr>
      </thead>
      <tbody>
        {columns.map(col => (
          <tr key={col.name} className={col.columnType === 'ignore' ? 'ignored' : ''}>
            <td className="column-name">{col.name}</td>
            <td className="data-type">{col.dataType}</td>
            <td>
              <Dropdown
                value={getDropdownValue(col)}
                onChange={(value) => handleColumnTypeChange(col.name, value)}
                options={COLUMN_TYPE_OPTIONS}
              />
            </td>
            <td>
              {/* Satellite/Attribute options */}
              {(col.columnType === 'attribute' || col.columnType === 'satellite') && (
                <Checkbox
                  checked={col.includeInHashDiff}
                  onChange={(checked) => onHashDiffChange(col.name, checked)}
                >
                  Include in Hash Diff
                </Checkbox>
              )}
              
              {/* Link/Foreign Key options */}
              {(col.columnType === 'foreign_key' || col.columnType === 'link') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <Dropdown
                    value={col.foreignKeyTarget || ''}
                    onChange={(value) => handleFKTargetChange(col.name, value)}
                    options={hubOptions}
                  />
                  <Checkbox
                    checked={hasType(col, 'satellite')}
                    onChange={(checked) => handleAlsoInSatelliteChange(col.name, checked)}
                  >
                    Also include in Satellite
                  </Checkbox>
                </div>
              )}
              
              {/* Dependent Child options */}
              {col.columnType === 'dependent_child' && (
                <Tag>DCK</Tag>
              )}
              
              {/* Multi-Active options */}
              {col.columnType === 'multi_active' && (
                <Tag>CDK</Tag>
              )}
              
              {col.columnType === 'metadata' && (
                <Tag>auto</Tag>
              )}
              
              {(col.columnType === 'business_key' || col.columnType === 'hub') && (
                <Tag>Primary{col.foreignKeyTarget ? ' + FK' : ''}</Tag>
              )}
              
              {col.columnType === 'ignore' && (
                <span style={{ color: 'var(--vscode-disabledForeground)' }}>
                  Not included
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
