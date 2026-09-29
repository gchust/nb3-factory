import type {
  AuthorizationContext,
  AuthorizationIdentity,
} from '@nocobase/authorization/core';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import { createServiceToken } from '@nocobase/service-provider';
import type {
  DatabaseManager,
  Repository,
  RepositoryPolicy,
} from '@nocobase/db';

import {
  DATABASE_CONNECTION,
  MATERIALS_COLLECTION,
  toMaterialDto,
  type MaterialDto,
} from './constants.js';
import { MATERIALS_DIRECTORY, type Material } from './resources.js';

export const materialsServiceToken = createServiceToken<MaterialsService>(
  'nb3-factory/materials-service',
);

export interface MaterialsPageRequest {
  readonly limit?: number;
  readonly offset?: number;
}

export interface MaterialWriteValues {
  title: string;
  content: string;
}

/** The actor shape the AI runtime hands to a tool. */
export interface MaterialsActor {
  id: string | number;
  roles?: readonly string[];
  isRoot?: boolean;
}

export interface MaterialsServiceDeps {
  databaseManager: DatabaseManager;
  authz: AppAuthorization;
}

export class MaterialsNotPermittedError extends Error {
  constructor(operation: string) {
    super(`The current identity may not ${operation} materials`);
    this.name = 'MaterialsNotPermittedError';
  }
}

/**
 * Domain logic behind the materials API and the assistant tool. It never sees
 * a Hono context or an HTTP status code: callers translate its answers.
 */
export class MaterialsService {
  private readonly databaseManager: DatabaseManager;
  private readonly authz: AppAuthorization;

  constructor(deps: MaterialsServiceDeps) {
    this.databaseManager = deps.databaseManager;
    this.authz = deps.authz;
  }

  /** Rebuilds the identity the authorization middleware would have built. */
  async identityForActor(
    actor: MaterialsActor,
  ): Promise<AuthorizationIdentity> {
    const principal = { type: 'user', id: String(actor.id) };
    const subjects = [
      { type: 'authenticated', id: '*' },
      ...(await this.authz.subjects.resolveFor(principal)),
    ];
    return { principal, subjects };
  }

  async contextForActor(actor: MaterialsActor): Promise<AuthorizationContext> {
    const identity = await this.identityForActor(actor);
    return this.authz.for(identity);
  }

  /**
   * The read policy a `view` decision yields. `read: false` means the identity
   * has no view grant at all.
   */
  viewPolicy(context: AuthorizationContext): Promise<RepositoryPolicy> {
    return this.authz.database.policyFor(MATERIALS_COLLECTION, context, {
      resource: MATERIALS_DIRECTORY,
      action: 'view',
    });
  }

  /** The full policy a `manage` decision yields. */
  managePolicy(context: AuthorizationContext): Promise<RepositoryPolicy> {
    return this.authz.database.policyFor(MATERIALS_COLLECTION, context, {
      resource: MATERIALS_DIRECTORY,
      action: 'manage',
    });
  }

  /** Binds the resolved policy to the materials Repository. */
  repository(policy: RepositoryPolicy): Repository<Material> {
    return this.databaseManager
      .repository<Material>(MATERIALS_COLLECTION, DATABASE_CONNECTION)
      .withPolicy(
        policy as RepositoryPolicy<Material>,
      ) as unknown as Repository<Material>;
  }

  async list(
    context: AuthorizationContext,
    request: MaterialsPageRequest = {},
  ): Promise<readonly MaterialDto[]> {
    const policy = await this.viewPolicy(context);
    if (policy.read === false) {
      return [];
    }
    const records = await this.repository(policy).findMany({
      sort: (sort) => [sort.field('id').asc()],
      limit: request.limit ?? 100,
      ...(request.offset ? { offset: request.offset } : {}),
    });
    return records.map(toMaterialDto);
  }

  async get(
    context: AuthorizationContext,
    id: number,
  ): Promise<MaterialDto | undefined> {
    const policy = await this.viewPolicy(context);
    if (policy.read === false) {
      return undefined;
    }
    const record = await this.repository(policy).findOne({
      filter: { id },
    });
    return record ? toMaterialDto(record) : undefined;
  }

  async create(
    context: AuthorizationContext,
    values: MaterialWriteValues,
  ): Promise<MaterialDto> {
    const policy = await this.managePolicy(context);
    if (policy.create === false) {
      throw new MaterialsNotPermittedError('create');
    }
    const now = new Date();
    const { record } = await this.repository(policy).createOne({
      values: {
        title: values.title,
        content: values.content,
        confidential: false,
        createdAt: now,
        updatedAt: now,
      },
    });
    return toMaterialDto(record);
  }

  async update(
    context: AuthorizationContext,
    id: number,
    values: MaterialWriteValues,
  ): Promise<MaterialDto | undefined> {
    const policy = await this.managePolicy(context);
    if (policy.update === false) {
      throw new MaterialsNotPermittedError('update');
    }
    const { record } = await this.repository(policy).updateOne({
      filter: { id },
      values: { ...values, updatedAt: new Date() },
    });
    return record ? toMaterialDto(record) : undefined;
  }

  async remove(context: AuthorizationContext, id: number): Promise<boolean> {
    const policy = await this.managePolicy(context);
    if (policy.delete === false) {
      throw new MaterialsNotPermittedError('delete');
    }
    const result = await this.repository(policy).deleteOne({
      filter: { id },
    });
    return result.deleted === true;
  }

  /**
   * Idempotently gives a freshly created test account its permission set. The
   * caller must not call this for an account that already existed, so an
   * administrator's later assignment changes are never overwritten.
   */
  async assignPermissionSet(
    permissionSet: string,
    userId: string,
  ): Promise<void> {
    await this.authz.permissionSets.assign({
      subject: { type: 'user', id: userId },
      permissionSet,
    });
  }
}
