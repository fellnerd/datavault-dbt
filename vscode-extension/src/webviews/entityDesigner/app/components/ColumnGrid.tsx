import React from 'react';
import { Dropdown, Checkbox, Tag, DropdownOption } from 'vscrui';
import type { DesignerColumnDefinition, DesignerColumnType } from '../../../../types';

interface ColumnGridProps {
  columns: DesignerColumnDefinition[];
  existingHubs: string[];
  onColumnTypeChange: (columnName: string, newType: DesignerColumnType) => void;
  onHashDiffChange: (columnName: string, include: boolean) => void;
  onFKTargetChange: (columnName: string, targetHub: string) => void;
}

const COLUMN_TYPE_OPTIONS = [
  { label: 'Business Key', value: 'business_key' },
  { label: 'Attribute', value: 'attribute' },
  { label: 'Foreign Key', value: 'foreign_key' },
  { label: 'Metadata', value: 'metadata' },
  { label: 'Ignore', value: 'ignore' }
];

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
    onColumnTypeChange(columnName, value);
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
                value={col.columnType}
                onChange={(value) => handleColumnTypeChange(col.name, value)}
                options={COLUMN_TYPE_OPTIONS}
              />
            </td>
            <td>
              {col.columnType === 'attribute' && (
                <Checkbox
                  checked={col.includeInHashDiff}
                  onChange={(checked) => onHashDiffChange(col.name, checked)}
                >
                  Include in Hash Diff
                </Checkbox>
              )}
              {col.columnType === 'foreign_key' && (
                <Dropdown
                  value={col.foreignKeyTarget || ''}
                  onChange={(value) => handleFKTargetChange(col.name, value)}
                  options={hubOptions}
                />
              )}
              {col.columnType === 'metadata' && (
                <Tag>auto</Tag>
              )}
              {col.columnType === 'business_key' && (
                <Tag>Primary</Tag>
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
