import { useState, useCallback } from 'react';
import type { DesignerColumnDefinition, DesignerColumnType } from '../../../../types';

/**
 * Hook for managing Entity Designer state
 */
export function useEntityDesign() {
  const [columns, setColumns] = useState<DesignerColumnDefinition[]>([]);
  const [entityName, setEntityName] = useState('');
  const [concept, setConcept] = useState('');
  const [sourceTable, setSourceTable] = useState('');
  const [existingHubs, setExistingHubs] = useState<string[]>([]);

  /**
   * Update a column's type
   */
  const updateColumnType = useCallback((columnName: string, newType: DesignerColumnType) => {
    setColumns(prev => prev.map(col => {
      if (col.name !== columnName) {return col;}
      
      return {
        ...col,
        columnType: newType,
        // Reset hash diff when changing to non-attribute
        includeInHashDiff: newType === 'attribute' ? true : false,
        // Clear FK target when not foreign key
        foreignKeyTarget: newType === 'foreign_key' ? col.foreignKeyTarget : undefined
      };
    }));
  }, []);

  /**
   * Update a column's hash diff inclusion
   */
  const updateHashDiff = useCallback((columnName: string, include: boolean) => {
    setColumns(prev => prev.map(col => {
      if (col.name !== columnName) {return col;}
      return { ...col, includeInHashDiff: include };
    }));
  }, []);

  /**
   * Update a column's foreign key target
   */
  const updateFKTarget = useCallback((columnName: string, targetHub: string) => {
    setColumns(prev => prev.map(col => {
      if (col.name !== columnName) {return col;}
      return { ...col, foreignKeyTarget: targetHub };
    }));
  }, []);

  /**
   * Get all business key columns
   */
  const getBusinessKeys = useCallback(() => {
    return columns.filter(col => col.columnType === 'business_key');
  }, [columns]);

  /**
   * Get all attribute columns
   */
  const getAttributes = useCallback(() => {
    return columns.filter(col => col.columnType === 'attribute');
  }, [columns]);

  /**
   * Get all foreign key columns
   */
  const getForeignKeys = useCallback(() => {
    return columns.filter(col => col.columnType === 'foreign_key');
  }, [columns]);

  /**
   * Get columns for hash diff
   */
  const getHashDiffColumns = useCallback(() => {
    return columns.filter(col => col.columnType === 'attribute' && col.includeInHashDiff);
  }, [columns]);

  /**
   * Get metadata columns
   */
  const getMetadataColumns = useCallback(() => {
    return columns.filter(col => col.columnType === 'metadata');
  }, [columns]);

  return {
    // State
    columns,
    setColumns,
    entityName,
    setEntityName,
    concept,
    setConcept,
    sourceTable,
    setSourceTable,
    existingHubs,
    setExistingHubs,
    
    // Updaters
    updateColumnType,
    updateHashDiff,
    updateFKTarget,
    
    // Getters
    getBusinessKeys,
    getAttributes,
    getForeignKeys,
    getHashDiffColumns,
    getMetadataColumns
  };
}
