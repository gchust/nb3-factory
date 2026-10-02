import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import MaterialServiceProvider from './materials.js';

export {
  MATERIAL_ACCESS_PATH,
  MATERIAL_COLLECTION,
  MATERIAL_FILE_COLLECTION,
  MaterialError,
  materialServiceToken,
  parseMaterialFileToken,
  type Material,
  type MaterialErrorCode,
  type MaterialFile,
  type MaterialFileAccess,
  type MaterialService,
} from './materials.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  MaterialServiceProvider,
];

export default serviceProviders;