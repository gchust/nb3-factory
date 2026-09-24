import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { WorkflowRuntimeConfig } from '@nocobase/app-plugin-workflow/server';
import { resolveWorkflowRuntimeConfig } from '@nocobase/app-plugin-workflow/server';

const workflow: AppConfigFactory<WorkflowRuntimeConfig> = defineAppConfig(
  ({ paths, env }) =>
    resolveWorkflowRuntimeConfig(
      {
        sourceRoot: paths.server('workflows'),
        distRoot: paths.server('workflows'),
        // See the `workflows` disk in `server/config/drive.ts`: run modules
        // must be materialized somewhere Node can still resolve their imports.
        artifactDisk: 'workflows',
        production: env.NODE_ENV === 'production',
      },
      {
        rootDir: paths.root(),
        serverDir: paths.server(),
      },
    ),
);

export default workflow;
