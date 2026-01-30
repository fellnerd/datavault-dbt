import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useVSCodeApi } from './hooks/useVSCodeApi';
import type { ColumnInfo, DesignerColumnDefinition, LambdaVaultConfig, LambdaColumnMapping, StagingModelInfo } from '../../../types';

/**
 * Data Vault Target - Where the column will be used
 * Based on Data Vault 2.0 Standard:
 * - hub: Business Key column → goes into Hub (used for Hash Key calculation)
 * - satellite: Descriptive attribute → goes into Satellite (used for Hash Diff)
 * - link: Foreign Key reference → creates a Link to another Hub
 * - dependent_child: Dependent Child Key → goes into DC Sat (for multi-row Link relationships)
 * - multi_active: Multi-Active attribute → goes into MA Sat (multiple valid values per entity)
 * - metadata: System columns (dss_*) → auto-generated, not user-selectable
 * - ignore: Column will not be used in any Data Vault object
 */
type DataVaultTarget = 'hub' | 'satellite' | 'link' | 'dependent_child' | 'multi_active' | 'metadata' | 'ignore';

// Base SQL Server data types (without size) for dropdown
const SQL_BASE_TYPES = [
  { type: 'BIGINT', hasSize: false },
  { type: 'INT', hasSize: false },
  { type: 'SMALLINT', hasSize: false },
  { type: 'TINYINT', hasSize: false },
  { type: 'BIT', hasSize: false },
  { type: 'DECIMAL', hasSize: true, defaultSize: '18,2' },
  { type: 'NUMERIC', hasSize: true, defaultSize: '18,2' },
  { type: 'FLOAT', hasSize: false },
  { type: 'REAL', hasSize: false },
  { type: 'MONEY', hasSize: false },
  { type: 'CHAR', hasSize: true, defaultSize: '64' },
  { type: 'VARCHAR', hasSize: true, defaultSize: 'MAX' },
  { type: 'NVARCHAR', hasSize: true, defaultSize: 'MAX' },
  { type: 'DATE', hasSize: false },
  { type: 'TIME', hasSize: false },
  { type: 'DATETIME', hasSize: false },
  { type: 'DATETIME2', hasSize: false },
  { type: 'DATETIMEOFFSET', hasSize: false },
  { type: 'UNIQUEIDENTIFIER', hasSize: false },
];

// Helper to parse data type into base and size
function parseDataType(dataType: string): { base: string; size: string | null } {
  const match = dataType.match(/^(\w+)(?:\((.+)\))?$/);
  if (match) {
    return { base: match[1].toUpperCase(), size: match[2] || null };
  }
  return { base: dataType.toUpperCase(), size: null };
}

// Helper to format data type from base and size
function formatDataType(base: string, size: string | null): string {
  const typeInfo = SQL_BASE_TYPES.find(t => t.type === base);
  if (typeInfo?.hasSize && size) {
    return `${base}(${size})`;
  }
  return base;
}

interface ColumnConfig extends DesignerColumnDefinition {
  /** Original column name from source */
  sourceName: string;
  /** Alias for staging (if different from source) */
  alias: string;
  /** Whether column can be null */
  nullable: boolean;
  /** Position in list */
  position: number;
  /** For dependent_child: which link this DCK belongs to */
  dependentChildForLink?: string;
  /** For multi_active: is this a sequence column */
  multiActiveSequence?: boolean;
}

interface InitData {
  columns: ColumnInfo[];
  existingHubs: string[];
  concept: string;
  entityName: string;
  sourceTable: string;
  /** Available staging models for Lambda Vault delta selection */
  availableStagingModels?: StagingModelInfo[];
  /** Saved Lambda Vault configuration */
  lambdaVault?: LambdaVaultConfig;
  /** Column names from base staging SQL (for Lambda Vault comparison) */
  baseStagingColumns?: string[];
}

interface ValidationError {
  type: 'error' | 'warning';
  message: string;
  column?: string;
  /** Which object type this error applies to */
  affectsObject?: 'hub' | 'satellite' | 'link' | 'all';
}

