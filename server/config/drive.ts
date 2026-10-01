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
    // Workflow artifacts are materialized as JavaScript and imported by the
    // running server, so they must live inside the code root: a deployment may
    // relocate `storage` outside the bundle, where Node cannot resolve the
    // bare package imports (`@nocobase/db`) the artifact modules use, because
    // no `node_modules` is reachable from there. `paths.root()` is the bundle
    // root (`dist` in production), whose `node_modules` the server does.
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
