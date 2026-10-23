import type { AuthorizationContext } from '@nocobase/app-plugin-authorization/server';
import type { UserManagementService } from '@nocobase/app-plugin-users/server/tokens';
import {
  selection,
  type AuthorizationSubject,
} from '@nocobase/authorization/core';
import type { SharingRule } from '@nocobase/authorization/sharing-rules';
import { ApiError, type ApiErrorOptions } from '@nocobase/app-server/router';
import type { DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import {
  APP_NS,
  MATERIALS_COLLECTION,
  MATERIALS_COMPOSITE,
  MATERIALS_SCOPE,
  MATERIALS_SHARING_SETTINGS,
  type Material,
} from '../materials/authorization.js';

/** One material as the API answers it. */
export interface MaterialView {
  id: string;
  title: string;
  body: string | null;
  ownerId: string;
  ownerName: string | null;
  published: boolean;
  confidential: boolean;
  createdAt: string;
  updatedAt: string;
}

/** What the signed-in person may do with the library, decided by the server. */
export interface MaterialsCapabilities {
  create: boolean;
  edit: boolean;
  delete: boolean;
  share: boolean;
}

/** One reader a material is currently open to. */
export interface MaterialShare {
  userId: string;
  name: string;
  username: string | null;
  email: string;
}

/** A person an administrator can still open a material to. */
export interface ShareTarget {
  id: string;
  name: string;
  username: string | null;
  email: string;
}

export interface CreateMaterialInput {
  title: string;
  body: string | null;
  published: boolean;
  confidential: boolean;
}

export type UpdateMaterialInput = Partial<CreateMaterialInput>;

/** The composite actions the library exposes. */
export type MaterialAction = 'view' | 'create' | 'edit' | 'delete';

export interface MaterialsService {
  capabilities(context: AuthorizationContext): Promise<MaterialsCapabilities>;
  list(context: AuthorizationContext): Promise<MaterialView[]>;
  get(context: AuthorizationContext, id: string): Promise<MaterialView>;
  create(
    context: AuthorizationContext,
    input: CreateMaterialInput,
  ): Promise<MaterialView>;
  update(
    context: AuthorizationContext,
    id: string,
    input: UpdateMaterialInput,
  ): Promise<MaterialView>;
  remove(context: AuthorizationContext, id: string): Promise<void>;
  listShares(materialId: string): Promise<MaterialShare[]>;
  shareTargets(materialId: string): Promise<ShareTarget[]>;
  share(
    context: AuthorizationContext,
    materialId: string,
    userId: string,
  ): Promise<MaterialShare>;
  revokeShare(
    context: AuthorizationContext,
    materialId: string,
    userId: string,
  ): Promise<void>;
}

export const materialsServiceToken: ServiceToken<MaterialsService> =
  createServiceToken<MaterialsService>('app/materials-service');

const error = (options: ApiErrorOptions): ApiError => new ApiError(options);

const notFound = (id: string): ApiError =>
  error({
    status: 'NOT_FOUND',
    reason: 'MATERIAL_NOT_FOUND',
    domain: 'materials',
    message: `Material ${id} was not found.`,
  });

const denied = (action: string): ApiError =>
  error({
    status: 'PERMISSION_DENIED',
    reason: 'MATERIAL_ACTION_DENIED',
    domain: 'materials',
    message: `This account may not ${action} materials.`,
  });

/** The sharing rule that opens one material to one person: one key per pair. */
export const shareKey = (materialId: string, userId: string): string =>
  `materials.share.${materialId}.${userId}`;

/** The material a stored rule selects, when it selects exactly one. */
function sharedMaterial(rule: SharingRule): string | undefined {
  if (
    rule.resource.type !== 'composite' ||
    rule.resource.id !== MATERIALS_COMPOSITE
  )
    return undefined;
  for (const entry of rule.actions) {
    if (
      entry.action === 'view' &&
      entry.scopeKey === MATERIALS_SCOPE &&
      entry.selection.type === 'records' &&
      entry.selection.ids.length === 1
    )
      return entry.selection.ids[0];
  }
  return undefined;
}

/** The one person a stored rule names. */
function sharedSubject(rule: SharingRule): string | undefined {
  const subjects: readonly AuthorizationSubject[] = rule.subjects ?? [];
  if (subjects.length !== 1) return undefined;
  const [subject] = subjects;
  return subject?.type === 'user' ? subject.id : undefined;
}

function iso(value: Date | string | null | undefined): string {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : '';
}

function view(material: Material): MaterialView {
  return {
    id: material.id,
    title: material.title,
    body: material.body ?? null,
    ownerId: material.ownerId,
    ownerName: material.ownerName ?? null,
    published: material.published === true,
    confidential: material.confidential === true,
    createdAt: iso(material.createdAt),
    updatedAt: iso(material.updatedAt),
  };
}

/**
 * The library's domain logic.
 *
 * Every read and write goes through the Repository policy the composite action
 * folded for the `materials` collection, so the database refuses a row the
 * person may not reach and nothing here filters a full result set in JavaScript.
 * A share is an extra authorization constraint rather than a flag on a row,
 * which is why revoking one takes effect on the next request, refresh included.
 */
export function createMaterialsService(deps: {
  database: DatabaseManager;
  sharing: () => {
    get(key: string): Promise<SharingRule | undefined>;
    list(): Promise<readonly SharingRule[]>;
    create(rule: SharingRule): Promise<SharingRule>;
    update(key: string, rule: SharingRule): Promise<SharingRule>;
    delete(key: string): Promise<void>;
  };
  users: () => UserManagementService;
  newId: () => string;
}): MaterialsService {
  const { database, sharing, users, newId } = deps;

  /** A Repository bound to the decision of one composite action. */
  const repositoryFor = async (
    context: AuthorizationContext,
    action: MaterialAction,
  ) => {
    const decision = await context.authorize({
      resource: { type: 'composite', id: MATERIALS_COMPOSITE },
      action,
    });
    if (decision.effect === 'deny') throw denied(action);
    const policy = decision.conditions?.database?.[MATERIALS_COLLECTION];
    if (!policy) throw denied(action);
    return database
      .connection()
      .repository<Material>(MATERIALS_COLLECTION)
      .withPolicy(policy);
  };

  /** A row the request may reach, or the same 404 an absent one answers with. */
  const findVisible = async (
    context: AuthorizationContext,
    id: string,
    action: 'view' | 'delete' = 'view',
  ): Promise<Material> => {
    // A policy-bound Repository narrows the record type to the fields the policy
    // grants; the composite's view branch grants every field, so the row is the
    // Material the declarations describe.
    const material = await (
      await repositoryFor(context, action)
    ).findOne({ filter: { id } });
    if (!material) throw notFound(id);
    return material as Material;
  };

  /** Enabled accounts an administrator may open a material to, with their names. */
  const directory = async (): Promise<readonly ShareTarget[]> => {
    const page = await users().list({ pageSize: 200, status: 'enabled' });
    return page.items.map((user) => ({
      id: user.id,
      name: user.name,
      username: user.username ?? null,
      email: user.email,
    }));
  };

  const sharesOf = async (
    materialId: string,
  ): Promise<readonly { key: string; userId: string }[]> => {
    const rules = await sharing().list();
    return rules.flatMap((rule) => {
      const userId = sharedSubject(rule);
      return sharedMaterial(rule) === materialId && userId
        ? [{ key: rule.key, userId }]
        : [];
    });
  };

  const shareOf = (target: ShareTarget): MaterialShare => ({
    userId: target.id,
    name: target.name,
    username: target.username,
    email: target.email,
  });

  return {
    async capabilities(context) {
      const [create, edit, remove] = await Promise.all(
        (['create', 'edit', 'delete'] as const).map((action) =>
          context.authorize({
            resource: { type: 'composite', id: MATERIALS_COMPOSITE },
            action,
          }),
        ),
      );
      const possible = (decision: { effect: string }) =>
        decision.effect !== 'deny';
      return {
        create: possible(create),
        edit: possible(edit),
        delete: possible(remove),
        share: await context.can({
          resource: { type: 'settings', id: MATERIALS_SHARING_SETTINGS },
          action: 'create',
        }),
      };
    },

    async list(context) {
      const materials = await (
        await repositoryFor(context, 'view')
      ).findMany({ sort: (sort) => [sort.field('updatedAt').desc()] });
      return materials.map((material) => view(material as Material));
    },

    async get(context, id) {
      return view(await findVisible(context, id));
    },

    async create(context, input) {
      const principal = context.identity.principal;
      const now = new Date();
      const { record } = await (
        await repositoryFor(context, 'create')
      ).createOne({
        values: {
          id: newId(),
          title: input.title,
          body: input.body,
          ownerId: principal.id,
          ownerName: (await users().get(principal.id)).name,
          published: input.published,
          confidential: input.confidential,
          createdAt: now,
          updatedAt: now,
        },
      });
      return view(record as Material);
    },

    async update(context, id, input) {
      const current = await findVisible(context, id);
      const { record } = await (
        await repositoryFor(context, 'edit')
      ).updateOne({
        filter: { id: current.id },
        values: { ...input, updatedAt: new Date() },
      });
      return view(record as Material);
    },

    async remove(context, id) {
      const current = await findVisible(context, id, 'delete');
      await (
        await repositoryFor(context, 'delete')
      ).deleteOne({ filter: { id: current.id } });
    },

    async listShares(materialId) {
      const [shared, people] = await Promise.all([
        sharesOf(materialId),
        directory(),
      ]);
      return shared.flatMap(({ userId }) => {
        const person = people.find((user) => user.id === userId);
        return person ? [shareOf(person)] : [];
      });
    },

    async shareTargets(materialId) {
      const [people, shared] = await Promise.all([
        directory(),
        sharesOf(materialId),
      ]);
      const taken = new Set(shared.map(({ userId }) => userId));
      return people.filter((person) => !taken.has(person.id));
    },

    async share(context, materialId, userId) {
      // Sharing is an administrative act, but it still starts from a material
      // this request may read: a rule is never built from an id alone.
      const material = await findVisible(context, materialId);
      const target = (await directory()).find((user) => user.id === userId);
      if (!target) {
        throw error({
          status: 'NOT_FOUND',
          reason: 'MATERIAL_SHARE_TARGET_NOT_FOUND',
          domain: 'materials',
          message: `User ${userId} was not found.`,
        });
      }
      const rule: SharingRule = {
        key: shareKey(material.id, target.id),
        resource: { type: 'composite', id: MATERIALS_COMPOSITE },
        actions: [
          {
            action: 'view',
            scopeKey: MATERIALS_SCOPE,
            selection: selection.records([material.id]),
          },
        ],
        title: { key: 'materials.sharing.ruleTitle', ns: APP_NS },
        reason: 'Opened to one reader for a while',
        subjects: [{ type: 'user', id: target.id }],
      };
      const api = sharing();
      if (await api.get(rule.key)) await api.update(rule.key, rule);
      else await api.create(rule);
      return shareOf(target);
    },

    async revokeShare(context, materialId, userId) {
      await findVisible(context, materialId);
      const api = sharing();
      const key = shareKey(materialId, userId);
      if (!(await api.get(key))) {
        throw error({
          status: 'NOT_FOUND',
          reason: 'MATERIAL_SHARE_NOT_FOUND',
          domain: 'materials',
          message: `Material ${materialId} is not open to user ${userId}.`,
        });
      }
      await api.delete(key);
    },
  };
}
