import {
  AuthorizationDeniedError,
  type AuthorizationContext,
  type AuthorizationDecision,
} from '@nocobase/authorization/core';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type {
  DatabaseManager,
  Repository,
  RepositoryPolicy,
} from '@nocobase/db';
import { createServiceToken } from '@nocobase/service-provider';
import type { MaterialRecord } from '../authorization/materials.js';

export const materialsServiceToken = createServiceToken<MaterialsService>(
  'nb3-factory/materials',
);

/** The collection this application owns. */
export const MATERIALS_COLLECTION = 'materials';

/** The one material as the pages and the assistant see it. */
export interface MaterialView {
  readonly id: number;
  readonly title: string;
  readonly body: string;
  readonly restricted: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The identity a caller acts as. The HTTP routes pass the session's principal, the assistant its actor. */
export interface MaterialsActor {
  readonly id: string | number;
}

export interface ListMaterialsInput {
  readonly limit: number;
  readonly offset: number;
}

export interface ListMaterialsResult {
  readonly data: readonly MaterialView[];
  readonly total: number;
}

/** The two content fields a page maintains. Visibility stays a permission decision. */
export interface MaterialContentInput {
  readonly title: string;
  readonly body: string;
}

interface MaterialsServiceOptions {
  readonly database: DatabaseManager;
  readonly authorization: AppAuthorization;
}

/**
 * Reading and maintaining materials, with the caller's own access applied. The HTTP routes and the assistant tool both
 * go through here, so a page and an answer are filtered by exactly the same Policy and can never disagree about which
 * material an identity may see.
 */
export class MaterialsService {
  private readonly options: MaterialsServiceOptions;

  constructor(options: MaterialsServiceOptions) {
    this.options = options;
  }

  /**
   * The authorization context for an actor that did not arrive over HTTP, such as the assistant. It is built the same
   * way the authorization middleware builds one for a request: the principal, the `authenticated` wildcard, and every
   * subject the application knows for that principal.
   */
  async contextFor(actor: MaterialsActor): Promise<AuthorizationContext> {
    const principal = { type: 'user', id: String(actor.id) };
    const subjects = [
      { type: 'authenticated', id: '*' },
      ...(await this.options.authorization.subjects.resolveFor(principal)),
    ];
    return this.options.authorization.for({ principal, subjects });
  }

  async list(
    context: AuthorizationContext,
    input: ListMaterialsInput,
  ): Promise<ListMaterialsResult> {
    const repository = this.repository().withPolicy(
      await this.readPolicy(context),
    );
    const [records, total] = await Promise.all([
      repository.findMany({
        sort: (sort) => sort.field('id').desc(),
        limit: input.limit,
        offset: input.offset,
      }),
      repository.count(),
    ]);
    return { data: records.map(toMaterialView), total };
  }

  async get(
    context: AuthorizationContext,
    id: number,
  ): Promise<MaterialView | undefined> {
    const record = await this.repository()
      .withPolicy(await this.readPolicy(context))
      .findOne({ filter: { id } });
    return record ? toMaterialView(record) : undefined;
  }

  async create(
    context: AuthorizationContext,
    input: MaterialContentInput,
  ): Promise<MaterialView> {
    const policy = await this.writePolicy(context, 'create');
    const now = new Date().toISOString();
    const result = await this.repository()
      .withPolicy(policy)
      .createOne({
        values: {
          title: input.title,
          body: input.body,
          createdAt: now,
          updatedAt: now,
        },
      });
    return toMaterialView(result.record);
  }

  async update(
    context: AuthorizationContext,
    id: number,
    input: MaterialContentInput,
  ): Promise<MaterialView | undefined> {
    const policy = await this.writePolicy(context, 'update');
    const repository = this.repository().withPolicy(policy);
    // Read first so a missing row answers 404 rather than a refused write, and so the check that decides whether the
    // row is visible at all is the same one the pages use.
    if (!(await repository.findOne({ filter: { id } }))) {
      return undefined;
    }
    const result = await repository.updateOne({
      filter: { id },
      values: {
        title: input.title,
        body: input.body,
        updatedAt: new Date().toISOString(),
      },
    });
    return toMaterialView(result.record);
  }

  async remove(context: AuthorizationContext, id: number): Promise<boolean> {
    const policy = await this.writePolicy(context, 'delete');
    const repository = this.repository().withPolicy(policy);
    if (!(await repository.findOne({ filter: { id } }))) {
      return false;
    }
    await repository.deleteOne({ filter: { id } });
    return true;
  }

  private repository(): Repository<MaterialRecord> {
    return this.options.database.repository<MaterialRecord>(
      MATERIALS_COLLECTION,
    );
  }

  /**
   * What this identity may read. `view` is the composite action that carries the record-access scope, so a colleague
   * receives a Policy whose `read` node only matches the materials they were granted.
   */
  private async readPolicy(
    context: AuthorizationContext,
  ): Promise<RepositoryPolicy<MaterialRecord>> {
    const policy = await this.decide(context, 'view');
    if (policy.read === false) {
      throw this.denied(
        'READ_FORBIDDEN',
        'Reading materials is forbidden by Policy.',
      );
    }
    return policy;
  }

  /**
   * What this identity may maintain, with the read node taken from `view` when `manage` does not carry one. db refuses
   * any write whose Policy cannot read the row back, so a write Policy has to state a valid read node; the write itself
   * is still gated by this operation's own node.
   */
  private async writePolicy(
    context: AuthorizationContext,
    operation: 'create' | 'update' | 'delete',
  ): Promise<RepositoryPolicy<MaterialRecord>> {
    const view = await this.readPolicy(context);
    const manage = await this.decide(context, 'manage');
    if (manage[operation] === false) {
      throw this.denied(
        'WRITE_FORBIDDEN',
        'Maintaining materials is forbidden by Policy.',
      );
    }
    return {
      ...manage,
      read: manage.read === false ? view.read : manage.read,
    };
  }

  /**
   * Resolves one composite action. A `permit` with no conditions means the identity is unrestricted, so every
   * operation is allowed; otherwise the database plugin left one full Repository Policy per collection.
   */
  private async decide(
    context: AuthorizationContext,
    action: 'view' | 'manage',
  ): Promise<RepositoryPolicy<MaterialRecord>> {
    const decision = await context.authorize({
      resource: { type: 'composite' as const, id: MATERIALS_COLLECTION },
      action,
    });
    if (decision.effect === 'deny') {
      throw new AuthorizationDeniedError(decision);
    }
    const policy = decision.conditions?.database?.[MATERIALS_COLLECTION];
    return policy ?? { read: true, create: true, update: true, delete: true };
  }

  private denied(reason: string, message: string): AuthorizationDeniedError {
    const decision: AuthorizationDecision = {
      effect: 'deny',
      reasons: [{ code: reason, message }],
    };
    return new AuthorizationDeniedError(decision);
  }
}

function toMaterialView(record: Partial<MaterialRecord>): MaterialView {
  return {
    id: Number(record.id),
    title: typeof record.title === 'string' ? record.title : '',
    body: typeof record.body === 'string' ? record.body : '',
    restricted: record.restricted === true,
    createdAt: toIsoString(record.createdAt),
    updatedAt: toIsoString(record.updatedAt),
  };
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === 'string' ? value : '';
}
