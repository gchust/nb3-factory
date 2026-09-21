import type { AppConfigAccessor } from '@nocobase/app-server/config';

/**
 * The environment variable through which the seed command tells application
 * seeds where the configured `local` disk stores its bytes. Named once so the
 * command and the tests agree on it.
 */
export const SEED_DISK_ENV = 'CD_LOCAL_DISK_DIR';

/**
 * Publish the location of the configured `local` disk for seeds to use.
 *
 * A seed only receives a database context, so it cannot resolve the merged
 * application configuration. It therefore cannot know that a deployment or
 * factory verification replaced `drive.disks.local.location` with a directory
 * outside the application — and writing to a guessed `<cwd>/storage` would
 * store bytes the running server never reads. The seed command has just
 * resolved the effective configuration, so it publishes the location here.
 *
 * Only a filesystem disk has a location to publish; an object-storage disk has
 * none, and the seeds that use this fall back to their default layout.
 */
export function publishLocalDiskLocation(config: AppConfigAccessor): void {
  const drive = config.get<{
    disks?: Record<string, { driver?: string; location?: string }>;
  }>('drive');
  const local = drive?.disks?.local;
  if (local?.driver === 'fs' && typeof local.location === 'string') {
    process.env[SEED_DISK_ENV] = local.location;
  }
}
