import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import { ContractsService, contractsServiceToken } from './contracts.js';

const ATTACHMENTS_ACCESS_PATH = '/uploads/contract-attachments';

/**
 * Wires the contract archive service: the default database connection, the
 * drive manager (for physical cleanup on replacement), and the File plugin
 * repository that stores attachment metadata in `contract_files`.
 */
export default class ContractsProvider extends ServiceProvider<Application> {
  public readonly name = 'app/contracts';

  public override boot(): Promise<void> {
    if (this.app.container.has(contractsServiceToken)) return Promise.resolve();
    const database = this.app.container.resolve(databaseManagerToken);
    const drive = this.app.container.resolve(driveManagerToken);
    const manager = this.app.container.resolve(
      serverFileRepositoryManagerToken,
    );
    const files = manager.repository('contract_files', {
      disk: 'local',
      accessPath: ATTACHMENTS_ACCESS_PATH,
    });
    const base = (this.app.publicBasePath ?? '').replace(/\/+$/, '');
    this.app.container.instance(
      contractsServiceToken,
      new ContractsService({
        query: database.query(),
        transaction: (fn) => database.transaction(fn),
        files,
        drive,
        urlFor: (record) =>
          `${base}/api/contracts/attachments/${record.id}/content`,
      }),
    );
    return Promise.resolve();
  }
}
