import { randomUUID } from 'node:crypto';

import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { UserAdministrationService } from '@nocobase/app-plugin-authentication/server';
import {
  AuthorizationDeniedError,
  type AuthorizationContext,
  type AuthorizationDecision,
  type CompositeResourceConditions,
} from '@nocobase/authorization/core';
import type { DatabaseConnection, RepositoryPolicy } from '@nocobase/db';

import { LIBRARY_COLLECTION, LIBRARY_RESOURCE_ID } from './authorization.js';

/**
 * The document library's domain logic.
 *
 * It resolves what a caller may do through the authorization context it is
 * given and reads and writes through a Repository bound to the resulting
 * Policy, so row-level scoping and the confidentiality rule are applied by the
 * database layer rather than re-implemented here. It returns plain records and
 * never decides a status code; the route translates the errors it throws.
 */

export interface LibraryDocumentView {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly published: boolean;
  readonly confidential: boolean;
}

export interface LibraryDocumentList {
  readonly items: readonly LibraryDocumentView[];
  readonly total: number;
  readonly canCreate: boolean;
  readonly editableIds: readonly string[];
}

export interface LibraryDocumentInput {
  readonly title: string;
  readonly body: string;
  readonly published: boolean;
  readonly confidential: boolean;
}

export interface LibraryDependencies {
  readonly authz: AppAuthorization;
  readonly context: AuthorizationContext;
  readonly connection: DatabaseConnection;
  readonly users: UserAdministrationService;
}

const resource = { type: 'composite', id: LIBRARY_RESOURCE_ID } as const;

interface ActionPolicy {
  readonly decision: AuthorizationDecision<CompositeResourceConditions>;
  readonly policy?: RepositoryPolicy;
}

/**
 * Resolves what the caller may do, without failing on a denied action. A list
 * must still load for a reader who may not create or edit, so those actions are
 * probed rather than required.
 */
async function resolveAction(
  dependencies: LibraryDependencies,
  action: 'view' | 'create' | 'edit',
): Promise<ActionPolicy> {
  const decision = await dependencies.context.authorize({ resource, action });
  if (decision.effect === 'deny') {
    return { decision };
  }
  const policy = await dependencies.authz.database.policyFor(
    LIBRARY_COLLECTION,
    dependencies.context,
    { resource: LIBRARY_RESOURCE_ID, action },
  );
  return { decision, policy };
}

/** The same resolution for an operation the caller must be allowed to perform. */
async function requireAction(
  dependencies: LibraryDependencies,
  action: 'view' | 'create' | 'edit',
): Promise<{
  decision: AuthorizationDecision<CompositeResourceConditions>;
  policy: RepositoryPolicy;
}> {
  const resolved = await resolveAction(dependencies, action);
  if (!resolved.policy) {
    throw new AuthorizationDeniedError(resolved.decision);
  }
  return { decision: resolved.decision, policy: resolved.policy };
}

async function ownerNames(
  users: UserAdministrationService,
  ids: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const unique = [...new Set(ids)].filter((id) => id.length > 0);
  if (unique.length === 0) {
    return new Map();
  }
  const page = await users.list({ userIds: unique, pageSize: unique.length });
  return new Map(
    page.items.map((user) => [
      user.id,
      user.name || user.username || user.email,
    ]),
  );
}

function toView(
  row: Readonly<Record<string, unknown>>,
  names: ReadonlyMap<string, string>,
): LibraryDocumentView {
  const ownerId = text(row.ownerId);
  return {
    id: text(row.id),
    title: text(row.title),
    body: text(row.body),
    ownerId,
    ownerName: names.get(ownerId) ?? ownerId,
    published: row.published === true,
    confidential: row.confidential === true,
  };
}

/** Reads a scalar column as a string; a structured value never reaches the client. */
function text(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  return '';
}

export async function listDocuments(
  dependencies: LibraryDependencies,
): Promise<LibraryDocumentList> {
  const view = await requireAction(dependencies, 'view');
  const create = await resolveAction(dependencies, 'create');
  const edit = await resolveAction(dependencies, 'edit');

  const repository = dependencies.connection.repository(LIBRARY_COLLECTION);
  const rows = await repository.withPolicy(view.policy).findMany({});

  let editableIds: readonly string[] = [];
  const editPolicy = edit.policy;
  if (editPolicy && editPolicy.read !== false && editPolicy.update !== false) {
    const editableRows = await repository.withPolicy(editPolicy).findMany({});
    const allowed = new Set(editableRows.map((row) => text(row.id)));
    editableIds = rows
      .map((row) => text(row.id))
      .filter((id) => allowed.has(id));
  }

  const names = await ownerNames(
    dependencies.users,
    rows.map((row) => text(row.ownerId)),
  );

  return {
    items: rows.map((row) => toView(row, names)),
    total: rows.length,
    canCreate:
      !!create.policy &&
      create.policy.read !== false &&
      create.policy.create !== false,
    editableIds,
  };
}

export async function createDocument(
  dependencies: LibraryDependencies,
  input: LibraryDocumentInput,
): Promise<LibraryDocumentView> {
  const { decision, policy } = await requireAction(dependencies, 'create');
  if (policy.read === false || policy.create === false) {
    throw new AuthorizationDeniedError(decision);
  }

  const ownerId = dependencies.context.identity.principal.id;
  const repository = dependencies.connection.repository(LIBRARY_COLLECTION);
  const { record } = await repository.withPolicy(policy).createOne({
    values: {
      id: randomUUID(),
      title: input.title,
      body: input.body,
      ownerId,
      published: input.published,
      confidential: input.confidential,
    },
  });

  const names = await ownerNames(dependencies.users, [ownerId]);
  return toView(record, names);
}

export async function updateDocument(
  dependencies: LibraryDependencies,
  id: string,
  input: LibraryDocumentInput,
): Promise<LibraryDocumentView | undefined> {
  const { decision, policy } = await requireAction(dependencies, 'edit');
  if (policy.read === false || policy.update === false) {
    throw new AuthorizationDeniedError(decision);
  }

  const repository = dependencies.connection.repository(LIBRARY_COLLECTION);
  const scoped = repository.withPolicy(policy);
  const existing = await scoped.findOne({ filter: { id } });
  if (!existing) {
    return undefined;
  }

  const { record } = await scoped.updateOne({
    filter: { id },
    values: {
      title: input.title,
      body: input.body,
      published: input.published,
      confidential: input.confidential,
    },
  });

  const names = await ownerNames(dependencies.users, [text(record.ownerId)]);
  return toView(record, names);
}
