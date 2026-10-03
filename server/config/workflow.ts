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
        // Resolve run modules from a disk inside the compiled application root
        // so their bare imports find the deployment's node_modules; the
        // private `local` storage disk sits outside that root.
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
