import { ServiceProvider } from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';
import { loggingToken } from '@nocobase/app-server/logging';

import { createServiceLogger } from '../service/logger.js';
import { serviceProvisioningServiceToken } from '../service/tokens.js';

/**
 * Runs the demonstration-data provisioning once the database has migrated and
 * seeded. It is idempotent, so a restart reuses existing accounts and leaves
 * bound records alone; when `service.demoData` is off it does nothing.
 */
export class ServiceProvisioningProvider extends ServiceProvider<Application> {
  name = 'service/provisioning';

  async boot(): Promise<void> {
    const container = this.app.container;
    if (!container.has(serviceProvisioningServiceToken)) {
      return;
    }
    const service = container.resolve(serviceProvisioningServiceToken);
    const result = await service.run();
    if (result.createdUsers.length > 0 || result.boundProfiles > 0) {
      const logger = createServiceLogger(
        container.resolve(loggingToken),
        'service.provisioning',
      );
      logger.info('Service demonstration data provisioned', {
        createdUsers: result.createdUsers.length,
        boundProfiles: result.boundProfiles,
        workflowReady: result.workflowReady,
      });
    }
  }
}
