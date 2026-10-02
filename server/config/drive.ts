import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AppDriveConfig } from '@nocobase/drive';

const drive: AppConfigFactory<AppDriveConfig> = defineAppConfig(({ paths }) => {
  const disks: AppDriveConfig['disks'] = {
    local: {
      driver: 'fs',
      location: paths.storage(),
      visibility: 'private',
    },
    // Workflow Artifacts are installed beside the compiled server code rather than under `storage/`. A run module
    // is imported from its Artifact directory, so its bare imports (`@nocobase/db`, plugin tokens) must resolve to
    // the same module instances the application registered its services from. Under `storage/` they would resolve
    // to a second copy of every package and every service token would miss.
    workflow: {
      driver: 'fs',
      location: paths.server(),
      visibility: 'private',
    },
    s3: {
      driver: 's3',
      bucket: '',
      region: 'us-east-1',
      forcePathStyle: false,
      supportsACL: true,
      credentials: {},
      visibility: 'private',
    },
  };
  return {
    default: 'local',
    disks,
  };
});

export default drive;
