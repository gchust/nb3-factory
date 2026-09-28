/**
 * The document library's domain logic, independent of HTTP.
 *
 * Every method takes the Repository Policy the caller's authorization
 * produced; the service never decides who may do what. It builds and runs the
 * queries, stamps ids and times, and turns Repository's not-found error into a
 * value the route can answer 404 with.
 */
import {
  RepositoryError,
  type DatabaseManager,
  type RepositoryPolicy,
} from '@nocobase/db';
import { createServiceToken } from '@nocobase/service-provider';

import {
  type LibraryDocument,
  type LibraryDocumentCreate,
  type LibraryDocumentShare,
  type LibraryDocumentUpdate,
  type LibraryDocumentView,
  type LibraryUserRow,
} from './library-types.ts';

export const libraryServiceToken = createServiceToken<LibraryService>(
  'nb3-factory.library',
);

/** The business fields a document create accepts. */
export interface LibraryDocumentDraft {
  readonly title: string;
  readonly body?: string | null;
  readonly published?: boolean;
  readonly confidential?: boolean;
}

/** The business fields a document edit accepts. */
export type LibraryDocumentPatch = {
  title?: string;
  body?: string | null;
  published?: boolean;
  confidential?: boolean;
};

/** A record an administrator may hand a document to. */
export interface LibraryAccount {
  readonly id: string;
  readonly name: string;
  readonly username: string | null;
  readonly email: string;
}

function isRecordNotFound(error: unknown): boolean {
  return error instanceof RepositoryError && error.code === 'RECORD_NOT_FOUND';
}

export class LibraryService {
  constructor(private readonly database: DatabaseManager) {}

  private documents(policy: RepositoryPolicy<LibraryDocument>) {
    return this.database
      .repository<LibraryDocument>('documents')
      .withPolicy(policy);
  }

  private shares(policy: RepositoryPolicy<LibraryDocumentShare>) {
    return this.database
      .repository<LibraryDocumentShare>('documentShares')
      .withPolicy(policy);
  }

  /**
   * Adds the owner's display name to records the policy has already admitted.
   * Reading the `user` table is unrestricted here on purpose: the query only
   * names owners of rows the caller may see, so it widens no record.
   */
  private async ownerNames(
    ids: readonly string[],
  ): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    for (const id of new Set(ids)) {
      const user = await this.database
        .repository<LibraryUserRow>('user')
        .findOne({ filter: { id } });
      if (user) {
        names.set(id, user.name);
      }
    }
    return names;
  }

  private async withOwnerNames(
    records: readonly LibraryDocument[],
  ): Promise<LibraryDocumentView[]> {
    const names = await this.ownerNames(
      records.map((record) => record.ownerId),
    );
    return records.map((record) => ({
      ...record,
      ownerName: names.get(record.ownerId) ?? null,
    }));
  }

  async listDocuments(
    policy: RepositoryPolicy<LibraryDocument>,
    options: { readonly limit: number; readonly offset: number },
  ): Promise<{
    readonly records: LibraryDocumentView[];
    readonly total: number;
  }> {
    const repository = this.documents(policy);
    const records = await repository.findMany({
      sort: (sort) => [sort.field('updatedAt').desc()],
      limit: options.limit,
      offset: options.offset,
    });
    const total = await repository.count();
    return {
      records: await this.withOwnerNames(records as LibraryDocument[]),
      total,
    };
  }

  async findDocument(
    policy: RepositoryPolicy<LibraryDocument>,
    id: string,
  ): Promise<LibraryDocumentView | undefined> {
    const record = await this.documents(policy).findOne({ filter: { id } });
    if (!record) {
      return undefined;
    }
    return (await this.withOwnerNames([record as LibraryDocument]))[0];
  }

  async createDocument(
    policy: RepositoryPolicy<LibraryDocument>,
    ownerId: string,
    draft: LibraryDocumentDraft,
  ): Promise<LibraryDocumentView> {
    const now = new Date();
    const values: LibraryDocumentCreate = {
      id: crypto.randomUUID(),
      title: draft.title,
      body: draft.body ?? null,
      ownerId,
      published: draft.published ?? false,
      confidential: draft.confidential ?? false,
      createdAt: now,
      updatedAt: now,
    };
    const result = await this.documents(policy).createOne({ values });
    return (await this.withOwnerNames([result.record as LibraryDocument]))[0];
  }

  /** `undefined` means the record does not exist or is outside the policy. */
  async updateDocument(
    policy: RepositoryPolicy<LibraryDocument>,
    id: string,
    patch: LibraryDocumentPatch,
  ): Promise<LibraryDocumentView | undefined> {
    const values: LibraryDocumentUpdate = {
      ...patch,
      updatedAt: new Date(),
    };
    try {
      const result = await this.documents(policy).updateOne({
        filter: { id },
        values,
      });
      return (await this.withOwnerNames([result.record as LibraryDocument]))[0];
    } catch (error) {
      if (isRecordNotFound(error)) {
        return undefined;
      }
      throw error;
    }
  }

  /** `false` means the record does not exist or is outside the policy. */
  async deleteDocument(
    policy: RepositoryPolicy<LibraryDocument>,
    id: string,
  ): Promise<boolean> {
    try {
      await this.documents(policy).deleteOne({ filter: { id } });
      return true;
    } catch (error) {
      if (isRecordNotFound(error)) {
        return false;
      }
      throw error;
    }
  }

  async listShares(
    policy: RepositoryPolicy<LibraryDocumentShare>,
    documentId: string,
  ): Promise<LibraryDocumentShare[]> {
    const records = await this.shares(policy).findMany({
      filter: { documentId },
      sort: (sort) => [sort.field('createdAt').asc()],
    });
    return records as LibraryDocumentShare[];
  }

  async createShare(
    policy: RepositoryPolicy<LibraryDocumentShare>,
    documentId: string,
    userId: string,
  ): Promise<LibraryDocumentShare | undefined> {
    const existing = await this.shares(policy).findOne({
      filter: { documentId, userId },
    });
    if (existing) {
      return existing as LibraryDocumentShare;
    }
    const values = {
      id: crypto.randomUUID(),
      documentId,
      userId,
      createdAt: new Date(),
    };
    const result = await this.shares(policy).createOne({ values });
    return result.record as LibraryDocumentShare;
  }

  async deleteShare(
    policy: RepositoryPolicy<LibraryDocumentShare>,
    documentId: string,
    shareId: string,
  ): Promise<boolean> {
    try {
      await this.shares(policy).deleteOne({
        filter: { id: shareId, documentId },
      });
      return true;
    } catch (error) {
      if (isRecordNotFound(error)) {
        return false;
      }
      throw error;
    }
  }

  /** The accounts an administrator can hand a document to. */
  async listAccounts(): Promise<LibraryAccount[]> {
    const records = await this.database
      .repository<LibraryAccount>('user')
      .findMany({
        sort: (sort) => [sort.field('name').asc()],
      });
    return records;
  }
}
