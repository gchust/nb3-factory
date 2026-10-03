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
    // Workflow run modules are materialized as real files and loaded with a
    // bare `import`, so they must live under the compiled application root
    // (`dist/`) where the deployment's `node_modules` is reachable. The
    // storage disk is deliberately outside `dist/`, which makes a module there
    // fail with `Cannot find package '@nocobase/db'`. This disk is separate
    // from `local` so a deployment may relocate `local` without breaking
    // workflow resolution.
    workflowArtifacts: {
      driver: 'fs',
      location: paths.root('storage/workflows'),
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
