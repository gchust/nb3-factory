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
    // Workflow run modules are loaded from a materialized Artifact directory by
    // a plain Node `import()`. Their bare imports (`@nocobase/db`, the token
    // owners) resolve relative to that directory, so it has to live inside the
    // compiled server tree where the deployment's `node_modules` is reachable.
    // The default `local` disk points at storage, which may be relocated
    // outside the application, and a run module there cannot resolve them. The
    // location matches the built Artifact root, so a build needs no extra copy.
    workflowArtifacts: {
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
