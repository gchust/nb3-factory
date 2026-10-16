import { randomUUID } from 'node:crypto';

import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { UserAdministrationService } from '@nocobase/app-plugin-authentication/server';
import {
  AuthorizationDeniedError,
  type AuthorizationContext,
  type AuthorizationDecision,
  type CompositeResourceConditions,
} from '@nocobase/authorization/core';
import type {
  DatabaseManager,
  RepositoryOperations,
  RepositoryPolicy,
} from '@nocobase/db';
import type { FilterBuilder, FilterNode } from '@nocobase/repository-input';

import {
  LIBRARY_COLLECTION,
  LIBRARY_RESOURCE_ID,
  SHARING_RULES_SETTINGS,
} from './authorization.js';
import type {
  LibraryDocumentInput,
  LibraryDocumentList,
  LibraryDocumentPatch,
  LibraryDocumentQuery,
  LibraryDocumentRecord,
  LibraryDocumentView,
} from './domain.js';

/**
 * The document library's domain logic.
 *
 * It resolves what a caller may do through the authorization context it is
 * given and reads and writes through a Repository bound to the resulting
 * Policy, so row-level scoping and the confidentiality restriction are applied
 * by the database layer rather than re-implemented here. It returns plain
 * records and never decides a status code; the routes translate the errors it
 * throws.
 */

export interface DocumentLibraryOptions {
  readonly database: DatabaseManager;
  readonly authorization: AppAuthorization;
  readonly users: UserAdministrationService;
}

const RESOURCE = { type: 'composite', id: LIBRARY_RESOURCE_ID } as const;
type LibraryAction = 'view' | 'create' | 'edit';
type DocumentPolicy = RepositoryPolicy<LibraryDocumentRecord>;

interface ResolvedAction {
  readonly decision: AuthorizationDecision<CompositeResourceConditions>;
  readonly policy?: DocumentPolicy;
}

export class DocumentLibrary {
  private readonly database: DatabaseManager;
  private readonly authorization: AppAuthorization;
  private readonly users: UserAdministrationService;

  constructor(options: DocumentLibraryOptions) {
    this.database = options.database;
    this.authorization = options.authorization;
    this.users = options.users;
  }

  async list(
    context: AuthorizationContext,
    query: LibraryDocumentQuery = {},
  ): Promise<LibraryDocumentList> {
    const view = await this.require(context, 'view');
    const create = await this.resolve(context, 'create');
    const edit = await this.resolve(context, 'edit');

    // The scope is the repository policy's job; the search term only narrows
    // what the caller may already read, so a reader cannot search its way to a
    // document outside its scope.
    const read = this.scoped(view.policy);
    const rows = await read.findMany({
      filter: buildListFilter(query),
      sort: (sort) => sort.field('updatedAt').desc(),
    });

    const editable = await this.editableIds(edit, rows);
    const names = await this.ownerNames(rows.map((row) => row.ownerId));
    const canShare = await this.canShare(context);

    return {
      items: rows.map((row) =>
        this.toView(row, names, editable.has(row.id), canShare),
      ),
      total: rows.length,
      canCreate: permits(create, 'create'),
    };
  }

  async get(
    context: AuthorizationContext,
    id: string,
  ): Promise<LibraryDocumentView | undefined> {
    const view = await this.require(context, 'view');
    const edit = await this.resolve(context, 'edit');

    const row = await this.scoped(view.policy).findOne({ filter: { id } });
    if (!row) {
      return undefined;
    }

    const editable = await this.editableIds(edit, [row]);
    const names = await this.ownerNames([row.ownerId]);
    const canShare = await this.canShare(context);
    return this.toView(row, names, editable.has(row.id), canShare);
  }

  async create(
    context: AuthorizationContext,
    input: LibraryDocumentInput,
  ): Promise<LibraryDocumentView> {
    const action = await this.require(context, 'create');
    const now = new Date();
    const { record } = await this.scoped(action.policy).createOne({
      values: {
        id: randomUUID(),
        title: input.title,
        body: input.body,
        ownerId: context.identity.principal.id,
        published: input.published,
        confidential: input.confidential,
        createdAt: now,
        updatedAt: now,
      },
    });

    const names = await this.ownerNames([record.ownerId]);
    return this.toView(record, names, true, await this.canShare(context));
  }

  async update(
    context: AuthorizationContext,
    id: string,
    patch: LibraryDocumentPatch,
  ): Promise<LibraryDocumentView | undefined> {
    const action = await this.require(context, 'edit');
    const repository = this.scoped(action.policy);

    const existing = await repository.findOne({ filter: { id } });
    if (!existing) {
      return undefined;
    }

    const { record } = await repository.updateOne({
      filter: { id },
      values: {
        title: patch.title ?? existing.title,
        body: patch.body ?? existing.body,
        published: patch.published ?? existing.published,
        confidential: patch.confidential ?? existing.confidential,
        updatedAt: new Date(),
      },
    });

    const names = await this.ownerNames([record.ownerId]);
    return this.toView(record, names, true, await this.canShare(context));
  }

