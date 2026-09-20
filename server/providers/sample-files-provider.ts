import type { AppDriveConfig } from '@nocobase/drive';
import { driveManagerToken } from '@nocobase/app-server/drive';
import type { Application } from '@nocobase/app-server/application';
import { loggingToken } from '@nocobase/app-server/logging';
import { ServiceProvider } from '@nocobase/service-provider';

import { REPAIR_SAMPLE_FILES } from '../samples/repair-sample-files.js';
import { decodeRepairSampleFile } from '../samples/types.js';

/**
 * Materialize the sample-file bytes into whichever disk the running configuration points at.
 *
 * The records and their business links are created by a seed; the bytes cannot be, because a deployment may relocate
 * the disk (the factory verification keeps its storage outside the application). This provider closes that gap: it
 * runs at boot, writes only missing objects, and is therefore idempotent and safe on every start.
 */
export class RepairSampleFilesProvider extends ServiceProvider<Application> {
  readonly name = 'property-repair/sample-files';

  override async boot(): Promise<void> {
    const config = this.app.config.get<AppDriveConfig | undefined>('drive');
    if (!config?.disks?.[config.default]) return;
    const logger = this.app.container
      .resolve(loggingToken)
      .getLogger('property-repair');
    const disk = this.app.container
      .resolve(driveManagerToken)
      .use(config.default);
    for (const file of REPAIR_SAMPLE_FILES) {
      try {
        if (await disk.exists(file.key)) continue;
        await disk.put(file.key, decodeRepairSampleFile(file));
      } catch (error) {
        logger.warn(
          `Unable to materialize sample file ${file.filename}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
