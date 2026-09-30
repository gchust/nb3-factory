import type { Application } from '@nocobase/app-server/application';
import {
  authorizationToken,
  type AuthorizationContext,
} from '@nocobase/app-plugin-authorization/server';
import { databaseManagerToken, type RepositoryPolicy } from '@nocobase/db';
import { createServiceToken } from '@nocobase/service-provider';

import { materialsLibrary, type MaterialRow } from './materials-resources.js';

/**
 * The actor an out-of-band caller — an AI tool rather than an HTTP request —
 * asks on behalf of. Only `id` decides the authorization scope; every other
 * field a tool receives is display or routing information.
 */
export interface MaterialActor {
  id: string | number;
}

/** One material as an assistant may cite it. */
export interface MaterialMatch {
  id: number;
  title: string;
  body: string;
  confidential: boolean;
}

/** The container token the agent's lookup tool declares as a dependency. */
export const materialsLookupToken =
  createServiceToken<MaterialsLookupService>('materials-lookup');

/** The composite business operation the lookup authorizes against. */
const MATERIAL_RESOURCE = {
  type: 'composite',
  id: materialsLibrary.reference().name,
} as const;

/** An identity that bypassed grants, such as an administrator. */
const UNRESTRICTED_POLICY = {
  read: true,
  create: false,
  update: false,
  delete: false,
} as unknown as RepositoryPolicy;

/**
 * Reads the materials a given user is allowed to see.
 *
 * This exists because an AI tool call has no HTTP request: there is no
 * `authz` request variable and no authorization middleware. The service builds
 * the same identity the middleware would — the principal plus `authenticated:*`
 * and every membership the authorization registry resolves — authorizes the
 * `view` action, and binds the returned database policy to the Repository. A
 * colleague's read is therefore narrowed in SQL, so a confidential material
 * never enters a tool result, a citation, or an error message.
 */
export class MaterialsLookupService {
  constructor(private readonly app: Application) {}

  /** List every material the actor may read, optionally filtered by text. */
  async list(actor: MaterialActor, query?: string): Promise<MaterialMatch[]> {
    const policy = await this.viewPolicy(actor);
    if (!policy) {
      return [];
    }
    const records = (await this.app.container
      .resolve(databaseManagerToken)
      .repository('materials')
      .withPolicy(policy)
      .findMany({
        sort: (sort) => sort.field('id').asc(),
      })) as unknown as MaterialRow[];

    const visible = records.map((record): MaterialMatch => ({
      id: record.id,
      title: record.title,
      body: record.body,
      confidential: record.confidential,
    }));

    const needle = query?.trim().toLowerCase();
    if (!needle) {
      return visible;
    }
    // The text filter runs after the policy has already excluded what the
    // actor cannot read, so it can never widen the result set.
    return visible.filter(
      (material) =>
        material.title.toLowerCase().includes(needle) ||
        material.body.toLowerCase().includes(needle),
    );
  }

  /**
   * The single `materials` table policy an actor's `view` grant produced, or
   * `null` when the action is denied outright. A granted action with no
   * conditions is an unconditional permit and runs unrestricted.
   */
  private async viewPolicy(
    actor: MaterialActor,
  ): Promise<RepositoryPolicy | null> {
    const authz = this.app.container.resolve(authorizationToken);
    const principal = { type: 'user', id: String(actor.id) };
    // A hand-built context uses exactly the identity it is given, so the
    // memberships an HTTP request would inherit have to be resolved here.
    const context: AuthorizationContext = authz.for({
      principal,
      subjects: [
        { type: 'authenticated', id: '*' },
        ...(await authz.subjects.resolveFor(principal)),
      ],
    });
    const decision = await context.authorize({
      resource: MATERIAL_RESOURCE,
      action: 'view',
    });
    if (decision.effect === 'deny') {
      return null;
    }
    return decision.conditions?.database?.materials ?? UNRESTRICTED_POLICY;
  }
}
