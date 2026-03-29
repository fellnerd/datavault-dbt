import { useState } from 'react';
import type {
  DvObject,
  HubObject,
  SatelliteObject,
  LinkObject,
  MaSatelliteObject,
  DcSatelliteObject,
  ReferenceObject,
} from '../types';
import { DV_TYPE_LABELS, DV_TYPE_COLORS } from '../types';

interface PropertyEditorProps {
  selectedObject: { name: string; object: DvObject } | null;
  availableColumns: string[];
  availableHubs: string[];
  availableLinks: string[];
  onUpdateObject: (name: string, object: DvObject) => void;
  onRemoveObject: (name: string) => void;
}

// ─── Reusable form controls ──────────────────────────────────────

function TextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div style={styles.formGroup}>
      <label style={styles.label}>{label}</label>
      <input
        style={styles.input}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function Dropdown({
  label,
  value,
  options,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div style={styles.formGroup}>
      <label style={styles.label}>{label}</label>
      <select style={styles.select} value={value} onChange={e => onChange(e.target.value)}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div style={styles.toggleRow}>
      <label style={styles.toggleLabel}>
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          style={{ marginRight: 6 }}
        />
        {label}
      </label>
    </div>
  );
}

function ColumnPicker({
  label,
  selected,
  available,
  onChange,
}: {
  label: string;
  selected: string[];
  available: string[];
  onChange: (v: string[]) => void;
}) {
  const allOptions = [...new Set([...selected, ...available])].sort();

  const toggle = (col: string) => {
    onChange(
      selected.includes(col)
        ? selected.filter(c => c !== col)
        : [...selected, col]
    );
  };

  return (
    <div style={styles.formGroup}>
      <label style={styles.label}>{label} ({selected.length})</label>
      <div style={styles.columnList}>
        {allOptions.length === 0 && (
          <div style={styles.emptyPicker}>No columns available</div>
        )}
        {allOptions.map(col => (
          <label key={col} style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={selected.includes(col)}
              onChange={() => toggle(col)}
              style={{ marginRight: 6, flexShrink: 0 }}
            />
            <span style={styles.checkboxLabel}>{col}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── Type-specific forms ─────────────────────────────────────────

function HubForm({
  name,
  obj,
  availableColumns,
  onUpdate,
}: {
  name: string;
  obj: HubObject;
  availableColumns: string[];
  onUpdate: (name: string, obj: DvObject) => void;
}) {
  const nkArray = Array.isArray(obj.srcNk) ? obj.srcNk : [obj.srcNk];

  return (
    <>
      <TextInput
        label="Name"
        value={obj.name}
        onChange={v => onUpdate(name, { ...obj, name: v })}
      />
      <ColumnPicker
        label="Business Keys"
        selected={nkArray}
        available={availableColumns}
        onChange={v => onUpdate(name, { ...obj, srcNk: v.length === 1 ? v[0] : v })}
      />
      <Toggle
        label="Extra Columns"
        checked={(obj.srcExtraColumns ?? []).length > 0}
        onChange={v =>
          onUpdate(name, { ...obj, srcExtraColumns: v ? obj.srcExtraColumns ?? [] : undefined })
        }
      />
      {obj.srcExtraColumns !== undefined && (
        <ColumnPicker
          label="Extra Columns"
          selected={obj.srcExtraColumns ?? []}
          available={availableColumns}
          onChange={v => onUpdate(name, { ...obj, srcExtraColumns: v })}
        />
      )}
    </>
  );
}

function SatelliteForm({
  name,
  obj,
  availableColumns,
  availableHubs,
  onUpdate,
}: {
  name: string;
  obj: SatelliteObject;
  availableColumns: string[];
  availableHubs: string[];
  onUpdate: (name: string, obj: DvObject) => void;
}) {
  return (
    <>
      <TextInput
        label="Name"
        value={obj.name}
        onChange={v => onUpdate(name, { ...obj, name: v })}
      />
      <Dropdown
        label="Parent Hub"
        value={obj.parentHub}
        options={availableHubs}
        onChange={v => onUpdate(name, { ...obj, parentHub: v })}
        placeholder="— select hub —"
      />
      <ColumnPicker
        label="Payload Columns"
        selected={obj.srcPayload}
        available={availableColumns}
        onChange={v => onUpdate(name, { ...obj, srcPayload: v })}
      />
      <TextInput
        label="Hashdiff Column"
        value={obj.srcHashdiff.sourceColumn}
        onChange={v =>
          onUpdate(name, {
            ...obj,
            srcHashdiff: { ...obj.srcHashdiff, sourceColumn: v },
          })
        }
      />
      <Toggle
        label="Extra Columns"
        checked={(obj.srcExtraColumns ?? []).length > 0}
        onChange={v =>
          onUpdate(name, { ...obj, srcExtraColumns: v ? obj.srcExtraColumns ?? [] : undefined })
        }
      />
      {obj.srcExtraColumns !== undefined && (
        <ColumnPicker
          label="Extra Columns"
          selected={obj.srcExtraColumns ?? []}
          available={availableColumns}
          onChange={v => onUpdate(name, { ...obj, srcExtraColumns: v })}
        />
      )}
      <Toggle
        label="Generate Current View"
        checked={obj.generateCurrentView ?? false}
        onChange={v => onUpdate(name, { ...obj, generateCurrentView: v })}
      />
    </>
  );
}

function LinkForm({
  name,
  obj,
  availableColumns,
  onUpdate,
}: {
  name: string;
  obj: LinkObject;
  availableColumns: string[];
  onUpdate: (name: string, obj: DvObject) => void;
}) {
  return (
    <>
      <TextInput
        label="Name"
        value={obj.name}
        onChange={v => onUpdate(name, { ...obj, name: v })}
      />
      <ColumnPicker
        label="Foreign Keys"
        selected={obj.srcFk}
        available={availableColumns}
        onChange={v => onUpdate(name, { ...obj, srcFk: v })}
      />
      <Toggle
        label="Extra Columns"
        checked={(obj.srcExtraColumns ?? []).length > 0}
        onChange={v =>
          onUpdate(name, { ...obj, srcExtraColumns: v ? obj.srcExtraColumns ?? [] : undefined })
        }
      />
      {obj.srcExtraColumns !== undefined && (
        <ColumnPicker
          label="Extra Columns"
          selected={obj.srcExtraColumns ?? []}
          available={availableColumns}
          onChange={v => onUpdate(name, { ...obj, srcExtraColumns: v })}
        />
      )}
    </>
  );
}

function MaSatelliteForm({
  name,
  obj,
  availableColumns,
  availableHubs,
  onUpdate,
}: {
  name: string;
  obj: MaSatelliteObject;
  availableColumns: string[];
  availableHubs: string[];
  onUpdate: (name: string, obj: DvObject) => void;
}) {
  return (
    <>
      <TextInput
        label="Name"
        value={obj.name}
        onChange={v => onUpdate(name, { ...obj, name: v })}
      />
      <Dropdown
        label="Parent Hub"
        value={obj.parentHub}
        options={availableHubs}
        onChange={v => onUpdate(name, { ...obj, parentHub: v })}
        placeholder="— select hub —"
      />
      <ColumnPicker
        label="CDK Columns"
        selected={obj.srcCdk}
        available={availableColumns}
        onChange={v => onUpdate(name, { ...obj, srcCdk: v })}
      />
      <ColumnPicker
        label="Payload Columns"
        selected={obj.srcPayload}
        available={availableColumns}
        onChange={v => onUpdate(name, { ...obj, srcPayload: v })}
      />
      <TextInput
        label="Hashdiff Column"
        value={obj.srcHashdiff.sourceColumn}
        onChange={v =>
          onUpdate(name, {
            ...obj,
            srcHashdiff: { ...obj.srcHashdiff, sourceColumn: v },
          })
        }
      />
      <Toggle
        label="Extra Columns"
        checked={(obj.srcExtraColumns ?? []).length > 0}
        onChange={v =>
          onUpdate(name, { ...obj, srcExtraColumns: v ? obj.srcExtraColumns ?? [] : undefined })
        }
      />
      {obj.srcExtraColumns !== undefined && (
        <ColumnPicker
          label="Extra Columns"
          selected={obj.srcExtraColumns ?? []}
          available={availableColumns}
          onChange={v => onUpdate(name, { ...obj, srcExtraColumns: v })}
        />
      )}
    </>
  );
}

function DcSatelliteForm({
  name,
  obj,
  availableColumns,
  availableLinks,
  onUpdate,
}: {
  name: string;
  obj: DcSatelliteObject;
  availableColumns: string[];
  availableLinks: string[];
  onUpdate: (name: string, obj: DvObject) => void;
}) {
  return (
    <>
      <TextInput
        label="Name"
        value={obj.name}
        onChange={v => onUpdate(name, { ...obj, name: v })}
      />
      <Dropdown
        label="Parent Link"
        value={obj.parentLink}
        options={availableLinks}
        onChange={v => onUpdate(name, { ...obj, parentLink: v })}
        placeholder="— select link —"
      />
      <ColumnPicker
        label="Payload Columns"
        selected={obj.srcPayload}
        available={availableColumns}
        onChange={v => onUpdate(name, { ...obj, srcPayload: v })}
      />
      <TextInput
        label="Hashdiff Column"
        value={obj.srcHashdiff.sourceColumn}
        onChange={v =>
          onUpdate(name, {
            ...obj,
            srcHashdiff: { ...obj.srcHashdiff, sourceColumn: v },
          })
        }
      />
      <Toggle
        label="Extra Columns"
        checked={(obj.srcExtraColumns ?? []).length > 0}
        onChange={v =>
          onUpdate(name, { ...obj, srcExtraColumns: v ? obj.srcExtraColumns ?? [] : undefined })
        }
      />
      {obj.srcExtraColumns !== undefined && (
        <ColumnPicker
          label="Extra Columns"
          selected={obj.srcExtraColumns ?? []}
          available={availableColumns}
          onChange={v => onUpdate(name, { ...obj, srcExtraColumns: v })}
        />
      )}
    </>
  );
}

function ReferenceForm({
  name,
  obj,
  availableColumns,
  onUpdate,
}: {
  name: string;
  obj: ReferenceObject;
  availableColumns: string[];
  onUpdate: (name: string, obj: DvObject) => void;
}) {
  const allCols = [...new Set([...obj.columns, ...availableColumns])].sort();

  return (
    <>
      <TextInput
        label="Name"
        value={obj.name}
        onChange={v => onUpdate(name, { ...obj, name: v })}
      />
      <Dropdown
        label="Primary Key"
        value={obj.primaryKey}
        options={allCols}
        onChange={v => onUpdate(name, { ...obj, primaryKey: v })}
        placeholder="— select column —"
      />
      <ColumnPicker
        label="Columns"
        selected={obj.columns}
        available={availableColumns}
        onChange={v => onUpdate(name, { ...obj, columns: v })}
      />
      <TextInput
        label="Filter Expression"
        value={obj.filter ?? ''}
        onChange={v => onUpdate(name, { ...obj, filter: v || undefined })}
        placeholder="e.g. STATUS = 'ACTIVE'"
      />
    </>
  );
}

// ─── Main component ──────────────────────────────────────────────

export function PropertyEditor({
  selectedObject,
  availableColumns,
  availableHubs,
  availableLinks,
  onUpdateObject,
  onRemoveObject,
}: PropertyEditorProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!selectedObject) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>
          Select an object on the canvas to edit its properties
        </div>
      </div>
    );
  }

  const { name, object: obj } = selectedObject;
  const typeColor = DV_TYPE_COLORS[obj.type] ?? '#888';

  const handleDelete = () => {
    if (confirmDelete) {
      onRemoveObject(name);
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
    }
  };

  const renderForm = () => {
    switch (obj.type) {
      case 'hub':
        return <HubForm name={name} obj={obj} availableColumns={availableColumns} onUpdate={onUpdateObject} />;
      case 'satellite':
        return <SatelliteForm name={name} obj={obj} availableColumns={availableColumns} availableHubs={availableHubs} onUpdate={onUpdateObject} />;
      case 'link':
        return <LinkForm name={name} obj={obj} availableColumns={availableColumns} onUpdate={onUpdateObject} />;
      case 'ma_satellite':
        return <MaSatelliteForm name={name} obj={obj} availableColumns={availableColumns} availableHubs={availableHubs} onUpdate={onUpdateObject} />;
      case 'dc_satellite':
        return <DcSatelliteForm name={name} obj={obj} availableColumns={availableColumns} availableLinks={availableLinks} onUpdate={onUpdateObject} />;
      case 'reference':
        return <ReferenceForm name={name} obj={obj} availableColumns={availableColumns} onUpdate={onUpdateObject} />;
      default:
        return <div style={styles.emptyState}>Unsupported object type</div>;
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={{ ...styles.typeBadge, background: typeColor }}>
          {DV_TYPE_LABELS[obj.type]}
        </span>
        <span style={styles.objectName}>{name}</span>
      </div>

      {/* Form body */}
      <div style={styles.body}>
        {renderForm()}
      </div>

      {/* Delete */}
      <div style={styles.footer}>
        <button
          style={{
            ...styles.deleteButton,
            background: confirmDelete ? '#a1260d' : 'transparent',
            color: confirmDelete ? '#fff' : '#f44747',
          }}
          onClick={handleDelete}
          onBlur={() => setConfirmDelete(false)}
        >
          {confirmDelete ? 'Confirm Delete' : 'Delete Object'}
        </button>
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 300,
    background: 'var(--vscode-sideBar-background, #252526)',
    borderLeft: '1px solid var(--vscode-sideBar-border, #444)',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    overflow: 'hidden',
    color: 'var(--vscode-sideBar-foreground, #ccc)',
    fontSize: 12,
  },
  emptyState: {
    padding: 24,
    textAlign: 'center',
    color: 'var(--vscode-descriptionForeground, #888)',
    fontSize: 12,
    lineHeight: 1.6,
  },
  header: {
    padding: '10px 12px',
    borderBottom: '1px solid var(--vscode-sideBarSectionHeader-border, #444)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  typeBadge: {
    padding: '2px 6px',
    borderRadius: 3,
    color: '#fff',
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    whiteSpace: 'nowrap' as const,
  },
  objectName: {
    fontWeight: 600,
    fontSize: 13,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 12px',
  },
  footer: {
    padding: '8px 12px',
    borderTop: '1px solid var(--vscode-sideBarSectionHeader-border, #444)',
  },
  deleteButton: {
    width: '100%',
    padding: '6px 0',
    border: '1px solid #f44747',
    borderRadius: 3,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
  },
  formGroup: {
    marginBottom: 12,
  },
  label: {
    display: 'block',
    marginBottom: 4,
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--vscode-foreground, #ccc)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px',
  },
  input: {
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
  select: {
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
  toggleRow: {
    marginBottom: 10,
  },
  toggleLabel: {
    display: 'flex',
    alignItems: 'center',
    fontSize: 12,
    cursor: 'pointer',
    color: 'var(--vscode-foreground, #ccc)',
  },
  columnList: {
    maxHeight: 150,
    overflowY: 'auto',
    border: '1px solid var(--vscode-input-border, #555)',
    borderRadius: 3,
    background: 'var(--vscode-input-background, #3c3c3c)',
    padding: '4px 0',
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '2px 8px',
    cursor: 'pointer',
    fontSize: 12,
  },
  checkboxLabel: {
    fontFamily: 'var(--vscode-editor-font-family, monospace)',
    fontSize: 11,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  emptyPicker: {
    padding: '8px 12px',
    color: 'var(--vscode-descriptionForeground, #888)',
    fontSize: 11,
    textAlign: 'center',
  },
};
