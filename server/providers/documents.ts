import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import {
  createDocumentService,
  type DocumentService,
} from '../documents/service.js';

/**
 * The document library's domain service. Routes resolve it by this token rather than importing the implementation, so
 * the domain logic can change without touching the HTTP layer.
 */
export const documentServiceToken: ServiceToken<DocumentService> =
  createServiceToken<DocumentService>('app/document-service');

export default class DocumentServiceProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/document-service-provider';

  public override register(): void {
    this.app.container.singleton(documentServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return createDocumentService(database);
    });
  }
}
