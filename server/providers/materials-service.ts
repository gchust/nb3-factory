import {
  type Authorization,
  type AuthorizationContext,
} from '@nocobase/app-plugin-authorization/server';
import { AuthorizationDeniedError } from '@nocobase/authorization/core';
import type { DatabaseManager, RepositoryPolicy } from '@nocobase/db';
import { createServiceToken } from '@nocobase/service-provider';

import {
  MATERIALS_COLLECTION,
  MATERIALS_RESOURCE,
} from '../materials/declaration.js';

/** The App container key the assistant tool and the routes both resolve. */
export const materialsServiceToken =
  createServiceToken<MaterialsService>('materials');

/** The little of an actor an assistant tool call carries into the service. */
export interface MaterialsActor {
  id: string | number;
}

/** One material as the page and the assistant read it. */
export interface MaterialRecord {
  id: string | number;
  title: string;
  body: string;
  confidential: boolean;
  createdAt: string | Date;
}

export interface MaterialsListResult {
  data: MaterialRecord[];
  meta: { page: number; pageSize: number; total: number };
}

export interface ListMaterialsInput {
  q?: string;
  page?: number;
  pageSize?: number;
}

/** The only fields a material edit may change. */
export interface MaterialPatch {
  title?: string;
  body?: string;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * Reads and edits `materials` through the authorization model declared in
 * `server/materials/declaration.ts`.
 *
 * The service never queries a repository without first turning the caller's
 * `view`/`edit` decision into a bound policy. A route hands it the request's
 * `AuthorizationContext`; a tool call, which has no request, builds the same
 * scope from the actor with {@link contextForActor}. That is why a question the
 * assistant answers can only draw on materials the asker may open.
 */
export class MaterialsService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly authz: Authorization,
  ) {}

  /**
   * The authorization scope of a tool call. Reproduces what the authorization
   * middleware would add for a request: the user principal, `authenticated:*`
   * and every membership the authorization service resolves for the user.
   */
  async contextForActor(actor: MaterialsActor): Promise<AuthorizationContext> {
    const principal = { type: 'user', id: String(actor.id) };
    return this.authz.for({
      principal,
      subjects: [
        { type: 'authenticated', id: '*' },
        ...(await this.authz.subjects.resolveFor(principal)),
      ],
    });
  }

  /** The bound read policy, or a 403 when the caller may not view materials. */
  private async readPolicy(
    context: AuthorizationContext,
  ): Promise<RepositoryPolicy> {
    const decision = await context.authorize({
      resource: { type: 'composite', id: MATERIALS_RESOURCE },
      action: 'view',
    });
    const policy = decision.conditions?.database?.[MATERIALS_COLLECTION];
    if (decision.effect === 'deny' || !policy?.read) {
      throw new AuthorizationDeniedError(decision);
    }
    return policy;
  }

  /** The bound read-and-update policy, or a 403 when the caller may not edit. */
  private async editPolicy(
    context: AuthorizationContext,
  ): Promise<RepositoryPolicy> {
    const decision = await context.authorize({
      resource: { type: 'composite', id: MATERIALS_RESOURCE },
      action: 'edit',
    });
    const policy = decision.conditions?.database?.[MATERIALS_COLLECTION];
    if (decision.effect === 'deny' || !policy?.update) {
      throw new AuthorizationDeniedError(decision);
    }
    return policy;
  }

  /** One page of the materials the caller may read, newest first. */
  async list(
    context: AuthorizationContext,
    input: ListMaterialsInput = {},
  ): Promise<MaterialsListResult> {
    const policy = await this.readPolicy(context);
    const page = input.page && input.page > 0 ? input.page : 1;
    const pageSize = Math.min(
      input.pageSize && input.pageSize > 0 ? input.pageSize : DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );
    const repository = this.database
      .repository(MATERIALS_COLLECTION)
      .withPolicy(policy);
    const search = input.q?.trim();

    const records = (await repository.findMany({
      filter: search
        ? (f) =>
            f.or([
              f.string('title').includes(search),
              f.text('body').includes(search),
            ])
        : undefined,
      sort: (sort) => sort.field('createdAt').desc(),
      limit: pageSize,
      offset: (page - 1) * pageSize,
    })) as unknown as MaterialRecord[];

    const total = await repository.count({
      filter: search
        ? (f) =>
            f.or([
              f.string('title').includes(search),
              f.text('body').includes(search),
            ])
        : undefined,
    });

    return { data: records, meta: { page, pageSize, total } };
  }

  /** One material the caller may read, or `undefined` when none is visible. */
  async get(
    context: AuthorizationContext,
    id: string,
  ): Promise<MaterialRecord | undefined> {
    const policy = await this.readPolicy(context);
    const record = await this.database
      .repository(MATERIALS_COLLECTION)
      .withPolicy(policy)
      .findOne({ filter: { id: materialKey(id) } });
    return (record as unknown as MaterialRecord | undefined) ?? undefined;
  }

  /** Changes the content of one material the caller may edit. */
  async update(
    context: AuthorizationContext,
    id: string,
    patch: MaterialPatch,
  ): Promise<MaterialRecord> {
    const policy = await this.editPolicy(context);
    const values: Record<string, string> = {};
    if (patch.title !== undefined) values.title = patch.title;
    if (patch.body !== undefined) values.body = patch.body;
    const { record } = await this.database
      .repository(MATERIALS_COLLECTION)
      .withPolicy(policy)
      .updateOne({ filter: { id: materialKey(id) }, values });
    return record as unknown as MaterialRecord;
  }
}

/**
 * An integer primary key arrives from the URL as a string. Matching it as a
 * number keeps the filter valid on databases that will not compare a text
 * parameter with an integer column, such as PostgreSQL.
 */
function materialKey(id: string): string | number {
  return /^\d+$/.test(id) ? Number(id) : id;
}
