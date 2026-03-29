import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type {
  SatNodeData,
  SatelliteObject,
  MaSatelliteObject,
  DcSatelliteObject,
} from '../../types';
import {
  DV_TYPE_ABBREVIATIONS as ABBR,
  DV_TYPE_COLORS as COLORS,
} from '../../types';

const MAX_PAYLOAD_SHOWN = 6;

const DEFAULT_COLOR = '#50c878';

function getHeaderColor(type: string): string {
  return (COLORS as Record<string, string>)[type] ?? DEFAULT_COLOR;
}

function getBadge(type: string): string {
  return (ABBR as Record<string, string>)[type] ?? 'SAT';
}

function makeStyles(headerColor: string) {
  return {
    container: {
      background: 'var(--vscode-editor-background, #1e1e1e)',
      border: '1px solid var(--vscode-widget-border, #333)',
      borderRadius: 6,
      minWidth: 220,
      fontFamily: 'var(--vscode-font-family, sans-serif)',
    } as React.CSSProperties,
    containerSelected: {
      boxShadow: `0 0 0 2px ${headerColor}`,
    } as React.CSSProperties,
    header: {
      background: headerColor,
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 10px',
      borderRadius: '5px 5px 0 0',
    } as React.CSSProperties,
    badge: {
      background: 'rgba(0,0,0,0.25)',
      borderRadius: 3,
      fontSize: 10,
      fontWeight: 700,
      padding: '1px 5px',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px',
    } as React.CSSProperties,
    name: {
      fontWeight: 600,
      fontSize: 12,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap' as const,
    } as React.CSSProperties,
    parentLabel: {
      fontSize: 10,
      opacity: 0.85,
      marginLeft: 'auto',
    } as React.CSSProperties,
    body: {
      padding: '6px 10px',
      fontSize: 12,
      color: 'var(--vscode-foreground, #ccc)',
    } as React.CSSProperties,
    row: {
      borderBottom: '1px solid var(--vscode-widget-border, #333)',
      padding: '3px 0',
    } as React.CSSProperties,
    rowLast: {
      padding: '3px 0',
    } as React.CSSProperties,
    label: {
      color: 'var(--vscode-descriptionForeground, #888)',
      fontSize: 10,
      display: 'block',
    } as React.CSSProperties,
    value: {
      color: 'var(--vscode-foreground, #ccc)',
      fontFamily: 'monospace',
      fontSize: 12,
    } as React.CSSProperties,
    more: {
      color: 'var(--vscode-descriptionForeground, #888)',
      fontStyle: 'italic' as const,
      fontSize: 11,
      padding: '2px 0',
    } as React.CSSProperties,
  };
}

export const SatelliteNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as SatNodeData;
  const obj = nodeData.object;
  const headerColor = getHeaderColor(obj.type);
  const s = makeStyles(headerColor);

  const isDc = obj.type === 'dc_satellite';
  const isMa = obj.type === 'ma_satellite';

  const parentName = isDc
    ? (obj as DcSatelliteObject).parentLink
    : (obj as SatelliteObject | MaSatelliteObject).parentHub;

  const payload = obj.srcPayload ?? [];
  const extraCols = obj.srcExtraColumns ?? [];
  const cdkCols = isMa ? (obj as MaSatelliteObject).srcCdk : [];
  const hiddenCount = Math.max(0, payload.length - MAX_PAYLOAD_SHOWN);

  const hasMoreSections = cdkCols.length > 0 || extraCols.length > 0;

  return (
    <div style={{ ...s.container, ...(selected ? s.containerSelected : {}) }}>
      <Handle type="source" position={Position.Right} id="hub-source" />

      {/* Header */}
      <div style={s.header}>
        <span style={s.badge}>{getBadge(obj.type)}</span>
        <span style={s.name}>{nodeData.objectName}</span>
        {parentName && (
          <span style={s.parentLabel}>→ {parentName}</span>
        )}
      </div>

      {/* Body */}
      <div style={s.body}>
        {/* Hash Key (FK) */}
        <div style={s.row}>
          <span style={s.label}>Hash Key (FK)</span>
          <span style={s.value}>{obj.srcPk}</span>
        </div>

        {/* Hashdiff */}
        <div style={s.row}>
          <span style={s.label}>Hashdiff</span>
          <span style={s.value}>{obj.srcHashdiff.sourceColumn}</span>
        </div>

        {/* CDK columns (MA Satellite only) */}
        {isMa && cdkCols.length > 0 && (
          <div style={s.row}>
            <span style={s.label}>CDK Columns</span>
            {cdkCols.map((col) => (
              <span key={col} style={{ ...s.value, display: 'block' }}>{col}</span>
            ))}
          </div>
        )}

        {/* Payload columns */}
        <div style={hasMoreSections || hiddenCount > 0 ? s.row : s.rowLast}>
          <span style={s.label}>
            Payload ({payload.length} col{payload.length !== 1 ? 's' : ''})
          </span>
          {payload.slice(0, MAX_PAYLOAD_SHOWN).map((col) => (
            <span key={col} style={{ ...s.value, display: 'block' }}>{col}</span>
          ))}
          {hiddenCount > 0 && (
            <span style={s.more}>+{hiddenCount} more</span>
          )}
        </div>

        {/* Extra Columns */}
        {extraCols.length > 0 && (
          <div style={s.rowLast}>
            <span style={s.label}>Extra Columns</span>
            {extraCols.map((col) => (
              <span key={col} style={{ ...s.value, display: 'block' }}>{col}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

SatelliteNode.displayName = 'SatelliteNode';
