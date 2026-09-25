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
        // The `workflowArtifacts` disk lives in the compiled server tree so the
        // materialized run modules resolve their package imports. `local`
        // (storage) can be relocated outside the application; see drive.ts.
        artifactDisk: 'workflowArtifacts',
        production: env.NODE_ENV === 'production',
      },
      {
        rootDir: paths.root(),
        serverDir: paths.server(),
      },
    ),
);

export default workflow;
