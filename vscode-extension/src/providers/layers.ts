/**
 * Layer-specific Tree Data Providers
 * 
 * Concrete implementations of DataVaultTreeProvider for each Data Vault layer:
 * - StagingTreeProvider: Staging layer models
 * - RawVaultTreeProvider: Raw Vault (Hubs, Satellites, Links)
 * - BusinessVaultTreeProvider: Business Vault (PITs, Bridges)
 * - MartTreeProvider: Mart layer models
 */

import { TreeItemData } from '../types';
import { DataVaultTreeProvider } from './base';

/**
 * Staging Layer TreeDataProvider
 */
export class StagingTreeProvider extends DataVaultTreeProvider {
  /**
   * Return the layer name for group filtering
   */
  protected getLayerName(): 'sources' | 'staging' | 'raw_vault' | 'business_vault' | 'mart' {
    return 'staging';
  }

  /**
   * Don't group by type - all staging models are type "staging"
   */
  protected shouldGroupByType(): boolean {
    return false;
  }

  async getChildren(element?: TreeItemData): Promise<TreeItemData[]> {
    if (!this.metadata) {
      return [{
        id: 'no-project',
        label: 'No dbt project loaded',
        type: 'layer',
        collapsibleState: 'none',
        icon: 'warning'
      }];
    }

    if (!element) {
      // Root level - group staging models by concept
      const stagingModels = this.metadata.models.filter(m => m.layer === 'staging');
      
      if (stagingModels.length === 0) {
        return [{
          id: 'empty',
          label: 'No staging models found',
          type: 'layer',
          collapsibleState: 'none',
          icon: 'info'
        }];
      }

      return this.createConceptTree(stagingModels);
    }

    // Return children for nested elements
    return element.children || [];
  }
}

/**
 * Raw Vault Layer TreeDataProvider
 */
export class RawVaultTreeProvider extends DataVaultTreeProvider {
  /**
   * Return the layer name for group filtering
   */
  protected getLayerName(): 'sources' | 'staging' | 'raw_vault' | 'business_vault' | 'mart' {
    return 'raw_vault';
  }

  async getChildren(element?: TreeItemData): Promise<TreeItemData[]> {
    if (!this.metadata) {
      return [{
        id: 'no-project',
        label: 'No dbt project loaded',
        type: 'layer',
        collapsibleState: 'none',
        icon: 'warning'
      }];
    }

    if (!element) {
      // Root level - group by concept, then by type (hub/sat/link)
      const rawVaultModels = this.metadata.models.filter(m => m.layer === 'raw_vault');
      
      if (rawVaultModels.length === 0) {
        return [{
          id: 'empty',
          label: 'No raw vault models found',
          type: 'layer',
          collapsibleState: 'none',
          icon: 'info'
        }];
      }

      return this.createConceptTree(rawVaultModels);
    }

    // Return children for nested elements
    return element.children || [];
  }
}

/**
 * Business Vault Layer TreeDataProvider
 */
export class BusinessVaultTreeProvider extends DataVaultTreeProvider {
  /**
   * Return the layer name for group filtering
   */
  protected getLayerName(): 'sources' | 'staging' | 'raw_vault' | 'business_vault' | 'mart' {
    return 'business_vault';
  }

  async getChildren(element?: TreeItemData): Promise<TreeItemData[]> {
    if (!this.metadata) {
      return [{
        id: 'no-project',
        label: 'No dbt project loaded',
        type: 'layer',
        collapsibleState: 'none',
        icon: 'warning'
      }];
    }

    if (!element) {
      // Root level - group PITs and Bridges
      const businessVaultModels = this.metadata.models.filter(m => m.layer === 'business_vault');
      
      if (businessVaultModels.length === 0) {
        return [{
          id: 'empty',
          label: 'No business vault models found',
          type: 'layer',
          collapsibleState: 'none',
          icon: 'info'
        }];
      }

      // Group by type (PITs, Bridges, etc.)
      return this.createModelItems(businessVaultModels, true);
    }

    // Return children for nested elements
    return element.children || [];
  }
}

/**
 * Mart Layer TreeDataProvider
 */
export class MartTreeProvider extends DataVaultTreeProvider {
  /**
   * Return the layer name for group filtering
   */
  protected getLayerName(): 'sources' | 'staging' | 'raw_vault' | 'business_vault' | 'mart' {
    return 'mart';
  }

  /**
   * Don't group by type - most mart models are type "mart"
   */
  protected shouldGroupByType(): boolean {
    return false;
  }

  async getChildren(element?: TreeItemData): Promise<TreeItemData[]> {
    if (!this.metadata) {
      return [{
        id: 'no-project',
        label: 'No dbt project loaded',
        type: 'layer',
        collapsibleState: 'none',
        icon: 'warning'
      }];
    }

    if (!element) {
      // Root level - group mart models by concept (domain)
      const martModels = this.metadata.models.filter(m => m.layer === 'mart');
      
      if (martModels.length === 0) {
        return [{
          id: 'empty',
          label: 'No mart models found',
          type: 'layer',
          collapsibleState: 'none',
          icon: 'info'
        }];
      }

      return this.createConceptTree(martModels);
    }

    // Return children for nested elements
    return element.children || [];
  }
}
