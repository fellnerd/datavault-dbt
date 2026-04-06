import { useState } from 'react';
import type { DvObjectType } from '../types';
import { DV_TYPE_LABELS } from '../types';

interface ToolbarProps {
  entityName: string;
  concept: string;
  sourceTable: string;
  objectCount: number;
  isDirty: boolean;
  validationErrors: number;
  validationWarnings: number;
  onAddObject: (type: DvObjectType) => void;
  onSave: () => void;
  onGenerate: () => void;
  onValidate: () => void;
  onAutoLayout: () => void;
}

const ADDABLE_TYPES: DvObjectType[] = [
  'hub', 'satellite', 'link', 'ma_satellite', 'dc_satellite', 'reference',
];

export function Toolbar({
  entityName,
  concept,
  sourceTable,
  objectCount,
  isDirty,
  validationErrors,
  validationWarnings,
  onAddObject,
  onSave,
  onGenerate,
  onValidate,
  onAutoLayout,
}: ToolbarProps) {
  const [showAddMenu, setShowAddMenu] = useState(false);

  const validationBadge = () => {
    if (validationErrors > 0) {
      return <span style={styles.badgeError}>⚠ {validationErrors} error{validationErrors !== 1 ? 's' : ''}</span>;
    }
    if (validationWarnings > 0) {
      return <span style={styles.badgeWarning}>⚡ {validationWarnings} warning{validationWarnings !== 1 ? 's' : ''}</span>;
    }
    return <span style={styles.badgeSuccess}>✓ Valid</span>;
  };

  return (
    <div style={styles.toolbar}>
      {/* Left: Entity info */}
      <div style={styles.left}>
        <span style={styles.entityName}>
          {entityName}
          {isDirty && <span style={styles.dirtyDot}> ●</span>}
        </span>
        <span style={styles.conceptBadge}>{concept}</span>
        <span style={styles.sourceLabel} title={sourceTable}>
          {sourceTable}
        </span>
      </div>

      {/* Center: Add + status */}
      <div style={styles.center}>
        <div style={styles.addWrapper}>
          <button
            style={styles.addButton}
            onClick={() => setShowAddMenu(prev => !prev)}
            title="Add DV object"
          >
            + Add Object
          </button>
          {showAddMenu && (
            <div style={styles.addMenu}>
              {ADDABLE_TYPES.map(t => (
                <button
                  key={t}
                  style={styles.addMenuItem}
                  onClick={() => {
                    onAddObject(t);
                    setShowAddMenu(false);
                  }}
                >
                  {DV_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          )}
        </div>

        <span style={styles.objectCount}>{objectCount} object{objectCount !== 1 ? 's' : ''}</span>
        {validationBadge()}
      </div>

      {/* Right: Actions */}
      <div style={styles.right}>
        <button style={styles.button} onClick={onAutoLayout} title="Auto-layout nodes">
          ⊞ Layout
        </button>
        <button style={styles.button} onClick={onValidate} title="Validate configuration">
          ✓ Validate
        </button>
        <button style={styles.button} onClick={onSave} title="Save configuration">
          💾 Save
        </button>
        <button
          style={{
            ...styles.button,
            ...styles.primaryButton,
            ...(validationErrors > 0 ? styles.disabledButton : {}),
          }}
          onClick={onGenerate}
          disabled={validationErrors > 0}
          title={validationErrors > 0 ? 'Fix validation errors before generating' : 'Generate dbt models'}
        >
          ▶ Generate
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 40,
    padding: '0 12px',
    background: 'var(--vscode-titleBar-activeBackground, #2d2d2d)',
    borderBottom: '1px solid var(--vscode-titleBar-border, #444)',
    color: 'var(--vscode-titleBar-activeForeground, #ccc)',
    fontSize: 13,
    gap: 8,
    flexShrink: 0,
    position: 'relative',
    zIndex: 100,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    flex: '0 1 auto',
  },
  entityName: {
    fontWeight: 600,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  dirtyDot: {
    color: 'var(--vscode-editorWarning-foreground, #cca700)',
  },
  conceptBadge: {
    padding: '1px 6px',
    borderRadius: 3,
    background: 'var(--vscode-badge-background, #4d4d4d)',
    color: 'var(--vscode-badge-foreground, #fff)',
    fontSize: 11,
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    whiteSpace: 'nowrap',
  },
  sourceLabel: {
    fontSize: 11,
    color: 'var(--vscode-descriptionForeground, #888)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 180,
  },
  center: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flex: '1 1 auto',
    justifyContent: 'center',
  },
  addWrapper: {
    position: 'relative' as const,
  },
  addButton: {
    padding: '3px 10px',
    borderRadius: 3,
    border: '1px solid var(--vscode-button-border, #555)',
    background: 'var(--vscode-button-secondaryBackground, #3a3d41)',
    color: 'var(--vscode-button-secondaryForeground, #ccc)',
    cursor: 'pointer',
    fontSize: 12,
    whiteSpace: 'nowrap' as const,
  },
  addMenu: {
    position: 'absolute' as const,
    top: '100%',
    left: 0,
    marginTop: 2,
    background: 'var(--vscode-menu-background, #2d2d2d)',
    border: '1px solid var(--vscode-menu-border, #555)',
    borderRadius: 4,
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    zIndex: 200,
    minWidth: 180,
    padding: '4px 0',
  },
  addMenuItem: {
    display: 'block',
    width: '100%',
    padding: '6px 14px',
    border: 'none',
    background: 'transparent',
    color: 'var(--vscode-menu-foreground, #ccc)',
    textAlign: 'left' as const,
    cursor: 'pointer',
    fontSize: 12,
  },
  objectCount: {
    fontSize: 11,
    color: 'var(--vscode-descriptionForeground, #888)',
    whiteSpace: 'nowrap' as const,
  },
  badgeSuccess: {
    padding: '1px 6px',
    borderRadius: 3,
    background: '#2e4d2e',
    color: '#50c878',
    fontSize: 11,
    whiteSpace: 'nowrap' as const,
  },
  badgeWarning: {
    padding: '1px 6px',
    borderRadius: 3,
    background: '#4d3e1e',
    color: '#cca700',
    fontSize: 11,
    whiteSpace: 'nowrap' as const,
  },
  badgeError: {
    padding: '1px 6px',
    borderRadius: 3,
    background: '#4d1e1e',
    color: '#f44747',
    fontSize: 11,
    whiteSpace: 'nowrap' as const,
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flex: '0 0 auto',
  },
  button: {
    padding: '3px 10px',
    borderRadius: 3,
    border: '1px solid var(--vscode-button-border, #555)',
    background: 'var(--vscode-button-secondaryBackground, #3a3d41)',
    color: 'var(--vscode-button-secondaryForeground, #ccc)',
    cursor: 'pointer',
    fontSize: 12,
    whiteSpace: 'nowrap' as const,
  },
  primaryButton: {
    background: 'var(--vscode-button-background, #0e639c)',
    color: 'var(--vscode-button-foreground, #fff)',
    border: '1px solid var(--vscode-button-background, #0e639c)',
  },
  disabledButton: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
};
