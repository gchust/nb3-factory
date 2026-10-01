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
        // Materialized workflow modules are imported by the server at run time
        // and use bare package imports, so their disk must stay inside the
        // bundle root rather than the relocatable storage directory; see the
        // matching `workflows` disk in `drive.ts`.
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
