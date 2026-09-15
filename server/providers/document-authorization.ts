import type { Application } from '@nocobase/app-server/application';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { ServiceProvider } from '@nocobase/service-provider';

import { DOCUMENT_COLLECTION } from '../routes/document-policy.js';

/**
 * Documents support every file the plugin stores plus the ledger columns a data clerk edits by hand.
 */
const DOCUMENT_FIELDS = [
  'id',
  'disk',
  'key',
  'filename',
  'ext',
  'mimeType',
  'size',
  'drawingNumber',
  'name',
  'discipline',
  'version',
  'status',
  'uploadedById',
  'uploadedByName',
  'uploadedAt',
  'createdAt',
  'updatedAt',
];

/**
 * Registers the document collection with Authorization so Permission Sets, Default Access and the authorization
 * settings UI can address `main.documents`. The downloadable action is modelled here too, which is how a
 * read-only visitor is refused a download the engineer role holds.
 */
export default class DocumentAuthorizationProvider extends ServiceProvider<Application> {
  public readonly name = 'app/document-authorization';

  public override boot(): Promise<void> {
    if (!this.app.container.has(authorizationToken)) return Promise.resolve();
    const authorization = this.app.container.resolve(authorizationToken);
    if (authorization.database.collections.get(DOCUMENT_COLLECTION)) {
      return Promise.resolve();
    }
    authorization.database.collections.add({
      name: DOCUMENT_COLLECTION,
      title: 'Documents',
      actions: ['read', 'create', 'update', 'delete', 'download'],
      fields: DOCUMENT_FIELDS,
      attributes: {
        identifier: 'id',
        creator: 'uploadedById',
      },
    });
    return Promise.resolve();
  }
}
