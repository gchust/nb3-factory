import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

import {
  materialsResource,
  type DocumentRecord,
} from '../documents-resources.js';

/**
 * Who is asking. Only the identity is read here; the record range comes from
 * the authorization decision, never from a request argument.
 */
export interface DocumentActor {
  readonly id: string | number;
}

/** Reads exactly the documents the actor is authorized to view. */
export interface DocumentsReader {
  list(actor: DocumentActor): Promise<DocumentRecord[]>;
}

export const documentsServiceToken: ServiceToken<DocumentsReader> =
  createServiceToken<DocumentsReader>('nb3-factory/documents-reader');

function toDocument(row: Partial<DocumentRecord>): DocumentRecord | undefined {
  const { id, title, content } = row;
  if (
    typeof id !== 'string' ||
    typeof title !== 'string' ||
    typeof content !== 'string'
  ) {
    return undefined;
  }
  return { id, title, content };
}

function createDocumentsReader(
  database: DatabaseManager,
  authz: AppAuthorization,
): DocumentsReader {
  return {
    async list(actor) {
      const principal = { type: 'user', id: String(actor.id) };
      const subjects = [
        { type: 'authenticated', id: '*' },
        ...(await authz.subjects.resolveFor(principal)),
      ];
      const decision = await authz.for({ principal, subjects }).authorize({
        resource: { type: 'composite', id: materialsResource.reference().name },
        action: 'view',
      });
      const policy = decision.conditions?.database?.documents;
      if (decision.effect === 'deny' || !policy) {
        return [];
      }
      const repository = database
        .repository<DocumentRecord>('documents')
        .withPolicy(policy);
      const rows = await repository.findMany();
      return rows
        .map(toDocument)
        .filter((row): row is DocumentRecord => row !== undefined);
    },
  };
}

/**
 * Registers the documents collection and its composite so the generated
 * Repository routes can bind to it, and binds the actor-scoped reader the AI
 * tool declares.
 */
export default class DocumentsProvider extends ServiceProvider<Application> {
  public readonly name = 'nb3-factory/documents';

  public override register(): void {
    this.app.container.singleton(documentsServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      const authz = this.app.container.resolve(authorizationToken);
      return createDocumentsReader(database, authz);
    });
  }

  public override async boot(): Promise<void> {
    // The authorization plugin is optional in a host that composes this
    // application without it (for example a test runtime). Skip registering
    // the documents collection and composite when the service is absent;
    // `register` already resolves it lazily for the real reader.
    if (!this.app.container.has(authorizationToken)) {
      return;
    }
    const authz = this.app.container.resolve(authorizationToken);
    authz.database.collections.add({ name: 'documents', title: 'Documents' });
    authz.compositeResources.define(materialsResource);
  }
}
