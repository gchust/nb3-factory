import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import AppExampleProvider from './app-example.js';
import AssetProvider from './asset-service.js';

export {
  appExampleServiceToken,
  type AppExampleService,
} from './app-example.js';

export {
  assetServiceToken,
  AssetDomainError,
  DatabaseAssetService,
  applyDatabaseFilter,
  type Asset,
  type AssetListFilters,
  type AssetRecord,
  type AssetService,
  type AssetStatus,
  type AssetType,
  type CreateAssetInput,
  type Employee,
  type RecordListFilters,
  type RecordStatus,
  type UpdateAssetInput,
} from './asset-service.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  AppExampleProvider,
  AssetProvider,
];

export default serviceProviders;
