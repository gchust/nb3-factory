import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import { createServiceToken } from '@nocobase/service-provider';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseManager, ScopedRepository } from '@nocobase/db';

import {
  DOCUMENTS_COMPOSITE,
  type DocumentRecord,
} from './documents-resources.js';

/** Whichever identity asks — an HTTP session or the AI employee's actor. */
export interface DocumentsActor {
  id: string | number;
  roles?: readonly string[];
  isRoot?: boolean;
}

export interface UpdateDocumentInput {
  title: string;
  body: string;
}

/**
 * Every read of `documents` goes through this service. It resolves the caller's authorization decision
 * before touching the collection and hands the resulting policy to the Repository, so a caller only
 * ever sees the rows its data scope selects — never the supervisor-only document.
 */
export class DocumentsService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly authz: AppAuthorization,
  ) {}

  /**
   * A policy-bound repository. The granted read fields are exactly `DocumentRecord`, so the policy's
   * partial record type is widened back to the row shape the route and the tool publish.
   */
  private repository(policy: unknown): ScopedRepository<DocumentRecord> {
    return this.database
      .repository<DocumentRecord>('documents')
      .withPolicy(policy as never);
  }

  /** The identity an `AuthorizationContext` check runs as, with the subjects the middleware would add. */
  private async contextForActor(actor: DocumentsActor) {
    const principal = { type: 'user', id: String(actor.id) };
    return this.authz.for({
      principal,
      subjects: [
        { type: 'authenticated', id: '*' },
        ...(await this.authz.subjects.resolveFor(principal)),
      ],
    });
  }

  /**
   * The data policy for one action. A caller without the action is refused rather than silently
   * served an empty list, so a misconfigured account is visible.
   */
  private async policyForActor(
    actor: DocumentsActor,
    action: 'read' | 'edit',
  ): Promise<unknown> {
    const context = await this.contextForActor(actor);
    const decision = await context.authorize({
      resource: { type: 'composite', id: DOCUMENTS_COMPOSITE },
      action,
    });
    const database = decision.conditions?.database as
      Record<string, unknown> | undefined;
    const policy = database?.documents;
    if (decision.effect === 'deny' || policy === undefined) {
      throw new AuthorizationDeniedError(decision);
    }
    return policy;
  }

  async list(actor: DocumentsActor): Promise<DocumentRecord[]> {
    const policy = await this.policyForActor(actor, 'read');
    return this.repository(policy).findMany({
      sort: (sort) => sort.field('id').asc(),
    });
  }

  /**
   * A row the caller cannot select is reported as absent, not as forbidden: the endpoint must not
   * disclose that the supervisor-only document exists.
   */
  async find(
    actor: DocumentsActor,
    id: number,
  ): Promise<DocumentRecord | undefined> {
    const policy = await this.policyForActor(actor, 'read');
    return this.repository(policy).findOne({ filter: { id } });
  }

  async search(
    actor: DocumentsActor,
    query?: string,
  ): Promise<DocumentRecord[]> {
    const rows = await this.list(actor);
    const needle = query?.trim().toLocaleLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (row) =>
        row.title.toLocaleLowerCase().includes(needle) ||
        row.body.toLocaleLowerCase().includes(needle),
    );
  }

  async update(
    actor: DocumentsActor,
    id: number,
    input: UpdateDocumentInput,
  ): Promise<DocumentRecord> {
    const policy = await this.policyForActor(actor, 'edit');
    const scoped = this.repository(policy);
    const existing = await scoped.findOne({ filter: { id } });
    if (!existing) {
      throw new Error('DOCUMENT_NOT_FOUND');
    }
    await scoped.updateOne({
      filter: { id },
      values: {
        title: input.title,
        body: input.body,
        updatedAt: new Date(),
      },
    });
    const updated = await scoped.findOne({ filter: { id } });
    if (!updated) throw new Error('DOCUMENT_NOT_FOUND');
    return updated;
  }
}

export const documentsServiceToken =
  createServiceToken<DocumentsService>('app.documents');
