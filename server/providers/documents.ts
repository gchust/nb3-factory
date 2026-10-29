import type { UserAdministrationService } from '@nocobase/app-plugin-authentication/server';
import type {
  DatabaseManager,
  Repository,
  RepositoryPolicy,
} from '@nocobase/db';
import { ApiError } from '@nocobase/app-server/router';

import type {
  DocumentInput,
  DocumentRecord,
  DocumentShareRecord,
  DocumentShareView,
  DocumentView,
  ShareCandidate,
} from './document-types.js';

const DOMAIN = 'documents';

function instant(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function requiredInstant(value: Date | string): string {
  return instant(value) ?? new Date(0).toISOString();
}

function documentView(record: DocumentRecord): DocumentView {
  return {
    id: record.id,
    title: record.title,
    body: record.body,
    ownerId: record.ownerId,
    ownerName: record.ownerName,
    published: record.published,
    confidential: record.confidential,
    createdAt: requiredInstant(record.createdAt),
    updatedAt: requiredInstant(record.updatedAt),
  };
}

function shareView(record: DocumentShareRecord): DocumentShareView {
  const expiresAt = instant(record.expiresAt);
  const revokedAt = instant(record.revokedAt);
  return {
    id: record.id,
    documentId: record.documentId,
    userId: record.userId,
    userName: record.userName,
    sharedById: record.sharedById,
    sharedByName: record.sharedByName,
    expiresAt,
    revokedAt,
    active:
      revokedAt === null &&
      (expiresAt === null || new Date(expiresAt).getTime() > Date.now()),
  };
}

function notFound(documentId: string): ApiError {
  return new ApiError({
    status: 'NOT_FOUND',
    reason: 'DOCUMENT_NOT_FOUND',
    domain: DOMAIN,
    message: `Document ${documentId} was not found or is not visible.`,
  });
}

/**
 * Document library domain logic. The route supplies the resolved repository
 * policies for the operation; this service never reads a document outside the
 * policy that authorised the request.
 */
export class DocumentService {
  private readonly documents: Repository<DocumentRecord>;
  private readonly shareRepository: Repository<DocumentShareRecord>;

  constructor(
    database: DatabaseManager,
    private readonly users: UserAdministrationService,
  ) {
    this.documents = database.repository<DocumentRecord>('documents');
    this.shareRepository =
      database.repository<DocumentShareRecord>('documentShares');
  }

  async list(
    policy: RepositoryPolicy<DocumentRecord>,
  ): Promise<DocumentView[]> {
    const records = await this.documents.withPolicy(policy).findMany({
      sort: (sort) => [sort.field('updatedAt').desc()],
      limit: 500,
    });
    return records.map((record) => documentView(record as DocumentRecord));
  }

  async get(
    documentId: string,
    policy: RepositoryPolicy<DocumentRecord>,
  ): Promise<DocumentView> {
    const record = await this.documents.withPolicy(policy).findOne({
      filter: { id: documentId },
    });
    if (!record) throw notFound(documentId);
    return documentView(record as DocumentRecord);
  }

  async create(
    input: DocumentInput,
    owner: { id: string; name: string },
    policy: RepositoryPolicy<DocumentRecord>,
  ): Promise<DocumentView> {
    const now = new Date();
    const values = {
      id: crypto.randomUUID(),
      title: input.title.trim(),
      body: input.body.trim(),
      ownerId: owner.id,
      ownerName: owner.name,
      published: input.published,
      confidential: input.confidential,
      createdAt: now,
      updatedAt: now,
    };
    // `create` grants the write shape, not the read selection that `createOne`
    // would use to return the row. Insert without a returning read and build the
    // view from the values this service just assigned.
    await this.documents.withPolicy(policy).createMany({ values: [values] });
    return documentView(values);
  }

  async update(
    documentId: string,
    input: DocumentInput,
    policy: RepositoryPolicy<DocumentRecord>,
  ): Promise<DocumentView> {
    const result = await this.documents.withPolicy(policy).updateMany({
      filter: { id: documentId },
      values: {
        title: input.title.trim(),
        body: input.body.trim(),
        published: input.published,
        confidential: input.confidential,
        updatedAt: new Date(),
      },
    });
    if (result.updatedCount === 0) throw notFound(documentId);
    return this.get(documentId, policy);
  }

  async shares(
    documentId: string,
    documentPolicy: RepositoryPolicy<DocumentRecord>,
    sharePolicy: RepositoryPolicy<DocumentShareRecord>,
  ): Promise<DocumentShareView[]> {
    await this.get(documentId, documentPolicy);
    const records = await this.shareRepository
      .withPolicy(sharePolicy)
      .findMany({
        filter: { documentId },
        sort: (sort) => [sort.field('createdAt').desc()],
        limit: 200,
      });
    return records.map((record) => shareView(record as DocumentShareRecord));
  }

  async shareCandidates(): Promise<ShareCandidate[]> {
    const page = await this.users.list({
      page: 1,
      pageSize: 200,
      status: 'enabled',
      kind: 'person',
      sort: 'name',
      order: 'asc',
    });
    return page.items.map((user) => ({
      id: user.id,
      name: user.name,
      username: user.username ?? null,
      email: user.email,
    }));
  }

  /**
   * Opens one document to one person. The share becomes a new fact read by
   * `documents.readable` on every request, so revoking it takes effect without
   * invalidating or rewriting anything on the reader's side.
   */
  async share(
    documentId: string,
    input: { userId: string; expiresAt: string | null },
    sharedBy: { id: string; name: string },
    documentPolicy: RepositoryPolicy<DocumentRecord>,
    sharePolicy: RepositoryPolicy<DocumentShareRecord>,
  ): Promise<DocumentShareView> {
    const document = await this.get(documentId, documentPolicy);
    if (document.confidential) {
      throw new ApiError({
        status: 'FAILED_PRECONDITION',
        reason: 'DOCUMENT_CONFIDENTIAL',
        domain: DOMAIN,
        message: 'A confidential document cannot be shared.',
      });
    }
    if (input.userId === sharedBy.id) {
      throw new ApiError({
        status: 'INVALID_ARGUMENT',
        reason: 'DOCUMENT_SHARE_SELF',
        domain: DOMAIN,
        message: 'A document cannot be shared with the person sharing it.',
      });
    }

    const target = await this.users.get(input.userId);
    if (!target || target.disabledAt !== null) {
      throw new ApiError({
        status: 'FAILED_PRECONDITION',
        reason: 'DOCUMENT_SHARE_TARGET_UNAVAILABLE',
        domain: DOMAIN,
        message: 'The selected person is not available for sharing.',
      });
    }

    const now = new Date();
    const values = {
      userId: target.id,
      userName: target.name,
      sharedById: sharedBy.id,
      sharedByName: sharedBy.name,
      expiresAt: input.expiresAt,
      revokedAt: null,
      updatedAt: now,
    };
    const existing = await this.shareRepository
      .withPolicy(sharePolicy)
      .findOne({
        filter: { documentId, userId: target.id },
      });
    if (existing) {
      await this.shareRepository.withPolicy(sharePolicy).updateMany({
        filter: { id: existing.id },
        values,
      });
      const updated = await this.shareRepository
        .withPolicy(sharePolicy)
        .findOne({
          filter: { id: existing.id },
        });
      if (!updated) {
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'DOCUMENT_SHARE_NOT_FOUND',
          domain: DOMAIN,
          message: `Share ${existing.id} was not found.`,
        });
      }
      return shareView(updated as DocumentShareRecord);
    }

    const created = await this.shareRepository
      .withPolicy(sharePolicy)
      .createOne({
        values: {
          id: crypto.randomUUID(),
          documentId,
          ...values,
          createdAt: now,
        },
      });
    return shareView(created.record as DocumentShareRecord);
  }

  async revoke(
    documentId: string,
    shareId: string,
    documentPolicy: RepositoryPolicy<DocumentRecord>,
    sharePolicy: RepositoryPolicy<DocumentShareRecord>,
  ): Promise<DocumentShareView> {
    await this.get(documentId, documentPolicy);
    const result = await this.shareRepository
      .withPolicy(sharePolicy)
      .updateMany({
        filter: { id: shareId, documentId },
        values: { revokedAt: new Date(), updatedAt: new Date() },
      });
    if (result.updatedCount === 0) {
      throw new ApiError({
        status: 'NOT_FOUND',
        reason: 'DOCUMENT_SHARE_NOT_FOUND',
        domain: DOMAIN,
        message: `Share ${shareId} was not found for this document.`,
      });
    }
    const updated = await this.shareRepository.withPolicy(sharePolicy).findOne({
      filter: { id: shareId },
    });
    if (!updated) {
      throw new ApiError({
        status: 'NOT_FOUND',
        reason: 'DOCUMENT_SHARE_NOT_FOUND',
        domain: DOMAIN,
        message: `Share ${shareId} was not found for this document.`,
      });
    }
    return shareView(updated as DocumentShareRecord);
  }
}
