import { ServiceProvider } from '@nocobase/service-provider';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { loggingToken } from '@nocobase/app-server/logging';
import { knowledgeBaseManifestServiceToken } from '@nocobase/app-plugin-ai-knowledge-base/server';
import { resolveAIKnowledgeBaseStorageDisks } from '@nocobase/app-plugin-ai-employee/server/config';
import type { AppDriveConfig } from '@nocobase/drive';
import type { AIApplicationConfig } from '@nocobase/app-plugin-ai-employee/server/config';

import {
  ManualKnowledgeBaseProvisioner,
  type KnowledgeBaseProvisionLogger,
} from '../services/knowledge-base-provision.js';
import type { ServiceApplicationConfig } from '../config/service.js';

/**
 * Registers the internal device-manual knowledge base and ingests the built-in
 * manuals through the AI Knowledge Base plugin's public Manifest contract.
 *
 * It runs after the AI resources provider, so the plugin's providers have
 * already booted and bound the tokens resolved here. When the AI Knowledge
 * Base plugin is not registered, the provider does nothing.
 */
export class ManualKnowledgeBaseProvider extends ServiceProvider<Application> {
  readonly name = 'service-device-manual-knowledge-base';

  async boot(): Promise<void> {
    const container = this.app.container;
    if (!container.has(knowledgeBaseManifestServiceToken)) {
      // The AI Knowledge Base plugin is not registered; nothing to provision.
      return;
    }
    const config = this.app.config.get<ServiceApplicationConfig>('service');
    const aiConfig = this.app.config.get<AIApplicationConfig>('ai');
    const driveConfig = this.app.config.get<AppDriveConfig>('drive');
    if (!aiConfig || !driveConfig) {
      return;
    }
    const disks = resolveAIKnowledgeBaseStorageDisks(
      aiConfig,
      driveConfig.default,
    );
    const disk = disks[0];
    if (!disk) {
      return;
    }

    const logger = container
      .resolve(loggingToken)
      .getLogger()
      .child({ module: 'device-manual-knowledge-base' });
    const warningLogger: KnowledgeBaseProvisionLogger = {
      warn: (details, message) => logger.warn(details, message),
      info: (details, message) => logger.info(details, message),
    };

    const provisioner = new ManualKnowledgeBaseProvisioner({
      db: container.resolve(databaseManagerToken),
      drive: container.resolve(driveManagerToken),
      manifests: container.resolve(knowledgeBaseManifestServiceToken),
      disk,
      logger: warningLogger,
      enabled: config?.enableSampleData !== false,
    });

    try {
      await provisioner.ensure();
    } catch (error: unknown) {
      // A missing table, drive or plugin migration must not stop the
      // application from serving; the real status is visible in the workspace.
      warningLogger.warn(
        { error, disk },
        'Device-manual knowledge base provisioning failed',
      );
    }
  }
}
