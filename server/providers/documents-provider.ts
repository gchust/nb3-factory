import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { Application } from '@nocobase/app-server/application';
import { sampleDataToken } from '@nocobase/app-server/sample-data';
import { databaseManagerToken } from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';

import { createDocumentsReadable } from './document-access.js';
import { documents } from './document-resources.js';
import { DocumentService } from './documents.js';
import { buildDocumentsSampleData } from './documents-sample-data.js';

const NAMESPACE = 'nb3-factory';

export const documentServiceToken = createServiceToken<DocumentService>(
  'nb3-factory/document-service',
);

/**
 * Registers the document service, its permission model and its workspace
 * section. The collection registrations make the tables available to the
 * authorization model; the composite declares what a person can do, and the
 * seed assigns the reader and maintainer jobs.
 */
export class DocumentsProvider extends ServiceProvider<Application> {
  public readonly name: string = 'nb3-factory/documents';

  public override register(): void {
    this.app.container.singleton(
      documentServiceToken,
      () =>
        new DocumentService(
          this.app.container.resolve(databaseManagerToken),
          this.app.container.resolve(userAdministrationServiceToken),
        ),
    );
  }

  public override async boot(): Promise<void> {
    if (!this.app.container.has(authorizationToken)) return;
    const authz = this.app.container.resolve(authorizationToken);
    const database = this.app.container.resolve(databaseManagerToken);

    authz.database.collections.add({
      name: 'documents',
      title: { key: 'documents.permissions.documents', ns: NAMESPACE },
    });
    authz.database.collections.add({
      name: 'documentShares',
      title: { key: 'documents.permissions.shares', ns: NAMESPACE },
    });
    authz.recordAccess.define(createDocumentsReadable(database));
    const reference = authz.compositeResources.define(documents);
    authz.ui.sections.add({
      name: 'documents',
      title: { key: 'navigation.documents', ns: NAMESPACE },
      parent: 'business',
    });
    authz.ui.place(reference, { section: 'documents' });

    this.app.container.resolve(sampleDataToken).register({
      name: 'nb3-factory/documents-demo',
      packageName: 'nb3-factory',
      run: () =>
        buildDocumentsSampleData(
          authz,
          database,
          this.app.container.resolve(userAdministrationServiceToken),
        ),
    });
  }
}
