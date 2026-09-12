import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import { ContractsService, contractsServiceToken } from './contracts.js';

const BODY_ACCESS_PATH = '/uploads/contract-bodies';
const ATTACHMENTS_ACCESS_PATH = '/uploads/contract-attachments';

/**
 * Wires the contract archive service: the default database connection, the
 * drive manager (for physical cleanup), and two File plugin repositories that
 * share the `contract_files` collection with distinct access paths and URLs.
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
    const base = (this.app.publicBasePath ?? '').replace(/\/+$/, '');
    const files = manager.repository('contract_files', {
      disk: 'local',
      accessPath: BODY_ACCESS_PATH,
    });
    const attachments = manager.repository('contract_files', {
      disk: 'local',
      accessPath: ATTACHMENTS_ACCESS_PATH,
    });
    // Serve files through the application's inline content route, which is
    // session-protected and answers with `Content-Disposition: inline` so the
    // browser can render PDFs inside the preview dialog.
    const urlFor = (id: string) => `${base}/api/contracts:fileContent/${id}`;
    this.app.container.instance(
      contractsServiceToken,
      new ContractsService({
        query: database.query(),
        transaction: (fn) => database.transaction(fn),
        files,
        attachments,
        drive,
        urlForBody: (record) => urlFor(record.id),
        urlForAttachment: (record) => urlFor(record.id),
      }),
    );
    return Promise.resolve();
  }
}
