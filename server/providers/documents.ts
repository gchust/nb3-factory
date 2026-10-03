import {
  databaseManagerToken,
  type DatabaseManager,
  type QueryAdapter,
} from '@nocobase/db';
import type { Application } from '@nocobase/app-server/application';
import {
  createServiceToken,
  ServiceProvider,
} from '@nocobase/service-provider';

/**
 * The two access levels a document can carry.
 *
 * `public` is readable by every signed-in user. `supervisor` is readable only
 * by a user assigned the `supervisor` (or `root`) permission set.
 */
export type DocumentAccessLevel = 'public' | 'supervisor';

export interface DocumentRecord {
  id: string;
  title: string;
  content: string;
  accessLevel: DocumentAccessLevel;
  /** Absolute application path that opens this document, including the deployment base path. */
  link: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

/** Who is asking, resolved from the authenticated session, never from request JSON. */
export interface DocumentPrincipal {
  userId: string;
  isRoot: boolean;
}

export interface DocumentListResult {
  canManage: boolean;
  documents: DocumentRecord[];
}

export type DocumentWriteInput = {
  title: string;
  content: string;
  accessLevel?: DocumentAccessLevel;
};

/**
 * Raised when a document may not be read or written by the principal.
 *
 * A regular colleague reading a `supervisor` document is refused with 403 —
 * both on the page and on a direct `GET /api/documents/:id` — so the limit is
 * provable from the API rather than only from hidden UI.
 */
export class DocumentAccessError extends Error {
  public readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'DocumentAccessError';
    this.status = status;
  }
}

/**
 * Application-owned document service.
 *
 * Access is decided here, on the server, from the principal's permission-set
 * assignment. It never trusts a role or a document id supplied by the caller.
 */
export class DocumentsService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly publicBasePath = '',
  ) {}

  private get query(): QueryAdapter {
    return this.database.query();
  }

  async canManage(principal: DocumentPrincipal): Promise<boolean> {
    if (principal.isRoot) {
      return true;
    }
    const assignment = await this.query
      .selectFrom('authorizationPermissionSetAssignments')
      .select('permissionSetKey')
      .where('subjectType', '=', 'user')
      .where('subjectId', '=', principal.userId)
      .where('permissionSetKey', 'in', ['root', 'supervisor'])
      .executeTakeFirst();
    return Boolean(assignment);
  }

  private toRecord(row: Record<string, unknown>): DocumentRecord {
    const id = String(row.id);
    const base = this.publicBasePath.replace(/\/$/, '');
    return {
      id,
      title: String(row.title),
      content: String(row.content),
      accessLevel: row.accessLevel === 'supervisor' ? 'supervisor' : 'public',
      link: `${base}/documents?doc=${encodeURIComponent(id)}`,
      createdAt: row.createdAt as string | Date,
      updatedAt: row.updatedAt as string | Date,
    };
  }

  async list(principal: DocumentPrincipal): Promise<DocumentListResult> {
    const canManage = await this.canManage(principal);
    let query = this.query
      .selectFrom('documents')
      .select('id')
      .select('title')
      .select('content')
      .select('accessLevel')
      .select('createdAt')
      .select('updatedAt')
      .orderBy('createdAt', 'asc');
    if (!canManage) {
      query = query.where('accessLevel', '=', 'public');
    }
    const rows = await query.execute();
    return { canManage, documents: rows.map((row) => this.toRecord(row)) };
  }

  async get(principal: DocumentPrincipal, id: string): Promise<DocumentRecord> {
    const row = await this.query
      .selectFrom('documents')
      .select('id')
      .select('title')
      .select('content')
      .select('accessLevel')
      .select('createdAt')
      .select('updatedAt')
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) {
      throw new DocumentAccessError(404, `Document ${id} was not found.`);
    }
    const record = this.toRecord(row);
    if (
      record.accessLevel === 'supervisor' &&
      !(await this.canManage(principal))
    ) {
      throw new DocumentAccessError(
        403,
        'This document is restricted to supervisors.',
      );
    }
    return record;
  }

  async create(
    principal: DocumentPrincipal,
    input: DocumentWriteInput,
  ): Promise<DocumentRecord> {
    await this.assertCanManage(principal);
    const now = new Date();
    const id = crypto.randomUUID();
    await this.query
      .insertInto('documents')
      .values({
        id,
        title: input.title,
        content: input.content,
        accessLevel:
          input.accessLevel === 'supervisor' ? 'supervisor' : 'public',
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return this.get(principal, id);
  }

  async update(
    principal: DocumentPrincipal,
    id: string,
    input: Partial<DocumentWriteInput>,
  ): Promise<DocumentRecord> {
    await this.assertCanManage(principal);
    const existing = await this.get(principal, id);
    await this.query
      .updateTable('documents')
      .set({
        title: input.title ?? existing.title,
        content: input.content ?? existing.content,
        accessLevel: input.accessLevel ?? existing.accessLevel,
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .execute();
    return this.get(principal, id);
  }

  private async assertCanManage(principal: DocumentPrincipal): Promise<void> {
    if (!(await this.canManage(principal))) {
      throw new DocumentAccessError(
        403,
        'Only a supervisor may maintain documents.',
      );
    }
  }

  /**
   * Read-only search used by the assistant tool.
   *
   * Returns only documents the principal may read, so a colleague's model can
   * never be handed the content of a `supervisor` document to cite or quote.
   */
  async search(
    principal: DocumentPrincipal,
    text: string,
  ): Promise<DocumentRecord[]> {
    const { documents } = await this.list(principal);
    const needle = text.trim().toLowerCase();
    if (!needle) {
      return documents;
    }
    return documents.filter(
      (document) =>
        document.title.toLowerCase().includes(needle) ||
        document.content.toLowerCase().includes(needle),
    );
  }
}

export const documentsServiceToken =
  createServiceToken<DocumentsService>('app/documents');

export class DocumentsProvider extends ServiceProvider<Application> {
  public readonly name = 'app/documents';

  public override register(): void {
    this.app.container.singleton(
      documentsServiceToken,
      (resolver) =>
        new DocumentsService(
          resolver.resolve(databaseManagerToken),
          this.app.publicBasePath,
        ),
    );
  }
}