  // ------------------------------------------------------------- internals

  /** A Repository bound to `policy`, or the unrestricted one when there is none. */
  private scoped(
    policy: DocumentPolicy | undefined,
  ): RepositoryOperations<LibraryDocumentRecord> {
    const repository =
      this.database.repository<LibraryDocumentRecord>(LIBRARY_COLLECTION);
    if (!policy) {
      return repository;
    }
    return repository.withPolicy(
      policy,
    ) as unknown as RepositoryOperations<LibraryDocumentRecord>;
  }

  /**
   * Resolves what the caller may do without failing on a denied action. A list
   * must still load for a reader who may not create or edit, so those actions
   * are probed rather than required.
   */
  private async resolve(
    context: AuthorizationContext,
    action: LibraryAction,
  ): Promise<ResolvedAction> {
    const decision = await context.authorize({ resource: RESOURCE, action });
    if (decision.effect === 'deny') {
      return { decision };
    }
    const policy = await this.authorization.database.policyFor(
      LIBRARY_COLLECTION,
      context,
      { resource: LIBRARY_RESOURCE_ID, action },
    );
    return { decision, policy };
  }

  /** The same resolution for an action the caller must be allowed to perform. */
  private async require(
    context: AuthorizationContext,
    action: LibraryAction,
  ): Promise<ResolvedAction> {
    const resolved = await this.resolve(context, action);
    if (!resolved.policy) {
      throw new AuthorizationDeniedError(resolved.decision);
    }
    return resolved;
  }

  /**
   * The ids among `rows` the caller may edit. Editing is resolved separately
   * from reading, so a reader whose view a Sharing Rule widened still gets an
   * empty set here: reading never implies editing.
   */
  private async editableIds(
    edit: ResolvedAction,
    rows: readonly LibraryDocumentRecord[],
  ): Promise<ReadonlySet<string>> {
    if (!permits(edit, 'update')) {
      return new Set();
    }
    const editableRows = await this.scoped(edit.policy).findMany({});
    const wanted = new Set(rows.map((row) => row.id));
    return new Set(
      editableRows.map((row) => row.id).filter((id) => wanted.has(id)),
    );
  }

  /**
   * Whether the caller may manage Sharing Rules at all. It is the same check the
   * share routes enforce, so the panel and the endpoints agree.
   */
  private async canShare(context: AuthorizationContext): Promise<boolean> {
    const decision = await context.authorize({
      resource: { type: 'settings', id: SHARING_RULES_SETTINGS },
      action: 'read',
    });
    return decision.effect === 'permit';
  }

  private async ownerNames(
    ids: readonly string[],
  ): Promise<ReadonlyMap<string, string>> {
    const unique = [...new Set(ids)].filter((id) => id.length > 0);
    if (unique.length === 0) {
      return new Map();
    }
    const page = await this.users.list({
      userIds: unique,
      pageSize: unique.length,
    });
    return new Map(
      page.items.map((user) => [
        user.id,
        user.name || user.username || user.email,
      ]),
    );
  }

  private toView(
    row: LibraryDocumentRecord,
    names: ReadonlyMap<string, string>,
    editable: boolean,
    canShare: boolean,
  ): LibraryDocumentView {
    return {
      id: String(row.id),
      title: String(row.title ?? ''),
      body: String(row.body ?? ''),
      ownerId: String(row.ownerId ?? ''),
      ownerName: names.get(row.ownerId) ?? String(row.ownerId ?? ''),
      published: row.published === true,
      confidential: row.confidential === true,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
      editable,
      canShare,
    };
  }
}

/**
 * Narrows a list by the search term and the visibility filter. It selects
 * nothing on its own: the Repository Policy's scope and the confidentiality
 * restriction are still applied on top, so neither can be used to reach a
 * document the caller may not read.
 */
function buildListFilter(
  query: LibraryDocumentQuery,
): ((filter: FilterBuilder<LibraryDocumentRecord>) => FilterNode) | undefined {
  const term = query.q?.trim();
  if (!term && !query.visibility) return undefined;
  return (filter) => {
    const nodes: FilterNode[] = [];
    if (query.visibility === 'published') {
      nodes.push(filter.boolean('published').isTrue());
    } else if (query.visibility === 'draft') {
      nodes.push(filter.boolean('published').isFalse());
    } else if (query.visibility === 'confidential') {
      nodes.push(filter.boolean('confidential').isTrue());
    }
    if (term) {
      nodes.push(
        filter.or([
          filter.string('title').includes(term),
          filter.text('body').includes(term),
        ]),
      );
    }
    return filter.and(nodes);
  };
}

/** Whether a resolved action allows the given Repository operation. */
function permits(
  action: ResolvedAction,
  operation: 'read' | 'create' | 'update',
): boolean {
  const policy = action.policy;
  if (!policy || action.decision.effect === 'deny') {
    return false;
  }
  const node = policy[operation];
  if (node === false) {
    return false;
  }
  return operation === 'read' || node !== undefined;
}

function toIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return typeof value === 'number' || typeof value === 'bigint'
    ? String(value)
    : '';
}