// ============================================================================
// STYLES - Enterprise Master-Detail Layout
// ============================================================================
const colors = {
  bg: 'var(--vscode-editor-background)',
  bgSecondary: 'var(--vscode-editorWidget-background)',
  border: 'var(--vscode-widget-border)',
  text: 'var(--vscode-foreground)',
  textMuted: 'var(--vscode-descriptionForeground)',
  accent: 'var(--vscode-focusBorder)',
  selection: 'var(--vscode-list-activeSelectionBackground)',
  selectionText: 'var(--vscode-list-activeSelectionForeground)',
  hover: 'var(--vscode-list-hoverBackground)',
  input: 'var(--vscode-input-background)',
  inputBorder: 'var(--vscode-input-border)',
  button: 'var(--vscode-button-background)',
  buttonText: 'var(--vscode-button-foreground)',
  buttonSecondary: 'var(--vscode-button-secondaryBackground)',
  buttonSecondaryText: 'var(--vscode-button-secondaryForeground)',
  error: 'var(--vscode-errorForeground)',
  warning: 'var(--vscode-editorWarning-foreground)',
  success: 'var(--vscode-testing-iconPassed)',
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'grid',
    gridTemplateColumns: '300px 50px 1fr',
    gridTemplateRows: 'auto 1fr auto auto',
    height: '100vh',
    fontFamily: 'var(--vscode-font-family)',
    fontSize: '13px',
    color: colors.text,
    backgroundColor: colors.bg,
  },
  header: {
    gridColumn: '1 / -1',
    padding: '12px 16px',
    borderBottom: `1px solid ${colors.border}`,
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    backgroundColor: colors.bgSecondary,
  },
  headerTitle: {
    fontSize: '16px',
    fontWeight: 600,
    margin: 0,
  },
  headerInfo: {
    fontSize: '12px',
    color: colors.textMuted,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  columnListPanel: {
    display: 'flex',
    flexDirection: 'column',
    borderRight: `1px solid ${colors.border}`,
    overflow: 'hidden',
  },
  columnListHeader: {
    padding: '8px 12px',
    fontWeight: 600,
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: `1px solid ${colors.border}`,
    backgroundColor: colors.bgSecondary,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  columnList: {
    flex: 1,
    overflowY: 'auto',
    padding: '4px 0',
  },
  columnItem: {
    padding: '6px 12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    borderLeft: '3px solid transparent',
  },
  columnItemSelected: {
    backgroundColor: colors.selection,
    color: colors.selectionText,
    borderLeftColor: colors.accent,
  },
  columnIcon: {
    width: '16px',
    textAlign: 'center',
    flexShrink: 0,
  },
  columnName: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  columnAlias: {
    fontSize: '10px',
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  columnTarget: {
    fontSize: '10px',
    padding: '1px 6px',
    borderRadius: '3px',
    textTransform: 'uppercase',
    fontWeight: 600,
  },
  actionPanel: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '4px',
    padding: '8px',
    borderRight: `1px solid ${colors.border}`,
    backgroundColor: colors.bgSecondary,
  },
  actionButton: {
    width: '32px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.bg,
    color: colors.text,
    cursor: 'pointer',
    borderRadius: '3px',
    fontSize: '14px',
  },
  actionButtonDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  propertyPanel: {
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  propertyHeader: {
    padding: '8px 16px',
    fontWeight: 600,
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: `1px solid ${colors.border}`,
    backgroundColor: colors.bgSecondary,
  },
  propertyContent: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
  },
  propertyGroup: {
    marginBottom: '20px',
  },
  propertyGroupTitle: {
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: colors.textMuted,
    marginBottom: '12px',
    paddingBottom: '4px',
    borderBottom: `1px solid ${colors.border}`,
  },
  propertyRow: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr',
    alignItems: 'center',
    marginBottom: '10px',
    gap: '12px',
  },
  propertyLabel: {
    fontSize: '12px',
    color: colors.textMuted,
  },
  input: {
    width: '100%',
    padding: '6px 8px',
    backgroundColor: colors.input,
    border: `1px solid ${colors.inputBorder}`,
    color: colors.text,
    borderRadius: '3px',
    fontSize: '13px',
  },
  inputReadonly: {
    backgroundColor: colors.bgSecondary,
    cursor: 'not-allowed',
  },
  select: {
    width: '100%',
    padding: '6px 8px',
    backgroundColor: colors.input,
    border: `1px solid ${colors.inputBorder}`,
    color: colors.text,
    borderRadius: '3px',
    fontSize: '13px',
  },
  checkbox: {
    width: '16px',
    height: '16px',
  },
  validationPanel: {
    gridColumn: '1 / -1',
    maxHeight: '120px',
    overflowY: 'auto',
    borderTop: `1px solid ${colors.border}`,
    backgroundColor: colors.bgSecondary,
  },
  validationHeader: {
    padding: '6px 16px',
    fontWeight: 600,
    fontSize: '11px',
    textTransform: 'uppercase',
    borderBottom: `1px solid ${colors.border}`,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  validationItem: {
    padding: '4px 16px',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  footer: {
    gridColumn: '1 / -1',
    padding: '12px 16px',
    borderTop: `1px solid ${colors.border}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
  },
  footerStats: {
    display: 'flex',
    gap: '16px',
    fontSize: '12px',
    color: colors.textMuted,
  },
  footerButtons: {
    display: 'flex',
    gap: '8px',
  },
  buttonPrimary: {
    padding: '8px 16px',
    backgroundColor: colors.button,
    color: colors.buttonText,
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    fontWeight: 500,
    fontSize: '13px',
  },
  buttonSecondary: {
    padding: '8px 16px',
    backgroundColor: colors.buttonSecondary,
    color: colors.buttonSecondaryText,
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    fontWeight: 500,
    fontSize: '13px',
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: colors.textMuted,
    textAlign: 'center',
    padding: '32px',
  },
  loadingContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    flexDirection: 'column',
    gap: '16px',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  overlayContent: {
    backgroundColor: colors.bg,
    padding: '24px 32px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    border: `1px solid ${colors.border}`,
  },
  combobox: {
    position: 'relative',
  },
  datalist: {
    width: '100%',
  },
};

// Target colors
const targetColors: Record<DataVaultTarget, { bg: string; text: string; icon: string; label: string }> = {
  hub: { bg: '#2d5a27', text: '#90EE90', icon: '🏛️', label: 'HUB' },
  satellite: { bg: '#1e4a6e', text: '#87CEEB', icon: '📦', label: 'SAT' },
  link: { bg: '#5a4a27', text: '#F0E68C', icon: '🔗', label: 'LINK' },
  dependent_child: { bg: '#5a2a5a', text: '#DDA0DD', icon: '📎', label: 'DC' },
  multi_active: { bg: '#2a5a5a', text: '#20B2AA', icon: '📚', label: 'MA' },
  metadata: { bg: '#444', text: '#aaa', icon: '⚙️', label: 'META' },
  ignore: { bg: '#333', text: '#666', icon: '🚫', label: 'IGN' },
};

// ============================================================================
// HELPER: Check if column has a specific type (primary or additional)
// ============================================================================
function hasColumnType(col: ColumnConfig, type: DataVaultTarget): boolean {
  if (col.columnType === type) return true;
  return col.additionalTypes?.includes(type) ?? false;
}

// ============================================================================
// DATA VAULT VALIDATION - Per Object Type
// ============================================================================
function validateDataVault(columns: ColumnConfig[], entityName: string, existingHubs: string[]): ValidationError[] {
  const errors: ValidationError[] = [];
  
  // Use hasColumnType to include columns with additionalTypes
  const hubCols = columns.filter(c => hasColumnType(c, 'hub'));
  const satCols = columns.filter(c => hasColumnType(c, 'satellite'));
  const linkCols = columns.filter(c => hasColumnType(c, 'link'));
  const dcCols = columns.filter(c => hasColumnType(c, 'dependent_child'));
  const maCols = columns.filter(c => hasColumnType(c, 'multi_active'));
  
  // Check if this is a pure Dependent Child entity (no own Hub, only DC Sat)
  const isPureDependentChild = dcCols.length > 0 && hubCols.length === 0 && linkCols.length > 0;
  
  // DV Rule 1: At least one Business Key required (affects Hub + Satellite)
  // Exception: Pure Dependent Child entities don't need a BK (they have no Hub)
  if (hubCols.length === 0 && !isPureDependentChild) {
    errors.push({
      type: 'error',
      message: 'At least one Business Key (Hub) column is required',
      affectsObject: 'hub', // Only blocks Hub generation
    });
  }
  
  // DV Rule 2: Business Keys should not be nullable
  hubCols.forEach(col => {
    if (col.nullable) {
      errors.push({
        type: 'warning',
        message: `Business Key "${col.alias || col.name}" should not be nullable`,
        column: col.name,
        affectsObject: 'hub',
      });
    }
  });
  
  // DV Rule 3: Link columns must have a target (only affects Links)
  linkCols.forEach(col => {
    if (!col.foreignKeyTarget) {
      errors.push({
        type: 'error',
        message: `Link column "${col.alias || col.name}" requires a target Hub`,
        column: col.name,
        affectsObject: 'link', // Only blocks Link generation
      });
    } else if (!existingHubs.includes(col.foreignKeyTarget)) {
      errors.push({
        type: 'error',
        message: `Target Hub "${col.foreignKeyTarget}" does not exist for column "${col.alias || col.name}"`,
        column: col.name,
        affectsObject: 'link', // Only blocks Link generation
      });
    }
  });
  
  // DV Rule 4: Recommend at least one satellite attribute
  if (satCols.length === 0) {
    errors.push({
      type: 'warning',
      message: 'No Satellite attributes defined - consider adding descriptive columns',
      affectsObject: 'satellite',
    });
  }
  
  // DV Rule 5: Entity name should follow naming convention
  if (!/^[a-z][a-z0-9_]*$/.test(entityName)) {
    errors.push({
      type: 'warning',
      message: 'Entity name should be lowercase with underscores (e.g., "customer_contact")',
      affectsObject: 'all',
    });
  }
  
  // DV Rule 6: Check for duplicate aliases (affects all)
  const aliases = columns.filter(c => c.columnType !== 'ignore').map(c => c.alias || c.name);
  const duplicates = aliases.filter((a, i) => aliases.indexOf(a) !== i);
  if (duplicates.length > 0) {
    errors.push({
      type: 'error',
      message: `Duplicate column names: ${[...new Set(duplicates)].join(', ')}`,
      affectsObject: 'all', // Blocks all generation
    });
  }
  
  // DV Rule 7: Dependent Child columns must have a target Link
  dcCols.forEach(col => {
    if (!col.dependentChildForLink) {
      errors.push({
        type: 'error',
        message: `Dependent Child Key "${col.alias || col.name}" requires a target Link`,
        column: col.name,
        affectsObject: 'link', // DC Sats belong to Links
      });
    }
  });
  
  // DV Rule 8: DC columns require at least one Link column
  if (dcCols.length > 0 && linkCols.length === 0) {
    errors.push({
      type: 'error',
      message: 'Dependent Child Keys require at least one Link column',
      affectsObject: 'link',
    });
  }
  
  // DV Rule 9: MA columns require at least one satellite attribute (MA Sat context)
  if (maCols.length > 0 && satCols.length === 0) {
    errors.push({
      type: 'warning',
      message: 'Multi-Active Keys typically have Satellite attributes for payload',
      affectsObject: 'satellite',
    });
  }
  
  // DV Rule 10: MA Satellite requires Hub (MA Sat hangs on Hub, not Link)
  if (maCols.length > 0 && hubCols.length === 0) {
    errors.push({
      type: 'error',
      message: 'Multi-Active Satellite requires at least one Business Key (Hub). MA Sat hangs on Hub, not Link.',
      affectsObject: 'satellite',
    });
  }
  
  return errors;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export const App: React.FC = () => {
  const vscode = useVSCodeApi();
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [initData, setInitData] = useState<InitData | null>(null);
  const [columns, setColumns] = useState<ColumnConfig[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [entityName, setEntityName] = useState('');
  const [existingHubs, setExistingHubs] = useState<string[]>([]);

  // Lambda Vault state
  const [lambdaVaultEnabled, setLambdaVaultEnabled] = useState(false);
  const [showLambdaVaultModal, setShowLambdaVaultModal] = useState(false);
  const [deltaStagingModel, setDeltaStagingModel] = useState<string>('');
  const [columnMappings, setColumnMappings] = useState<LambdaColumnMapping[]>([]);
  const [availableStagingModels, setAvailableStagingModels] = useState<StagingModelInfo[]>([]);
  const [baseStagingColumns, setBaseStagingColumns] = useState<string[]>([]);

  // ============================================================================
  // MESSAGE HANDLING
  // ============================================================================
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      console.log('[Entity Designer] Received:', message.type);
      
      if (message.type === 'init') {
        const data = message.data as InitData & { savedColumns?: Array<{
          name: string;
          sourceName?: string;
          dataType?: string;
          columnType: string;
          includeInHashDiff?: boolean;
          foreignKeyTarget?: string;
          dependentChildForLink?: string;
          multiActiveSequence?: boolean;
          nullable?: boolean;
        }> };
        setInitData(data);
        setEntityName(data.entityName);
        setExistingHubs(data.existingHubs || []);
        
        // Filter out hash columns (hk_*, hd_*) - these are auto-generated
        const filteredColumns = data.columns.filter(col => 
          !col.name.toLowerCase().startsWith('hk_') && 
          !col.name.toLowerCase().startsWith('hd_')
        );
        
        // Check if we have saved configuration
        const savedColumnMap = data.savedColumns 
          ? new Map(data.savedColumns.map(c => {
              // Use sourceName if available, otherwise name (for both key lookups)
              const key = (c.sourceName || c.name).toLowerCase();
              return [key, c];
            }))
          : null;
        
        if (savedColumnMap) {
          console.log('[Entity Designer] Restoring saved column configuration, saved columns:', data.savedColumns?.length);
        }
        
        // Convert columns - use saved config if available, otherwise auto-detect
        // IMPORTANT: dataType from sources.yml (col.dataType) is the Single Source of Truth
        // Only use saved dataType if it was explicitly changed by user (different from source)
        const configuredColumns: ColumnConfig[] = filteredColumns.map((col, index) => {
          const saved = savedColumnMap?.get(col.name.toLowerCase());
          // Source dataType from sources.yml - this is the truth
          const sourceDataType = col.dataType || 'NVARCHAR(MAX)';
          
          if (saved) {
            // Restore from saved configuration
            // Map old columnType names to new DataVaultTarget names
            let target: DataVaultTarget = 'satellite';
            if (saved.columnType === 'business_key' || saved.columnType === 'hub') {
              target = 'hub';
            } else if (saved.columnType === 'attribute' || saved.columnType === 'satellite') {
              target = 'satellite';
            } else if (saved.columnType === 'foreign_key' || saved.columnType === 'link') {
              target = 'link';
            } else if (saved.columnType === 'dependent_child') {
              target = 'dependent_child';
            } else if (saved.columnType === 'multi_active') {
              target = 'multi_active';
            } else if (saved.columnType === 'metadata') {
              target = 'metadata';
            } else if (saved.columnType === 'ignore') {
              target = 'ignore';
            }
            
            // Load additionalTypes (e.g., ['satellite'] for link+satellite columns)
            const additionalTypes = saved.additionalTypes as DataVaultTarget[] | undefined;
            
            return {
              name: col.name,
              sourceName: saved.sourceName || col.name,
              alias: saved.name || col.name,
              // Use source dataType - it's synced with sources.yml
              dataType: sourceDataType,
              columnType: target,
              additionalTypes,
              includeInHashDiff: target === 'satellite' || additionalTypes?.includes('satellite'),
              foreignKeyTarget: saved.foreignKeyTarget,
              dependentChildForLink: saved.dependentChildForLink,
              multiActiveSequence: saved.multiActiveSequence,
              nullable: saved.nullable ?? true,
              position: index,
            };
          } else {
            // Auto-detect based on column name patterns
            let target: DataVaultTarget = 'satellite';
            let foreignKeyTarget: string | undefined;
            
            if (col.name.startsWith('dss_')) {
              target = 'metadata';
            } else if (col.name === 'object_id' || col.name === 'id' || col.name.endsWith('_bk')) {
              target = 'hub';
            } else if (col.name.endsWith('_id') && col.name.split('_').length > 1 && col.name !== 'object_id') {
              target = 'link';
              const potentialEntity = col.name.replace(/_id$/, '').split('_').pop();
              foreignKeyTarget = data.existingHubs?.find(h => h.includes(potentialEntity || ''));
            }

            return {
              name: col.name,
              sourceName: col.name,
              alias: col.name,
              dataType: sourceDataType,
              columnType: target,
              includeInHashDiff: target === 'satellite',
              foreignKeyTarget,
              nullable: true,
              position: index,
            };
          }
        });
        
        setColumns(configuredColumns);
        setSelectedIndex(configuredColumns.length > 0 ? 0 : null);
        
        // Initialize Lambda Vault state
        setAvailableStagingModels(data.availableStagingModels || []);
        setBaseStagingColumns(data.baseStagingColumns || []);
        if (data.lambdaVault) {
          setLambdaVaultEnabled(data.lambdaVault.enabled);
          setDeltaStagingModel(data.lambdaVault.deltaStagingModel || '');
          setColumnMappings(data.lambdaVault.columnMappings || []);
        }
        
        setIsLoading(false);
      } else if (message.type === 'generationComplete') {
        setIsGenerating(false);
      }
    };

    window.addEventListener('message', handleMessage);
    vscode.postMessage({ type: 'ready' });
    
    return () => window.removeEventListener('message', handleMessage);
  }, [vscode]);

  // ============================================================================
  // AUTO-SAVE CONFIG (Config-First: JSON is Single Source of Truth)
  // ============================================================================
  useEffect(() => {
    // Don't save during initial load
    if (isLoading || columns.length === 0) {
      return;
    }

    // Debounce save to avoid too many writes
    const timeoutId = setTimeout(() => {
      const savedColumns = columns.map(c => ({
        name: c.alias || c.name,
        sourceName: c.sourceName,
        dataType: c.dataType,
        columnType: c.columnType,
        // Save additionalTypes (e.g., satellite for link+satellite columns)
        ...(c.additionalTypes && c.additionalTypes.length > 0 && { additionalTypes: c.additionalTypes }),
        ...(c.foreignKeyTarget && { foreignKeyTarget: c.foreignKeyTarget }),
        ...(c.dependentChildForLink && { dependentChildForLink: c.dependentChildForLink }),
        ...(c.multiActiveSequence !== undefined && { multiActiveSequence: c.multiActiveSequence }),
        nullable: c.nullable,
      }));

      // Build Lambda Vault config if enabled
      const lambdaVault: LambdaVaultConfig | undefined = lambdaVaultEnabled ? {
        enabled: true,
        deltaStagingModel,
        columnMappings
      } : undefined;

      vscode.postMessage({
        type: 'saveConfig',
        columns: savedColumns,
        entityName: entityName,  // Include entityName for renaming support
        lambdaVault
      });
      console.log('[Entity Designer] Config auto-saved');
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [columns, entityName, lambdaVaultEnabled, deltaStagingModel, columnMappings, isLoading, vscode]);

  // ============================================================================
  // VALIDATION - Per Object Type
  // ============================================================================
  const validationErrors = useMemo(() => {
    return validateDataVault(columns, entityName, existingHubs);
  }, [columns, entityName, existingHubs]);
  
  // Check errors per object type - only block the affected objects
  // Note: 'all' errors are included in each specific check via the || condition
  const hasHubErrors = validationErrors.some(e => e.type === 'error' && (e.affectsObject === 'hub' || e.affectsObject === 'all'));
  const hasSatelliteErrors = validationErrors.some(e => e.type === 'error' && (e.affectsObject === 'satellite' || e.affectsObject === 'all'));
  const hasLinkErrors = validationErrors.some(e => e.type === 'error' && (e.affectsObject === 'link' || e.affectsObject === 'all'));
  const hasAnyError = validationErrors.some(e => e.type === 'error');
  
  // PIT table requires Hub + at least one Satellite to be useful
  const canGeneratePIT = !hasHubErrors && !hasSatelliteErrors;

  // ============================================================================
  // COLUMN OPERATIONS
  // ============================================================================
  const selectedColumn = selectedIndex !== null ? columns[selectedIndex] : null;

  const updateColumn = useCallback((index: number, updates: Partial<ColumnConfig>) => {
    setColumns(prev => {
      const newColumns = [...prev];
      const column = newColumns[index];
      newColumns[index] = { ...column, ...updates };
      // DataType changes are saved to JSON via auto-save
      // sources.yml sync happens on Generate
      return newColumns;
    });
  }, []);

  const moveColumn = useCallback((direction: 'up' | 'down' | 'top' | 'bottom') => {
    if (selectedIndex === null) return;
    
    setColumns(prev => {
      const newColumns = [...prev];
      let newIndex = selectedIndex;
      
      switch (direction) {
        case 'up':
          if (selectedIndex > 0) {
            [newColumns[selectedIndex], newColumns[selectedIndex - 1]] = 
            [newColumns[selectedIndex - 1], newColumns[selectedIndex]];
            newIndex = selectedIndex - 1;
          }
          break;
        case 'down':
          if (selectedIndex < newColumns.length - 1) {
            [newColumns[selectedIndex], newColumns[selectedIndex + 1]] = 
            [newColumns[selectedIndex + 1], newColumns[selectedIndex]];
            newIndex = selectedIndex + 1;
          }
          break;
        case 'top':
          if (selectedIndex > 0) {
            const [item] = newColumns.splice(selectedIndex, 1);
            newColumns.unshift(item);
            newIndex = 0;
          }
          break;
        case 'bottom':
          if (selectedIndex < newColumns.length - 1) {
            const [item] = newColumns.splice(selectedIndex, 1);
            newColumns.push(item);
            newIndex = newColumns.length - 1;
          }
          break;
      }
      
      newColumns.forEach((col, i) => col.position = i);
      setSelectedIndex(newIndex);
      return newColumns;
    });
  }, [selectedIndex]);

  // ============================================================================
  // STATISTICS
  // ============================================================================
  const stats = useMemo(() => {
    const hubCols = columns.filter(c => c.columnType === 'hub');
    const satCols = columns.filter(c => c.columnType === 'satellite');
    const linkCols = columns.filter(c => c.columnType === 'link');
    const dcCols = columns.filter(c => c.columnType === 'dependent_child');
    const maCols = columns.filter(c => c.columnType === 'multi_active');
    return { hubCols, satCols, linkCols, dcCols, maCols };
  }, [columns]);

  // ============================================================================
  // GENERATION (Config-First: reads from saved JSON)
  // ============================================================================
  const handleGenerate = (target: 'all' | 'hub' | 'satellite' | 'links' | 'pit') => {
    // Check only relevant errors for the target
    const relevantErrors = target === 'all' ? hasAnyError :
      target === 'hub' ? hasHubErrors :
      target === 'satellite' ? (hasHubErrors || hasSatelliteErrors) : // Satellite needs Hub for FK
      target === 'pit' ? (hasHubErrors || hasSatelliteErrors) : // PIT needs Hub + Satellites
      hasLinkErrors;
    
    if (relevantErrors) {
      vscode.postMessage({ 
        type: 'showError', 
        message: `Please fix validation errors before generating ${target === 'all' ? 'all objects' : target}` 
      });
      return;
    }
    
    setIsGenerating(true);
    
    // Config-First: Only send the target, config is read from JSON file
    vscode.postMessage({
      type: 'generate',
      target
    });
  };

  // ============================================================================
  // RENDER: LOADING STATE
  // ============================================================================
  if (isLoading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={{ fontSize: '32px' }}>⏳</div>
        <div>Loading Entity Designer...</div>
      </div>
    );
  }

  // ============================================================================
  // RENDER: MAIN UI
  // ============================================================================
  return (
    <div style={styles.container}>
      {/* HEADER */}
      <div style={styles.header}>
        <h1 style={styles.headerTitle}>Entity Designer</h1>
        <div style={styles.headerInfo}>
          <span><strong>Entity:</strong></span>
          <input
            type="text"
            value={entityName}
            onChange={(e) => setEntityName(e.target.value)}
            style={{ ...styles.input, width: '140px', display: 'inline-block' }}
          />
          <span>|</span>
          <span><strong>Concept:</strong> {initData?.concept}</span>
          <span>|</span>
          <span><strong>Source:</strong> {initData?.sourceTable}</span>
          <span>|</span>
          {/* Lambda Vault Toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={lambdaVaultEnabled}
              onChange={(e) => {
                setLambdaVaultEnabled(e.target.checked);
                if (e.target.checked && !deltaStagingModel) {
                  setShowLambdaVaultModal(true);
                }
              }}
              style={styles.checkbox}
            />
            <span style={{ fontWeight: 500 }}>🔄 Lambda Vault</span>
          </label>
          {lambdaVaultEnabled && (
            <button
              onClick={() => setShowLambdaVaultModal(true)}
              style={{
                ...styles.buttonSecondary,
                padding: '4px 8px',
                fontSize: '11px',
              }}
            >
              Configure Mappings
            </button>
          )}
        </div>
      </div>

      {/* LEFT PANEL: Column List */}
      <div style={styles.columnListPanel}>
        <div style={styles.columnListHeader}>
          <span>Columns ({columns.length})</span>
          <span style={{ fontSize: '10px', color: colors.textMuted }}>
            {stats.hubCols.length}H / {stats.satCols.length}S / {stats.linkCols.length}L
            {stats.dcCols.length > 0 && ` / ${stats.dcCols.length}DC`}
            {stats.maCols.length > 0 && ` / ${stats.maCols.length}MA`}
          </span>
        </div>
        <div style={styles.columnList}>
          {columns.map((col, index) => {
            const target = targetColors[col.columnType as DataVaultTarget] || targetColors.satellite;
            const isSelected = index === selectedIndex;
            const hasAlias = col.alias && col.alias !== col.sourceName;
            
            return (
              <div
                key={col.sourceName}
                onClick={() => setSelectedIndex(index)}
                style={{
                  ...styles.columnItem,
                  ...(isSelected ? styles.columnItemSelected : {}),
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = colors.hover;
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span style={styles.columnIcon}>{target.icon}</span>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={styles.columnName} title={col.sourceName}>
                    {hasAlias ? col.alias : col.sourceName}
                  </div>
                  {hasAlias && (
                    <div style={styles.columnAlias}>← {col.sourceName}</div>
                  )}
                </div>
                <span style={{
                  ...styles.columnTarget,
                  backgroundColor: target.bg,
                  color: target.text,
                }}>
                  {target.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* MIDDLE PANEL: Action Buttons */}
      <div style={styles.actionPanel}>
        <button
          style={{ ...styles.actionButton, ...(selectedIndex === null || selectedIndex === 0 ? styles.actionButtonDisabled : {}) }}
          onClick={() => moveColumn('top')}
          disabled={selectedIndex === null || selectedIndex === 0}
          title="Move to top"
        >⏫</button>
        <button
          style={{ ...styles.actionButton, ...(selectedIndex === null || selectedIndex === 0 ? styles.actionButtonDisabled : {}) }}
          onClick={() => moveColumn('up')}
          disabled={selectedIndex === null || selectedIndex === 0}
          title="Move up"
        >⬆️</button>
        <button
          style={{ ...styles.actionButton, ...(selectedIndex === null || selectedIndex === columns.length - 1 ? styles.actionButtonDisabled : {}) }}
          onClick={() => moveColumn('down')}
          disabled={selectedIndex === null || selectedIndex === columns.length - 1}
          title="Move down"
        >⬇️</button>
        <button
          style={{ ...styles.actionButton, ...(selectedIndex === null || selectedIndex === columns.length - 1 ? styles.actionButtonDisabled : {}) }}
          onClick={() => moveColumn('bottom')}
          disabled={selectedIndex === null || selectedIndex === columns.length - 1}
          title="Move to bottom"
        >⏬</button>
      </div>

      {/* RIGHT PANEL: Property Editor */}
      <div style={styles.propertyPanel}>
        <div style={styles.propertyHeader}>
          Column Properties{selectedColumn && `: ${selectedColumn.sourceName}`}
        </div>
        
        {selectedColumn ? (
          <div style={styles.propertyContent}>
            {/* Source Information */}
            <div style={styles.propertyGroup}>
              <div style={styles.propertyGroupTitle}>Source Column</div>
              
              <div style={styles.propertyRow}>
                <span style={styles.propertyLabel}>Source name:</span>
                <input
                  type="text"
                  value={selectedColumn.sourceName}
                  readOnly
                  style={{ ...styles.input, ...styles.inputReadonly }}
                />
              </div>
              
              <div style={styles.propertyRow}>
                <span style={styles.propertyLabel}>Target name (alias):</span>
                <input
                  type="text"
                  value={selectedColumn.alias}
                  onChange={(e) => updateColumn(selectedIndex!, { alias: e.target.value })}
                  style={styles.input}
                  placeholder="Same as source"
                />
              </div>
              
              <div style={styles.propertyRow}>
                <span style={styles.propertyLabel}>Data type:</span>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  {(() => {
                    const { base, size } = parseDataType(selectedColumn.dataType);
                    const typeInfo = SQL_BASE_TYPES.find(t => t.type === base);
                    const isKnownType = !!typeInfo;
                    
                    return (
                      <>
                        <select
                          value={isKnownType ? base : '__custom__'}
                          onChange={(e) => {
                            const newBase = e.target.value;
                            if (newBase === '__custom__') {
                              updateColumn(selectedIndex!, { dataType: selectedColumn.dataType });
                            } else {
                              const newTypeInfo = SQL_BASE_TYPES.find(t => t.type === newBase);
                              const newSize = newTypeInfo?.hasSize ? (newTypeInfo.defaultSize || '') : null;
                              updateColumn(selectedIndex!, { dataType: formatDataType(newBase, newSize) });
                            }
                          }}
                          style={{ ...styles.select, flex: 1 }}
                        >
                          {SQL_BASE_TYPES.map(dt => (
                            <option key={dt.type} value={dt.type}>{dt.type}</option>
                          ))}
                          <option value="__custom__">Custom...</option>
                        </select>
                        
                        {/* Size input - shown when type has size parameter */}
                        {(typeInfo?.hasSize || !isKnownType) && (
                          <input
                            type="text"
                            value={size || ''}
                            onChange={(e) => {
                              const newSize = e.target.value || null;
                              updateColumn(selectedIndex!, { dataType: formatDataType(base, newSize) });
                            }}
                            style={{ ...styles.input, width: '80px' }}
                            placeholder={typeInfo?.defaultSize || 'Size'}
                            title="Size (e.g., 255, MAX, 18,2)"
                          />
                        )}
                        
                        {/* Custom type input - only when not a known type */}
                        {!isKnownType && (
                          <input
                            type="text"
                            value={selectedColumn.dataType}
                            onChange={(e) => updateColumn(selectedIndex!, { dataType: e.target.value })}
                            style={{ ...styles.input, width: '120px' }}
                            placeholder="Custom type"
                          />
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
              
              <div style={styles.propertyRow}>
                <span style={styles.propertyLabel}>Nullable:</span>
                <input
                  type="checkbox"
                  checked={selectedColumn.nullable}
                  onChange={(e) => updateColumn(selectedIndex!, { nullable: e.target.checked })}
                  style={styles.checkbox}
                />
              </div>
            </div>

            {/* Data Vault Target */}
            <div style={styles.propertyGroup}>
              <div style={styles.propertyGroupTitle}>Data Vault Target</div>
              
              <div style={styles.propertyRow}>
                <span style={styles.propertyLabel}>Target object:</span>
                <select
                  value={selectedColumn.columnType}
                  onChange={(e) => {
                    const newTarget = e.target.value as DataVaultTarget;
                    updateColumn(selectedIndex!, { 
                      columnType: newTarget,
                      includeInHashDiff: newTarget === 'satellite',
                      foreignKeyTarget: newTarget === 'link' ? selectedColumn.foreignKeyTarget : undefined,
                      dependentChildForLink: newTarget === 'dependent_child' ? selectedColumn.dependentChildForLink : undefined,
                      multiActiveSequence: newTarget === 'multi_active' ? selectedColumn.multiActiveSequence : undefined,
                    });
                  }}
                  style={styles.select}
                  disabled={selectedColumn.columnType === 'metadata'}
                >
                  <option value="hub">🏛️ Hub (Business Key)</option>
                  <option value="satellite">📦 Satellite (Attribute)</option>
                  <option value="link">🔗 Link (Foreign Key)</option>
                  <option value="dependent_child">📎 Dependent Child Key</option>
                  <option value="multi_active">📚 Multi-Active Key</option>
                  <option value="metadata" disabled>⚙️ Metadata (system)</option>
                  <option value="ignore">🚫 Ignore</option>
                </select>
              </div>

              {/* Link-specific: Target Hub */}
              {selectedColumn.columnType === 'link' && (
                <>
                  <div style={styles.propertyRow}>
                    <span style={styles.propertyLabel}>Target Hub:</span>
                    <select
                      value={selectedColumn.foreignKeyTarget || ''}
                      onChange={(e) => updateColumn(selectedIndex!, { foreignKeyTarget: e.target.value || undefined })}
                      style={{
                        ...styles.select,
                        borderColor: !selectedColumn.foreignKeyTarget ? colors.error : colors.inputBorder,
                      }}
                    >
                      <option value="">-- Select Target Hub --</option>
                      {existingHubs.map(hub => (
                        <option key={hub} value={hub}>{hub}</option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Also include in Satellite checkbox */}
                  <div style={styles.propertyRow}>
                    <span style={styles.propertyLabel}>Also in Satellite:</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        checked={selectedColumn.additionalTypes?.includes('satellite') ?? false}
                        onChange={(e) => {
                          const newAdditionalTypes = e.target.checked ? ['satellite'] as DataVaultTarget[] : undefined;
                          updateColumn(selectedIndex!, { 
                            additionalTypes: newAdditionalTypes,
                            includeInHashDiff: e.target.checked  // Include in hash diff if in satellite
                          });
                        }}
                        style={styles.checkbox}
                      />
                      <span style={{ fontSize: '11px', color: colors.textMuted }}>
                        Copy value to Satellite (for denormalized access)
                      </span>
                    </div>
                  </div>
                </>
              )}

              {/* Dependent Child: Target Link */}
              {selectedColumn.columnType === 'dependent_child' && (
                <div style={styles.propertyRow}>
                  <span style={styles.propertyLabel}>For Link:</span>
                  <select
                    value={selectedColumn.dependentChildForLink || ''}
                    onChange={(e) => updateColumn(selectedIndex!, { dependentChildForLink: e.target.value || undefined })}
                    style={{
                      ...styles.select,
                      borderColor: !selectedColumn.dependentChildForLink ? colors.error : colors.inputBorder,
                    }}
                  >
                    <option value="">-- Select Link --</option>
                    {columns
                      .filter(c => c.columnType === 'link' && c.foreignKeyTarget)
                      .map(c => c.foreignKeyTarget!)
                      .filter((v, i, a) => a.indexOf(v) === i) // unique
                      .map(linkHub => (
                        <option key={linkHub} value={linkHub}>link_{entityName}_{linkHub}</option>
                      ))}
                  </select>
                  <div style={{ fontSize: '10px', color: colors.textMuted, marginTop: '4px' }}>
                    DCK will be part of Link hash + DC Satellite payload
                  </div>
                </div>
              )}

              {/* Multi-Active: Sequence indicator */}
              {selectedColumn.columnType === 'multi_active' && (
                <div style={styles.propertyRow}>
                  <span style={styles.propertyLabel}>Primary CDK:</span>
                  <input
                    type="checkbox"
                    checked={selectedColumn.multiActiveSequence || false}
                    onChange={(e) => updateColumn(selectedIndex!, { multiActiveSequence: e.target.checked })}
                    style={styles.checkbox}
                  />
                  <div style={{ fontSize: '10px', color: colors.textMuted, marginTop: '4px' }}>
                    CDK (Child Dependent Key) distinguishes concurrent records in MA Satellite. Mark primary CDK for documentation.
                  </div>
                </div>
              )}
            </div>

            {/* Generation Preview */}
            <div style={styles.propertyGroup}>
              <div style={styles.propertyGroupTitle}>Generation Preview</div>
              <div style={{ 
                padding: '12px', 
                backgroundColor: colors.bgSecondary, 
                borderRadius: '4px',
                fontFamily: 'var(--vscode-editor-font-family)',
                fontSize: '12px',
                lineHeight: 1.6,
              }}>
                {selectedColumn.columnType === 'hub' && (
                  <>
                    <div><strong>Staging:</strong></div>
                    <code style={{ color: '#9cdcfe' }}>
                      {selectedColumn.alias !== selectedColumn.sourceName 
                        ? `${selectedColumn.sourceName} AS ${selectedColumn.alias}`
                        : selectedColumn.sourceName
                      }
                    </code>
                    <div style={{ marginTop: '8px' }}><strong>Hub:</strong> hub_{entityName}</div>
                    <code style={{ color: '#9cdcfe' }}>
                      hk_{entityName} = SHA256({stats.hubCols.map(c => c.alias || c.name).join(' ^^ ')})
                    </code>
                  </>
                )}
                {selectedColumn.columnType === 'satellite' && (
                  <>
                    <div><strong>Staging:</strong></div>
                    <code style={{ color: '#9cdcfe' }}>
                      {selectedColumn.alias !== selectedColumn.sourceName 
                        ? `${selectedColumn.sourceName} AS ${selectedColumn.alias}`
                        : selectedColumn.sourceName
                      }
                    </code>
                    <div style={{ marginTop: '8px' }}><strong>Satellite:</strong> sat_{entityName}</div>
                    <div style={{ color: colors.textMuted }}>
                      Included in Hash Diff (hd_{entityName})
                    </div>
                  </>
                )}
                {selectedColumn.columnType === 'link' && (
                  <>
                    <div><strong>Link:</strong> link_{entityName}_{selectedColumn.foreignKeyTarget?.replace('hub_', '') || '???'}</div>
                    <div style={{ color: colors.textMuted }}>
                      Connects hub_{entityName} → {selectedColumn.foreignKeyTarget || '(select target)'}
                    </div>
                    <div style={{ color: colors.textMuted }}>
                      Driving key: {selectedColumn.alias || selectedColumn.sourceName}
                    </div>
                  </>
                )}
                {selectedColumn.columnType === 'dependent_child' && (
                  <>
                    <div><strong>DC Satellite:</strong> sat_{entityName}_{selectedColumn.dependentChildForLink?.replace('hub_', '') || '???'}_dc</div>
                    <div style={{ marginTop: '8px' }}><strong>Staging:</strong></div>
                    <code style={{ color: '#9cdcfe' }}>
                      hk_link_{entityName}_{selectedColumn.dependentChildForLink?.replace('hub_', '') || '???'} = SHA256(...{selectedColumn.alias || selectedColumn.sourceName}...)
                    </code>
                    <div style={{ color: colors.textMuted, marginTop: '4px' }}>
                      DCK included in Link hash + DC Satellite payload
                    </div>
                  </>
                )}
                {selectedColumn.columnType === 'multi_active' && (
                  <>
                    <div><strong>MA Satellite:</strong> sat_{entityName}_ma</div>
                    <div style={{ marginTop: '8px' }}><strong>Staging:</strong></div>
                    <code style={{ color: '#9cdcfe' }}>
                      hd_{entityName}_ma = SHA256({stats.maCols.map(c => c.alias || c.name).join(' || ')} || attributes)
                    </code>
                    <div style={{ color: colors.textMuted, marginTop: '4px' }}>
                      CDK (Child Dependent Key) - distinguishes concurrent records in MA Satellite
                    </div>
                  </>
                )}
                {selectedColumn.columnType === 'metadata' && (
                  <div style={{ color: colors.textMuted }}>
                    System column - auto-included in all generated objects
                  </div>
                )}
                {selectedColumn.columnType === 'ignore' && (
                  <div style={{ color: colors.textMuted }}>
                    This column will not be included in staging or any DV object
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div style={styles.emptyState}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>👈</div>
            <div>Select a column to edit its properties</div>
          </div>
        )}
      </div>

      {/* VALIDATION PANEL */}
      {validationErrors.length > 0 && (
        <div style={styles.validationPanel}>
          <div style={{
            ...styles.validationHeader,
            color: hasAnyError ? colors.error : colors.warning,
          }}>
            {hasAnyError ? '❌' : '⚠️'} Data Vault Validation ({validationErrors.length})
          </div>
          {validationErrors.map((err, i) => (
            <div key={i} style={{
              ...styles.validationItem,
              color: err.type === 'error' ? colors.error : colors.warning,
            }}>
              <span>{err.type === 'error' ? '❌' : '⚠️'}</span>
              <span>{err.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* FOOTER */}
      <div style={styles.footer}>
        <div style={styles.footerStats}>
          <span>🏛️ Hub: <strong>{stats.hubCols.length}</strong>{hasHubErrors && ' ❌'}</span>
          <span>📦 Satellite: <strong>{stats.satCols.length}</strong>{hasSatelliteErrors && ' ❌'}</span>
          <span>🔗 Links: <strong>{stats.linkCols.length}</strong>{hasLinkErrors && ' ❌'}</span>
          {!hasAnyError && validationErrors.length === 0 && <span style={{ color: colors.success }}>✅ Valid</span>}
        </div>
        <div style={styles.footerButtons}>
          <button
            style={{ ...styles.buttonSecondary, ...(isGenerating || hasHubErrors || stats.hubCols.length === 0 ? styles.buttonDisabled : {}) }}
            onClick={() => handleGenerate('hub')}
            disabled={isGenerating || hasHubErrors || stats.hubCols.length === 0}
            title={hasHubErrors ? 'Fix Hub validation errors first' : 'Generate Hub model'}
          >Generate Hub</button>
          <button
            style={{ ...styles.buttonSecondary, ...(isGenerating || hasHubErrors || hasSatelliteErrors || stats.satCols.length === 0 ? styles.buttonDisabled : {}) }}
            onClick={() => handleGenerate('satellite')}
            disabled={isGenerating || hasHubErrors || hasSatelliteErrors || stats.satCols.length === 0}
            title={hasHubErrors || hasSatelliteErrors ? 'Fix validation errors first' : 'Generate Satellite model'}
          >Generate Satellite</button>
          <button
            style={{ ...styles.buttonSecondary, ...(isGenerating || hasLinkErrors || stats.linkCols.length === 0 ? styles.buttonDisabled : {}) }}
            onClick={() => handleGenerate('links')}
            disabled={isGenerating || hasLinkErrors || stats.linkCols.length === 0}
            title={hasLinkErrors ? 'Fix Link validation errors first (select target Hub)' : 'Generate Link models'}
          >Generate Links</button>
          <button
            style={{ ...styles.buttonSecondary, ...(isGenerating || !canGeneratePIT || stats.hubCols.length === 0 || stats.satCols.length === 0 ? styles.buttonDisabled : {}) }}
            onClick={() => handleGenerate('pit')}
            disabled={isGenerating || !canGeneratePIT || stats.hubCols.length === 0 || stats.satCols.length === 0}
            title={!canGeneratePIT ? 'Fix Hub/Satellite validation errors first' : stats.hubCols.length === 0 ? 'Requires Hub columns' : stats.satCols.length === 0 ? 'Requires Satellite columns' : 'Generate PIT table for this entity'}
          >Generate PIT</button>
          <button
            style={{ ...styles.buttonPrimary, ...(isGenerating || hasAnyError ? styles.buttonDisabled : {}) }}
            onClick={() => handleGenerate('all')}
            disabled={isGenerating || hasAnyError}
            title={hasAnyError ? 'Fix all validation errors first' : 'Generate all DV objects'}
          >Generate All</button>
        </div>
      </div>

      {/* LAMBDA VAULT MODAL */}
      {showLambdaVaultModal && (
        <div style={styles.overlay}>
          <div style={{
            backgroundColor: colors.bg,
            border: `1px solid ${colors.border}`,
            borderRadius: '6px',
            padding: '24px',
            width: '600px',
            maxHeight: '80vh',
            overflowY: 'auto',
          }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>🔄 Lambda Vault Configuration</h2>
            <p style={{ color: colors.textMuted, fontSize: '12px', marginBottom: '16px' }}>
              Lambda Vault enables near-real-time queries by creating virtual views that UNION 
              persisted data (base staging) with real-time delta data.
            </p>
            
            {/* Delta Staging Selection */}
            <div style={styles.propertyGroup}>
              <div style={styles.propertyGroupTitle}>Delta Staging Model</div>
              <select
                value={deltaStagingModel}
                onChange={(e) => {
                  setDeltaStagingModel(e.target.value);
                  // Clear column mappings when model changes - auto-match is done by exact name only
                  setColumnMappings([]);
                }}
                style={{ ...styles.select, width: '100%' }}
              >
                <option value="">-- Select Delta Staging Model --</option>
                {availableStagingModels.map(model => (
                  <option key={model.name} value={model.name}>{model.name}</option>
                ))}
              </select>
              {availableStagingModels.length === 0 && (
                <p style={{ color: colors.warning, fontSize: '11px', marginTop: '8px' }}>
                  ⚠️ No other staging models found in this concept. Create a delta staging model first.
                </p>
              )}
            </div>
            
            {/* Column Mappings - Simple list of all base columns */}
            {deltaStagingModel && (() => {
              const selectedModel = availableStagingModels.find(m => m.name === deltaStagingModel);
              if (!selectedModel) return null;
              
              // Get columns from YAML
              const baseColumns = baseStagingColumns;
              const deltaColumns = selectedModel.columns;
              const deltaColsLower = deltaColumns.map(c => c.toLowerCase());
              
              return (
                <div style={styles.propertyGroup}>
                  <div style={styles.propertyGroupTitle}>
                    Column Mappings
                    <span style={{ fontWeight: 'normal', marginLeft: '8px', fontSize: '10px', color: colors.textMuted }}>
                      ({baseColumns.length} base columns)
                    </span>
                  </div>
                  
                  {/* Header */}
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '1fr 24px 1fr 60px', 
                    gap: '8px',
                    marginBottom: '8px',
                    fontSize: '10px',
                    color: colors.textMuted,
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    padding: '0 8px'
                  }}>
                    <span>Base Column</span>
                    <span></span>
                    <span>Delta Column</span>
                    <span>Status</span>
                  </div>
                  
                  {/* Column list */}
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {baseColumns.map((baseCol) => {
                      const baseLower = baseCol.toLowerCase();
                      const exactMatch = deltaColsLower.includes(baseLower);
                      const manualMapping = columnMappings.find(m => m.baseColumn.toLowerCase() === baseLower);
                      const mappedDeltaCol = manualMapping?.deltaColumn || (exactMatch ? baseCol : '');
                      
                      return (
                        <div key={baseCol} style={{ 
                          display: 'grid', 
                          gridTemplateColumns: '1fr 24px 1fr 60px', 
                          gap: '8px', 
                          alignItems: 'center',
                          marginBottom: '4px',
                          padding: '6px 8px',
                          backgroundColor: colors.bgSecondary,
                          borderRadius: '4px',
                          borderLeft: exactMatch || manualMapping ? `3px solid ${colors.success}` : `3px solid ${colors.warning}`
                        }}>
                          <span style={{ fontSize: '11px' }}>{baseCol}</span>
                          <span style={{ color: colors.textMuted, textAlign: 'center' }}>←</span>
                          
                          {/* Delta column - dropdown for manual mapping */}
                          <select
                            value={mappedDeltaCol}
                            onChange={(e) => {
                              const newValue = e.target.value;
                              // Remove existing mapping for this base column
                              const filtered = columnMappings.filter(m => m.baseColumn.toLowerCase() !== baseLower);
                              if (newValue && newValue.toLowerCase() !== baseLower) {
                                // Add new manual mapping (only if different from base)
                                setColumnMappings([...filtered, { baseColumn: baseCol, deltaColumn: newValue }]);
                              } else {
                                // Clear manual mapping (exact match or NULL)
                                setColumnMappings(filtered);
                              }
                            }}
                            style={{ 
                              ...styles.select, 
                              fontSize: '11px',
                              padding: '4px 6px'
                            }}
                          >
                            <option value="">-- NULL --</option>
                            {deltaColumns.map(dc => (
                              <option key={dc} value={dc}>{dc}</option>
                            ))}
                          </select>
                          
                          <span style={{ 
                            fontSize: '10px', 
                            color: exactMatch || manualMapping ? colors.success : colors.warning
                          }}>
                            {exactMatch ? '✓ auto' : (manualMapping ? '✓ manual' : '⚠ NULL')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Summary */}
                  <div style={{ marginTop: '12px', fontSize: '11px', color: colors.textMuted }}>
                    ✓ {baseColumns.filter(b => deltaColsLower.includes(b.toLowerCase()) || columnMappings.some(m => m.baseColumn.toLowerCase() === b.toLowerCase())).length} mapped | 
                    ⚠ {baseColumns.filter(b => !deltaColsLower.includes(b.toLowerCase()) && !columnMappings.some(m => m.baseColumn.toLowerCase() === b.toLowerCase())).length} will be NULL in delta
                  </div>
                </div>
              );
            })()}
            
            {/* Preview */}
            {deltaStagingModel && (
              <div style={styles.propertyGroup}>
                <div style={styles.propertyGroupTitle}>Preview</div>
                <div style={{ 
                  padding: '12px', 
                  backgroundColor: colors.bgSecondary, 
                  borderRadius: '4px',
                  fontFamily: 'var(--vscode-editor-font-family)',
                  fontSize: '11px',
                  lineHeight: 1.5,
                }}>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Generated Virtual Views:</strong>
                  </div>
                  <code style={{ color: '#9cdcfe' }}>v_hub_{entityName}.sql</code>
                  <br />
                  <code style={{ color: '#9cdcfe' }}>v_sat_{entityName}.sql</code>
                  <div style={{ marginTop: '12px', color: colors.textMuted }}>
                    These views will UNION data from:
                  </div>
                  <div>• <code>{initData?.concept}_{entityName}</code> (base - persisted)</div>
                  <div>• <code>{deltaStagingModel}</code> (delta - real-time)</div>
                </div>
              </div>
            )}
            
            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' }}>
              <button
                onClick={() => {
                  setShowLambdaVaultModal(false);
                  if (!deltaStagingModel) {
                    setLambdaVaultEnabled(false);
                  }
                }}
                style={styles.buttonSecondary}
              >
                Cancel
              </button>
              <button
                onClick={() => setShowLambdaVaultModal(false)}
                style={styles.buttonPrimary}
                disabled={!deltaStagingModel}
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LOADING OVERLAY */}
      {isGenerating && (
        <div style={styles.overlay}>
          <div style={styles.overlayContent}>
            <span style={{ fontSize: '24px' }}>⏳</span>
            <span>Generating Data Vault objects...</span>
          </div>
        </div>
      )}
    </div>
  );
};
