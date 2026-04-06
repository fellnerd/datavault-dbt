import { useState } from 'react';
import type { ColumnDefinition } from '../types';
import { DV_TYPE_COLORS } from '../types';

interface SourceBrowserProps {
  sourceTable: string;
  columns: Record<string, ColumnDefinition>;
  reservedKeywords: string[];
  onColumnSelect: (columnName: string) => void;
  assignedColumns: Record<string, string>; // column → objectName mapping
}

/** Color dot for assigned columns based on the object type prefix. */
function objectDotColor(objectName: string): string {
  const lower = objectName.toLowerCase();
  if (lower.startsWith('hub_'))  return DV_TYPE_COLORS.hub;
  if (lower.startsWith('sat_'))  return DV_TYPE_COLORS.satellite;
  if (lower.startsWith('link_')) return DV_TYPE_COLORS.link;
  if (lower.startsWith('ma_'))   return DV_TYPE_COLORS.ma_satellite;
  if (lower.startsWith('dc_'))   return DV_TYPE_COLORS.dc_satellite;
  if (lower.startsWith('ref_'))  return DV_TYPE_COLORS.reference;
  return '#888';
}

export function SourceBrowser({
  sourceTable,
  columns,
  reservedKeywords,
  onColumnSelect,
  assignedColumns,
}: SourceBrowserProps) {
  const [filter, setFilter] = useState('');
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);

  const reservedSet = new Set(reservedKeywords.map(k => k.toUpperCase()));

  const sortedColumns = Object.entries(columns).sort(([a], [b]) => {
    // Unassigned first, then alphabetical
    const aAssigned = a in assignedColumns;
    const bAssigned = b in assignedColumns;
    if (aAssigned !== bAssigned) return aAssigned ? 1 : -1;
    return a.localeCompare(b);
  });

  const filtered = filter
    ? sortedColumns.filter(([name, col]) =>
        name.toLowerCase().includes(filter.toLowerCase()) ||
        col.dataType.toLowerCase().includes(filter.toLowerCase())
      )
    : sortedColumns;

  const handleClick = (columnName: string) => {
    setSelectedColumn(columnName);
    onColumnSelect(columnName);
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerTitle}>Source Columns</span>
        <span style={styles.headerSubtitle} title={sourceTable}>{sourceTable}</span>
      </div>

      {/* Search */}
      <div style={styles.searchBox}>
        <input
          type="text"
          placeholder="Filter columns…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={styles.searchInput}
        />
      </div>

      {/* Column count */}
      <div style={styles.countBar}>
        {filtered.length} / {sortedColumns.length} columns
      </div>

      {/* Column list */}
      <div style={styles.list}>
        {filtered.map(([name, col]) => {
          const isAssigned = name in assignedColumns;
          const isReserved = reservedSet.has(name.toUpperCase());
          const isActive = selectedColumn === name;

          return (
            <div
              key={name}
              style={{
                ...styles.row,
                opacity: isAssigned ? 0.55 : 1,
                background: isActive
                  ? 'var(--vscode-list-activeSelectionBackground, #094771)'
                  : 'transparent',
                color: isActive
                  ? 'var(--vscode-list-activeSelectionForeground, #fff)'
                  : 'var(--vscode-foreground, #ccc)',
              }}
              onClick={() => handleClick(name)}
              title={`${name} (${col.dataType})${isAssigned ? ` → ${assignedColumns[name]}` : ''}${isReserved ? ' [RESERVED]' : ''}`}
            >
              {/* Assigned dot */}
              <span style={styles.dotSlot}>
                {isAssigned && (
                  <span
                    style={{
                      ...styles.dot,
                      background: objectDotColor(assignedColumns[name]),
                    }}
                  />
                )}
              </span>

              {/* Column info */}
              <div style={styles.colInfo}>
                <span style={styles.colName}>
                  {isReserved ? `[${name}]` : name}
                </span>
                <span style={styles.colType}>{col.dataType}</span>
              </div>

              {/* Badges */}
              <div style={styles.badges}>
                {isReserved && <span style={styles.reservedBadge}>⚠</span>}
                {isAssigned && (
                  <span style={styles.assignedBadge}>{assignedColumns[name]}</span>
                )}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div style={styles.empty}>
            {filter ? 'No columns match filter' : 'No source columns available'}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 240,
    background: 'var(--vscode-sideBar-background, #252526)',
    borderRight: '1px solid var(--vscode-sideBar-border, #444)',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    overflow: 'hidden',
    color: 'var(--vscode-sideBar-foreground, #ccc)',
    fontSize: 12,
  },
  header: {
    padding: '10px 12px 6px',
    borderBottom: '1px solid var(--vscode-sideBarSectionHeader-border, #444)',
  },
  headerTitle: {
    display: 'block',
    fontWeight: 600,
    fontSize: 11,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: 'var(--vscode-sideBarSectionHeader-foreground, #bbb)',
  },
  headerSubtitle: {
    display: 'block',
    fontSize: 11,
    marginTop: 2,
    color: 'var(--vscode-descriptionForeground, #888)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  searchBox: {
    padding: '6px 8px',
  },
  searchInput: {
    width: '100%',
    padding: '4px 8px',
    border: '1px solid var(--vscode-input-border, #555)',
    borderRadius: 3,
    background: 'var(--vscode-input-background, #3c3c3c)',
    color: 'var(--vscode-input-foreground, #ccc)',
    fontSize: 12,
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  countBar: {
    padding: '2px 12px 4px',
    fontSize: 10,
    color: 'var(--vscode-descriptionForeground, #888)',
    borderBottom: '1px solid var(--vscode-sideBarSectionHeader-border, #333)',
  },
  list: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '4px 0',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 8px',
    cursor: 'pointer',
    gap: 6,
    minHeight: 26,
  },
  dotSlot: {
    width: 8,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    display: 'inline-block',
    width: 6,
    height: 6,
    borderRadius: '50%',
  },
  colInfo: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 1,
  },
  colName: {
    fontFamily: 'var(--vscode-editor-font-family, monospace)',
    fontSize: 12,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  colType: {
    fontSize: 10,
    color: 'var(--vscode-descriptionForeground, #888)',
    whiteSpace: 'nowrap' as const,
  },
  badges: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  reservedBadge: {
    fontSize: 10,
    color: '#cca700',
  },
  assignedBadge: {
    fontSize: 9,
    padding: '0 4px',
    borderRadius: 2,
    background: 'var(--vscode-badge-background, #4d4d4d)',
    color: 'var(--vscode-badge-foreground, #fff)',
    whiteSpace: 'nowrap' as const,
    maxWidth: 60,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  empty: {
    padding: '20px 12px',
    textAlign: 'center' as const,
    color: 'var(--vscode-descriptionForeground, #888)',
    fontSize: 11,
  },
};
