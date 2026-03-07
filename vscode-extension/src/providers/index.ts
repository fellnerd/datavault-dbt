/**
 * Tree Data Providers - Module Index
 * 
 * Re-exports all tree data providers for the Data Vault extension.
 */

// Re-export base class
export { DataVaultTreeProvider } from './base';

// Re-export layer providers
export {
  StagingTreeProvider,
  RawVaultTreeProvider,
  BusinessVaultTreeProvider,
  MartTreeProvider
} from './layers';

// Re-export load provider
export { LoadTreeProvider } from './load';

// Re-export TreeItemData type for backwards compatibility
export { TreeItemData } from '../types';
