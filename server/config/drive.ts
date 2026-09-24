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
    // Compiled workflow Artifacts are loaded as modules, and a module resolves
    // its own imports by walking up from where it sits. Keeping the Artifact
    // store inside the compiled code root is what lets a run module's
    // `@nocobase/*` imports resolve; the deployment storage root sits outside
    // the bundle, where no `node_modules` exists for Node to find. This disk is
    // code-derived state, not business data: a rebuild regenerates it from
    // `dist/server/workflows`, so it belongs with the build, not with storage.
    workflows: {
      driver: 'fs',
      location: paths.root('workflow-artifacts'),
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
