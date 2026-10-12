import type { AuthorizationContext } from '@nocobase/authorization/core';
import type {
  DatabaseManager,
  FilterBuilder,
  FilterNode,
  RepositoryPolicy,
} from '@nocobase/db';
import type { DatabaseApi } from '@nocobase/app-plugin-authorization/server';

import {
  MATERIALS_COLLECTION,
  MATERIAL_SHARES_COLLECTION,
  SHARING_SETTINGS_ID,
} from '../../materials/constants.js';

/** One row of `materials`, as the API returns it. */
export interface MaterialRecord {
  id: number;
  title: string;
  body: string | null;
  ownerId: string;
  published: boolean;
  confidential: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A material with the owner's display name resolved for the list and the detail panel. */
export interface MaterialView extends MaterialRecord {
  ownerName: string | null;
}

export interface MaterialCreateValues {
  title: string;
  body: string | null;
  published: boolean;
  confidential: boolean;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialUpdateValues {
  title?: string;
  body?: string | null;
  published?: boolean;
  confidential?: boolean;
  updatedAt: string;
}

export interface MaterialInput {
  title?: string;
  body?: string | null;
  published?: boolean;
  confidential?: boolean;
}

export interface ListMaterialsInput {
  page: number;
  pageSize: number;
  q?: string;
  ownerId?: string;
  published?: boolean;
  confidential?: boolean;
}

export interface MaterialsCapabilities {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canShare: boolean;
}

export interface MaterialShareView {
  userId: string;
  name: string | null;
  createdAt: string;
}

function now(): string {
  return new Date().toISOString();
}

function isPolicyEnabled(node: unknown): boolean {
  return node !== false;
}

/** The filters the list applies on the caller's behalf, as a `FilterBuilder` callback `findMany` and `count` share. */
function listFilter(
  input: ListMaterialsInput,
): (build: FilterBuilder<MaterialRecord>) => FilterNode {
  return (build) => {
    const nodes: FilterNode[] = [];
    if (input.ownerId) {
      nodes.push(build.string('ownerId').eq(input.ownerId));
    }
    if (input.published !== undefined) {
      nodes.push(
        input.published
          ? build.boolean('published').isTrue()
          : build.boolean('published').isFalse(),
      );
    }
    if (input.confidential !== undefined) {
      nodes.push(
        input.confidential
          ? build.boolean('confidential').isTrue()
          : build.boolean('confidential').isFalse(),
      );
    }
    const query = input.q?.trim();
    if (query) {
      nodes.push(
        build.or([
          build.string('title').includes(query, { mode: 'insensitive' }),
          build.text('body').includes(query, { mode: 'insensitive' }),
        ]),
      );
    }
    return build.and(nodes);
  };
}

/**
 * The domain half of the materials feature.
 *
 * Everything here is expressed in the permission model rather than an `if (role === …)`: the repository is bound to a
 * Policy resolved by the authorization plugin, so a scope the identity does not hold removes rows from reads and turns
 * an out-of-scope write into an ordinary not-found. The routes never check a role themselves.
 */
export class MaterialsService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly authorization: DatabaseApi,
  ) {}

  private repository(policy: RepositoryPolicy<MaterialRecord>) {
    return this.database
      .repository<MaterialRecord, MaterialCreateValues, MaterialUpdateValues>(
        MATERIALS_COLLECTION,
      )
      .withPolicy(policy);
  }

  private async policy(
    context: AuthorizationContext,
  ): Promise<RepositoryPolicy<MaterialRecord>> {
    return this.authorization.policyFor(MATERIALS_COLLECTION, context);
  }

  async capabilities(
    context: AuthorizationContext,
  ): Promise<MaterialsCapabilities> {
    const policy = await this.policy(context);
    return {
      canCreate: isPolicyEnabled(policy.create),
      canUpdate: isPolicyEnabled(policy.update),
      canDelete: isPolicyEnabled(policy.delete),
      canShare: await context.can({
        resource: { type: 'settings', id: SHARING_SETTINGS_ID },
        action: 'manage',
      }),
    };
  }

  async list(
    context: AuthorizationContext,
    input: ListMaterialsInput,
  ): Promise<{
    records: MaterialView[];
    total: number;
    capabilities: MaterialsCapabilities;
  }> {
    const repository = this.repository(await this.policy(context));
    const filter = listFilter(input);
    const records = await repository.findMany({
      filter,
      sort: (sort) => [sort.field('updatedAt').desc(), sort.field('id').desc()],
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
    });
    const total = await repository.count({ filter });
    return {
      records: await this.decorate(records),
      total,
      capabilities: await this.capabilities(context),
    };
  }

