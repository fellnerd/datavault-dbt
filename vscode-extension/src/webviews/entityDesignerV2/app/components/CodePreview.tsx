import { useState, useMemo } from 'react';
import type { GeneratedFile } from '../types';

interface CodePreviewProps {
  files: GeneratedFile[];
  activeTab: string;
  onTabChange: (path: string) => void;
}

const TAB_COLORS: Record<GeneratedFile['type'], string> = {
  staging: '#4a9eff',
  hub: '#4a9eff',
  satellite: '#50c878',
  link: '#ff8c42',
  current_view: '#1abc9c',
  reference: '#95a5a6',
  schema: '#ccc',
};

function fileName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1];
}

export function CodePreview({ files, activeTab, onTabChange }: CodePreviewProps) {
  const [showLineNumbers, setShowLineNumbers] = useState(true);

  const activeFile = files.find(f => f.path === activeTab) ?? files[0] ?? null;

  const lines = useMemo(() => {
    if (!activeFile) return [];
    return activeFile.content.split('\n');
  }, [activeFile]);

  const gutterWidth = lines.length > 0 ? `${String(lines.length).length + 1}ch` : '3ch';

  if (files.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>
          Click Validate or select an object to preview generated code
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Tab bar */}
      <div style={styles.tabBar}>
        <div style={styles.tabs}>
          {files.map(f => {
            const isActive = f.path === (activeFile?.path ?? '');
            const borderColor = TAB_COLORS[f.type] ?? '#888';
            return (
              <button
                key={f.path}
                style={{
                  ...styles.tab,
                  borderBottom: isActive ? `2px solid ${borderColor}` : '2px solid transparent',
                  color: isActive
                    ? 'var(--vscode-tab-activeForeground, #fff)'
                    : 'var(--vscode-tab-inactiveForeground, #888)',
                  background: isActive
                    ? 'var(--vscode-tab-activeBackground, #1e1e1e)'
                    : 'transparent',
                }}
                onClick={() => onTabChange(f.path)}
                title={f.path}
              >
                <span
                  style={{
                    ...styles.tabDot,
                    background: borderColor,
                  }}
                />
                {fileName(f.path)}
              </button>
            );
          })}
        </div>

        <label style={styles.lineToggle}>
          <input
            type="checkbox"
            checked={showLineNumbers}
            onChange={e => setShowLineNumbers(e.target.checked)}
            style={{ marginRight: 4 }}
          />
          #
        </label>
      </div>

      {/* Code area */}
      <div style={styles.codeArea}>
        <pre style={styles.pre}>
          {lines.map((line, i) => (
            <div key={i} style={styles.codeLine}>
              {showLineNumbers && (
                <span style={{ ...styles.lineNumber, minWidth: gutterWidth }}>
                  {i + 1}
                </span>
              )}
              <span style={styles.lineContent}>{line}</span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: 250,
    background: 'var(--vscode-editor-background, #1e1e1e)',
    borderTop: '1px solid var(--vscode-editorGroup-border, #444)',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    overflow: 'hidden',
    color: 'var(--vscode-editor-foreground, #d4d4d4)',
    fontSize: 13,
  },
  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--vscode-descriptionForeground, #888)',
    fontSize: 12,
  },
  tabBar: {
    display: 'flex',
    alignItems: 'center',
    background: 'var(--vscode-editorGroupHeader-tabsBackground, #2d2d2d)',
    borderBottom: '1px solid var(--vscode-editorGroup-border, #333)',
    flexShrink: 0,
  },
  tabs: {
    display: 'flex',
    flex: 1,
    overflowX: 'auto',
    gap: 0,
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '6px 14px',
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  tabDot: {
    display: 'inline-block',
    width: 6,
    height: 6,
    borderRadius: '50%',
    flexShrink: 0,
  },
  lineToggle: {
    display: 'flex',
    alignItems: 'center',
    padding: '0 10px',
    fontSize: 11,
    color: 'var(--vscode-descriptionForeground, #888)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  codeArea: {
    flex: 1,
    overflow: 'auto',
  },
  pre: {
    margin: 0,
    padding: '8px 0',
    fontFamily: 'var(--vscode-editor-font-family, "Cascadia Code", "Fira Code", Consolas, monospace)',
    fontSize: 'var(--vscode-editor-font-size, 13px)',
    lineHeight: 1.5,
  },
  codeLine: {
    display: 'flex',
    padding: '0 12px 0 0',
    minHeight: '1.5em',
  },
  lineNumber: {
    display: 'inline-block',
    textAlign: 'right',
    padding: '0 12px 0 12px',
    color: 'var(--vscode-editorLineNumber-foreground, #555)',
    userSelect: 'none',
    flexShrink: 0,
    fontSize: 'inherit',
    fontFamily: 'inherit',
  },
  lineContent: {
    whiteSpace: 'pre',
    flex: 1,
  },
};
