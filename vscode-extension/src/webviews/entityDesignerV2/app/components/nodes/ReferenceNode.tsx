import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { RefNodeData } from '../../types';

const HEADER_COLOR = '#95a5a6';
const MAX_COLUMNS_SHOWN = 6;

const styles = {
  container: {
    background: 'var(--vscode-editor-background, #1e1e1e)',
    border: '1px solid var(--vscode-widget-border, #333)',
    borderRadius: 6,
    minWidth: 220,
    fontFamily: 'var(--vscode-font-family, sans-serif)',
  } satisfies React.CSSProperties,
  containerSelected: {
    boxShadow: `0 0 0 2px ${HEADER_COLOR}`,
  } satisfies React.CSSProperties,
  header: {
    background: HEADER_COLOR,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    borderRadius: '5px 5px 0 0',
  } satisfies React.CSSProperties,
  badge: {
    background: 'rgba(0,0,0,0.25)',
    borderRadius: 3,
    fontSize: 10,
    fontWeight: 700,
    padding: '1px 5px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  } satisfies React.CSSProperties,
  name: {
    fontWeight: 600,
    fontSize: 12,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } satisfies React.CSSProperties,
  body: {
    padding: '6px 10px',
    fontSize: 12,
    color: 'var(--vscode-foreground, #ccc)',
  } satisfies React.CSSProperties,
  row: {
    borderBottom: '1px solid var(--vscode-widget-border, #333)',
    padding: '3px 0',
  } satisfies React.CSSProperties,
  rowLast: {
    padding: '3px 0',
  } satisfies React.CSSProperties,
  label: {
    color: 'var(--vscode-descriptionForeground, #888)',
    fontSize: 10,
    display: 'block',
  } satisfies React.CSSProperties,
  value: {
    color: 'var(--vscode-foreground, #ccc)',
    fontFamily: 'monospace',
    fontSize: 12,
  } satisfies React.CSSProperties,
  more: {
    color: 'var(--vscode-descriptionForeground, #888)',
    fontStyle: 'italic' as const,
    fontSize: 11,
    padding: '2px 0',
  } satisfies React.CSSProperties,
  filter: {
    color: 'var(--vscode-foreground, #ccc)',
    fontFamily: 'monospace',
    fontSize: 11,
    fontStyle: 'italic' as const,
    wordBreak: 'break-all' as const,
  } satisfies React.CSSProperties,
};

export const ReferenceNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as RefNodeData;
  const obj = nodeData.object;

  const columns = obj.columns ?? [];
  const hiddenCount = Math.max(0, columns.length - MAX_COLUMNS_SHOWN);
  const hasFilter = !!obj.filter;

  return (
    <div style={{ ...styles.container, ...(selected ? styles.containerSelected : {}) }}>
      {/* No handles — standalone node */}

      {/* Header */}
      <div style={styles.header}>
        <span style={styles.badge}>REF</span>
        <span style={styles.name}>{nodeData.objectName}</span>
      </div>

      {/* Body */}
      <div style={styles.body}>
        {/* Primary Key */}
        <div style={styles.row}>
          <span style={styles.label}>Primary Key</span>
          <span style={styles.value}>{obj.primaryKey}</span>
        </div>

        {/* Columns */}
        <div style={hasFilter ? styles.row : styles.rowLast}>
          <span style={styles.label}>
            Columns ({columns.length})
          </span>
          {columns.slice(0, MAX_COLUMNS_SHOWN).map((col) => (
            <span key={col} style={{ ...styles.value, display: 'block' }}>{col}</span>
          ))}
          {hiddenCount > 0 && (
            <span style={styles.more}>+{hiddenCount} more</span>
          )}
        </div>

        {/* Filter */}
        {hasFilter && (
          <div style={styles.rowLast}>
            <span style={styles.label}>Filter</span>
            <span style={styles.filter}>{obj.filter}</span>
          </div>
        )}
      </div>
    </div>
  );
});

ReferenceNode.displayName = 'ReferenceNode';
