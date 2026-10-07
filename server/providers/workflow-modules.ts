/**
 * Makes the application's runtime packages resolvable from workflow Artifacts.
 *
 * A workflow Run node loads its handler from the Artifact store, whose root is
 * the private drive disk (`drive.disks[workflow.artifactDisk].location`). In a
 * deployment that disk lives outside the directory tree the server is installed
 * in, so Node's module resolution from an Artifact file cannot walk up to the
 * `node_modules` the running server itself uses. A handler that imports an
 * application package (`@nocobase/db`, `@nocobase/app-plugin-notification`) then
 * fails with `Cannot find package`, taking the whole run with it.
 *
 * The fix is to give the Artifact store the same view of the runtime packages
 * the server has: a `node_modules` symlink at the store root pointing at the
 * `node_modules` this process resolves from. Resolving `@nocobase/db` here is
 * deliberate - it is the same specifier the handlers import, so the symlink
 * target is by construction the copy that shares the container's service tokens.
 * In an installed `dist/` that is `dist/node_modules`; in development it is the
 * application root's `node_modules`.
 *
 * The link is only ever created, never deleted, and an existing real directory
 * named `node_modules` is left untouched so a deployment that already provides
 * one keeps it.
 */

import { lstat, mkdir, readlink, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Application } from '@nocobase/app-server/application';
import { ServiceProvider } from '@nocobase/service-provider';

interface DriveDiskConfig {
  driver?: string;
  location?: string;
}

interface DriveConfig {
  default?: string;
  disks?: Record<string, DriveDiskConfig>;
}

interface WorkflowConfig {
  artifactDisk?: string;
}

/** The `node_modules` this process resolves its own dependencies from. */
function runtimeNodeModules(): string | undefined {
  // `import.meta.resolve` rather than `createRequire().resolve`: the runtime
  // packages are ESM-only, so CommonJS resolution rejects them.
  for (const specifier of ['@nocobase/db', '@nocobase/app-server']) {
    let entry: string;
    try {
      entry = fileURLToPath(import.meta.resolve(specifier));
    } catch {
      continue;
    }
    const segments = entry.split(path.sep);
    const index = segments.indexOf('node_modules');
    if (index >= 0) {
      return segments.slice(0, index + 1).join(path.sep);
    }
  }
  return undefined;
}

export class WorkflowModuleProvider extends ServiceProvider<Application> {
  readonly name = 'app/workflow-modules';

  async boot(): Promise<void> {
    const drive = this.app.config.get<DriveConfig>('drive');
    const workflow = this.app.config.get<WorkflowConfig>('workflow');
    const diskName = workflow?.artifactDisk ?? drive?.default;
    const disk = diskName ? drive?.disks?.[diskName] : undefined;
    if (!disk || disk.driver !== 'fs' || !disk.location) return;

    const target = runtimeNodeModules();
    if (!target) return;

    const link = path.join(disk.location, 'node_modules');
    try {
      const existing = await lstat(link);
      if (!existing.isSymbolicLink()) return;
      if ((await readlink(link)) === target) return;
      // A stale link (the runtime moved between restarts) is repointed.
      await rm(link, { force: true });
    } catch {
      // Missing link: create it below.
    }
    await mkdir(disk.location, { recursive: true });
    await symlink(target, link, 'dir');
  }
}
