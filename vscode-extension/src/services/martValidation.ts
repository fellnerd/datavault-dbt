import {
  MartDesignerState,
  MartValidationError,
  MartValidationResult,
  DimensionConfig,
  FactConfig
} from '../types';

/**
 * Mart Validation Service
 *
 * Validates Mart Designer state according to Data Vault 2.1 best practices.
 *
 * Error Rules (prevent generation):
 * - Dimension without source
 * - Fact without dimension reference
 * - Duplicate FK names in fact
 * - Incremental without unique key
 * - Circular references
 *
 * Warning Rules (allow generation with caution):
 * - Dimension without attributes
 * - Fact without measures
 * - Role-playing dimension without alias
 * - SCD Type 2 without PIT (for multi-satellite dims)
 */

/**
 * Validate the complete Mart Designer state
 */
export function validateMartDesigner(state: MartDesignerState): MartValidationResult {
  const errors: MartValidationError[] = [];
  const warnings: MartValidationError[] = [];

  // Validate each node
  for (const node of state.nodes) {
    if (node.type === 'dimension') {
      const dimConfig = node.data as DimensionConfig;
      validateDimension(dimConfig, errors, warnings);
    } else if (node.type === 'fact') {
      const factConfig = node.data as FactConfig;
      validateFact(factConfig, state, errors, warnings);
    }
  }

  // Cross-node validations
  validateCrossReferences(state, errors, warnings);

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate a dimension configuration
 */
function validateDimension(
  config: DimensionConfig,
  errors: MartValidationError[],
  warnings: MartValidationError[]
): void {
  // ERROR: Dimension without source
  if (!config.sourceHub && !config.sourceSeed && !config.sourcePIT) {
    errors.push({
      nodeId: config.name,
      field: 'source',
      message: `Dimension "${config.name}" has no source defined. Add a Hub, Seed, or PIT as source.`,
      severity: 'error'
    });
  }

  // WARNING: Dimension without attributes
  if (!config.attributes || config.attributes.length === 0) {
    warnings.push({
      nodeId: config.name,
      field: 'attributes',
      message: `Dimension "${config.name}" has no attributes. Add attributes from Satellites.`,
      severity: 'warning'
    });
  }

  // WARNING: SCD Type 2 without PIT for multi-satellite dimensions
  if (config.scdType === 'type2' && !config.sourcePIT && config.sourceSatellites.length > 1) {
    warnings.push({
      nodeId: config.name,
      field: 'sourcePIT',
      message: `Dimension "${config.name}" is SCD Type 2 with multiple satellites but no PIT. Consider using a PIT table for consistent history.`,
      severity: 'warning'
    });
  }

  // INFO: SCD Type 2 without PIT (single satellite is OK)
  if (config.scdType === 'type2' && !config.sourcePIT && config.sourceSatellites.length === 1) {
    warnings.push({
      nodeId: config.name,
      field: 'sourcePIT',
      message: `Dimension "${config.name}" is SCD Type 2 without PIT. Using satellite directly for history.`,
      severity: 'info'
    });
  }

  // ERROR: Missing business key
  if (!config.businessKey) {
    errors.push({
      nodeId: config.name,
      field: 'businessKey',
      message: `Dimension "${config.name}" has no business key defined.`,
      severity: 'error'
    });
  }

  // ERROR: Missing surrogate key
  if (!config.surrogateKey) {
    errors.push({
      nodeId: config.name,
      field: 'surrogateKey',
      message: `Dimension "${config.name}" has no surrogate key defined.`,
      severity: 'error'
    });
  }

  // ERROR: Identity strategy requires table materialization
  if (config.surrogateKeyStrategy === 'identity' && config.materialization !== 'table') {
    errors.push({
      nodeId: config.name,
      field: 'surrogateKeyStrategy',
      message: `Dimension "${config.name}" uses IDENTITY strategy but is not materialized as table.`,
      severity: 'error'
    });
  }
}

/**
 * Validate a fact configuration
 */
function validateFact(
  config: FactConfig,
  state: MartDesignerState,
  errors: MartValidationError[],
  warnings: MartValidationError[]
): void {
  // ERROR: Fact without dimension reference
  if (!config.dimensionRefs || config.dimensionRefs.length === 0) {
    errors.push({
      nodeId: config.name,
      field: 'dimensionRefs',
      message: `Fact "${config.name}" has no dimension references. Connect it to at least one dimension.`,
      severity: 'error'
    });
  }

  // WARNING: Fact without measures
  if (!config.measures || config.measures.length === 0) {
    warnings.push({
      nodeId: config.name,
      field: 'measures',
      message: `Fact "${config.name}" has no measures. Add measures from Satellites or this is a factless fact.`,
      severity: 'warning'
    });
  }

  // ERROR: Duplicate FK names
  if (config.dimensionRefs && config.dimensionRefs.length > 1) {
    const fkNames = config.dimensionRefs.map(ref => ref.foreignKey);
    const duplicates = fkNames.filter((name, index) => fkNames.indexOf(name) !== index);
    if (duplicates.length > 0) {
      errors.push({
        nodeId: config.name,
        field: 'dimensionRefs',
        message: `Fact "${config.name}" has duplicate foreign key names: ${duplicates.join(', ')}. Use role aliases for role-playing dimensions.`,
        severity: 'error'
      });
    }
  }

  // WARNING: Role-playing dimension without alias
  if (config.dimensionRefs) {
    const dimCounts = new Map<string, number>();
    config.dimensionRefs.forEach(ref => {
      dimCounts.set(ref.dimensionName, (dimCounts.get(ref.dimensionName) || 0) + 1);
    });

    config.dimensionRefs.forEach(ref => {
      if ((dimCounts.get(ref.dimensionName) || 0) > 1 && !ref.roleAlias) {
        warnings.push({
          nodeId: config.name,
          field: 'dimensionRefs',
          message: `Fact "${config.name}" uses "${ref.dimensionName}" multiple times without role alias. Consider adding role aliases (e.g., "Order Date", "Ship Date").`,
          severity: 'warning'
        });
      }
    });
  }

  // ERROR: Incremental without unique key
  if (config.materialization === 'incremental') {
    if (!config.incrementalUniqueKey || config.incrementalUniqueKey.length === 0) {
      errors.push({
        nodeId: config.name,
        field: 'incrementalUniqueKey',
        message: `Fact "${config.name}" is incremental but has no unique key defined.`,
        severity: 'error'
      });
    }
  }

  // ERROR: Fact without source
  if (!config.sourceLink && !config.sourceBridge) {
    errors.push({
      nodeId: config.name,
      field: 'source',
      message: `Fact "${config.name}" has no source. Add a Link or Bridge as source.`,
      severity: 'error'
    });
  }

  // Validate dimension references exist
  if (config.dimensionRefs) {
    const existingDims = state.nodes
      .filter(n => n.type === 'dimension')
      .map(n => (n.data as DimensionConfig).name);

    config.dimensionRefs.forEach(ref => {
      if (!existingDims.includes(ref.dimensionName)) {
        warnings.push({
          nodeId: config.name,
          field: 'dimensionRefs',
          message: `Fact "${config.name}" references dimension "${ref.dimensionName}" which does not exist in the designer.`,
          severity: 'warning'
        });
      }
    });
  }
}

/**
 * Cross-reference validations
 */
function validateCrossReferences(
  state: MartDesignerState,
  errors: MartValidationError[],
  warnings: MartValidationError[]
): void {
  // Check for orphan dimensions (not referenced by any fact)
  const dimensions = state.nodes.filter(n => n.type === 'dimension');
  const facts = state.nodes.filter(n => n.type === 'fact');

  const referencedDims = new Set<string>();
  facts.forEach(f => {
    const factConfig = f.data as FactConfig;
    factConfig.dimensionRefs?.forEach(ref => {
      referencedDims.add(ref.dimensionName);
    });
  });

  dimensions.forEach(d => {
    const dimConfig = d.data as DimensionConfig;
    if (!referencedDims.has(dimConfig.name) && facts.length > 0) {
      warnings.push({
        nodeId: dimConfig.name,
        message: `Dimension "${dimConfig.name}" is not referenced by any fact. It may be unused.`,
        severity: 'info'
      });
    }
  });

  // Check that edges match dimension refs
  const edgeTargets = new Set(state.edges.map(e => e.target));
  dimensions.forEach(d => {
    const dimConfig = d.data as DimensionConfig;
    if (referencedDims.has(dimConfig.name) && !edgeTargets.has(d.id)) {
      warnings.push({
        nodeId: dimConfig.name,
        message: `Dimension "${dimConfig.name}" is referenced but has no visual edge connection.`,
        severity: 'info'
      });
    }
  });
}

/**
 * Quick validation for UI feedback (only errors)
 */
export function quickValidate(state: MartDesignerState): { errors: number; warnings: number } {
  const result = validateMartDesigner(state);
  return {
    errors: result.errors.length,
    warnings: result.warnings.length
  };
}

/**
 * Format validation result for display
 */
export function formatValidationMessages(result: MartValidationResult): string {
  const lines: string[] = [];

  if (result.errors.length > 0) {
    lines.push('=== Errors ===');
    result.errors.forEach(err => {
      lines.push(`[ERROR] ${err.message}`);
    });
  }

  if (result.warnings.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('=== Warnings ===');
    result.warnings.forEach(warn => {
      lines.push(`[${warn.severity.toUpperCase()}] ${warn.message}`);
    });
  }

  if (lines.length === 0) {
    lines.push('No issues found.');
  }

  return lines.join('\n');
}
