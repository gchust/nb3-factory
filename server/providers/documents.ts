import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  APP_NAMESPACE,
  DOCUMENTS_COLLECTION,
  DOCUMENTS_SHARING_SETTINGS,
} from '../documents/constants.js';
import {
  documents,
  label,
  nonConfidentialDocuments,
  publicDocuments,
} from '../documents/resources.js';
import { documentsServiceToken } from '../documents/tokens.js';
import { DocumentsService } from '../services/documents-service.js';

/** Registers the document library's authorization model and its domain service. */
export class DocumentsProvider extends ServiceProvider<Application> {
  readonly name = `${APP_NAMESPACE}/documents`;
  private booted = false;

  register(): void {
    this.app.container.singleton(documentsServiceToken, (resolver) => {
      return new DocumentsService(
        resolver.resolve(databaseManagerToken),
        resolver.resolve(authorizationToken),
      );
    });
  }

  async boot(): Promise<void> {
    if (this.booted) {
      return;
    }
    this.booted = true;

    // A minimal application (a test or a host composing its own plugins) may
    // run without the authorization plugin; then there is no model to register.
    if (!this.app.container.has(authorizationToken)) {
      return;
    }
    const authz = this.app.container.resolve(authorizationToken);
    authz.database.collections.add({
      name: DOCUMENTS_COLLECTION,
      title: label('authorization.collections.documents'),
      actions: ['read', 'create', 'update'],
    });
    authz.recordAccess.define(publicDocuments);
    authz.recordAccess.define(nonConfidentialDocuments);
    const reference = authz.compositeResources.define(documents);
    authz.settings.add({
      id: DOCUMENTS_SHARING_SETTINGS,
      title: label('authorization.settings.documentsSharing'),
      actions: [
        { name: 'read', title: label('authorization.actions.read') },
        { name: 'create', title: label('authorization.actions.share') },
        { name: 'delete', title: label('authorization.actions.revokeShare') },
      ],
    });

    authz.ui.sections.add({
      name: 'documents',
      title: label('authorization.sections.documents'),
      parent: 'business',
      order: 100,
    });
    authz.ui.place(reference, { section: 'documents' });
    authz.ui.sections.add({
      name: 'documents-administration',
      title: label('authorization.sections.documentsAdministration'),
      parent: 'administration',
      order: 100,
    });
    authz.ui.place(
      { type: 'settings', id: DOCUMENTS_SHARING_SETTINGS },
      { section: 'documents-administration' },
    );
  }
}