  /**
   * The display name of each id, one query for the whole batch. Reads the authentication table directly because a
   * material's owner is a user, not a relation this feature models.
   */
  private async userNames(
    ids: readonly string[],
  ): Promise<Map<string, string | null>> {
    const names = new Map<string, string | null>();
    if (ids.length === 0) {
      return names;
    }
    const rows: readonly { id?: unknown; name?: unknown }[] =
      await this.database
        .query()
        .selectFrom('user')
        .select(['id', 'name'])
        .where('id', 'in', ids)
        .execute();
    for (const row of rows) {
      if (typeof row.id === 'string') {
        names.set(row.id, typeof row.name === 'string' ? row.name : null);
      }
    }
    return names;
  }

  /**
   * The owner's name for a batch of records. One query for the page rather than one per row.
   */
  private async decorate(
    records: readonly Partial<MaterialRecord>[],
  ): Promise<MaterialView[]> {
    const ownerIds = [
      ...new Set(
        records
          .map((record) => record.ownerId)
          .filter((id): id is string => typeof id === 'string'),
      ),
    ];
    const names = await this.userNames(ownerIds);
    return records.map((record) => ({
      ...(record as MaterialRecord),
      ownerName:
        typeof record.ownerId === 'string'
          ? (names.get(record.ownerId) ?? null)
          : null,
    }));
  }

  async get(
    context: AuthorizationContext,
    id: number,
  ): Promise<MaterialView | undefined> {
    const record = await this.repository(await this.policy(context)).findOne({
      filter: { id },
    });
    if (!record) {
      return undefined;
    }
    const [view] = await this.decorate([record]);
    return view;
  }

  async create(
    context: AuthorizationContext,
    ownerId: string,
    input: MaterialInput,
  ): Promise<MaterialView> {
    const timestamp = now();
    const { record } = await this.repository(
      await this.policy(context),
    ).createOne({
      values: {
        title: input.title ?? '',
        body: input.body ?? null,
        published: input.published ?? false,
        confidential: input.confidential ?? false,
        ownerId,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
    const [view] = await this.decorate([record]);
    return view;
  }

  async update(
    context: AuthorizationContext,
    id: number,
    input: MaterialInput,
  ): Promise<MaterialView | undefined> {
    const values: MaterialUpdateValues = {
      updatedAt: now(),
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.body === undefined ? {} : { body: input.body }),
      ...(input.published === undefined ? {} : { published: input.published }),
      ...(input.confidential === undefined
        ? {}
        : { confidential: input.confidential }),
    };
    const { record } = await this.repository(
      await this.policy(context),
    ).updateOne({
      filter: { id },
      values,
    });
    const [view] = await this.decorate([record]);
    return view;
  }

  /** Throws the repository's not-found when the row is outside the caller's update scope. */
  async remove(context: AuthorizationContext, id: number): Promise<void> {
    await this.repository(await this.policy(context)).deleteOne({
      filter: { id },
    });
  }

  // --- Temporary sharing ---------------------------------------------------------------------------------------------

  /**
   * A material by id, ignoring permissions. Only a caller that already passed the sharing check reaches this, and the
   * check is the administrator's `materials.sharing` settings grant.
   */
  async findMaterial(id: number): Promise<MaterialRecord | undefined> {
    return this.database
      .query()
      .selectFrom(MATERIALS_COLLECTION)
      .select(['id', 'title', 'ownerId', 'published', 'confidential'])
      .where('id', '=', id)
      .limit(1)
      .executeTakeFirst<MaterialRecord>();
  }

  async listShares(materialId: number): Promise<MaterialShareView[]> {
    const shares = await this.database
      .query()
      .selectFrom(MATERIAL_SHARES_COLLECTION)
      .select(['userId', 'createdAt'])
      .where('materialId', '=', materialId)
      .orderBy('createdAt', 'asc')
      .execute();
    if (shares.length === 0) {
      return [];
    }
    const userIds = shares.map((share) => String(share.userId));
    const names = await this.userNames(userIds);
    return shares.map((share) => ({
      userId: String(share.userId),
      name: names.get(String(share.userId)) ?? null,
      createdAt: String(share.createdAt),
    }));
  }

  async addShare(
    materialId: number,
    userId: string,
  ): Promise<MaterialShareView> {
    const timestamp = now();
    const existing = await this.database
      .query()
      .selectFrom(MATERIAL_SHARES_COLLECTION)
      .select(['id'])
      .where('materialId', '=', materialId)
      .where('userId', '=', userId)
      .limit(1)
      .executeTakeFirst();
    if (!existing) {
      await this.database
        .query()
        .insertInto(MATERIAL_SHARES_COLLECTION)
        .values({
          materialId,
          userId,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .execute();
    }
    const view = (await this.listShares(materialId)).find(
      (share) => share.userId === userId,
    );
    return view ?? { userId, name: null, createdAt: timestamp };
  }

  async removeShare(materialId: number, userId: string): Promise<boolean> {
    const result = await this.database
      .query()
      .deleteFrom(MATERIAL_SHARES_COLLECTION)
      .where('materialId', '=', materialId)
      .where('userId', '=', userId)
      .execute();
    return (result.deletedCount ?? 0) > 0;
  }
}
