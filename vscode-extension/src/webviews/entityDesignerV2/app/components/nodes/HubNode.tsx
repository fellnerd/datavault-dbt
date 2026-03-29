import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { HubNodeData } from '../../types';

const HEADER_COLOR = '#4a9eff';

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
};

export const HubNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as HubNodeData;
  const obj = nodeData.object;

  const businessKeys = Array.isArray(obj.srcNk) ? obj.srcNk : [obj.srcNk];
  const extraCols = obj.srcExtraColumns ?? [];

  return (
    <div style={{ ...styles.container, ...(selected ? styles.containerSelected : {}) }}>
      <Handle type="target" position={Position.Left} id="sat-target" />
      <Handle type="source" position={Position.Right} id="link-source" />

      {/* Header */}
      <div style={styles.header}>
        <span style={styles.badge}>HUB</span>
        <span style={styles.name}>{nodeData.objectName}</span>
      </div>

      {/* Body */}
      <div style={styles.body}>
        {/* Hash Key */}
        <div style={styles.row}>
          <span style={styles.label}>Hash Key (PK)</span>
          <span style={styles.value}>{obj.srcPk}</span>
        </div>

        {/* Business Keys */}
        <div style={extraCols.length > 0 ? styles.row : styles.rowLast}>
          <span style={styles.label}>
            Business Key{businessKeys.length > 1 ? 's' : ''}
          </span>
          {businessKeys.map((bk) => (
            <span key={bk} style={{ ...styles.value, display: 'block' }}>{bk}</span>
          ))}
        </div>

        {/* Extra Columns */}
        {extraCols.length > 0 && (
          <div style={styles.rowLast}>
            <span style={styles.label}>Extra Columns</span>
            {extraCols.map((col) => (
              <span key={col} style={{ ...styles.value, display: 'block' }}>{col}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

HubNode.displayName = 'HubNode';
