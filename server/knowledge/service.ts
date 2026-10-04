import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseManager, RepositoryPolicy } from '@nocobase/db';
import { createServiceToken } from '@nocobase/service-provider';
import {
  KNOWLEDGE_MATERIALS_COLLECTION,
  KNOWLEDGE_MATERIALS_RESOURCE,
  type KnowledgeMaterial,
} from './resources.js';

/** What the assistant may read, and what a page may display. Never a row the caller may not see. */
export interface KnowledgeMaterialView {
  id: string;
  title: string;
  content: string;
}

/** The service token the AI tool and any future reader binds to. */
export const knowledgeServiceToken =
  createServiceToken<KnowledgeService>('knowledge-service');

/**
 * Reads materials through the actor's own authorization scope.
 *
 * The page and the assistant must agree about which materials a person may see. Both go through the same stored
 * grants: the page through the generated Repository routes, this service through `authz.for(actor)`, and both apply
 * the resolved database policy with `withPolicy`. The assistant therefore cannot be told to reveal a material the
 * page refuses, and a supervisor's edit reaches the next answer because there is no second copy of the text.
 *
 * A service never sees a Hono context, so the caller passes the actor id it already authenticated.
 */
export class KnowledgeService {
  constructor(
    private readonly authorization: AppAuthorization,
    private readonly database: DatabaseManager,
  ) {}

  /**
   * The policy in force for one actor reading the materials Collection.
   *
   * `undefined` means the actor may not read materials at all, which is different from an empty list.
   */
  private async readPolicy(
    actorId: string,
  ): Promise<RepositoryPolicy | undefined> {
    const principal = { type: 'user', id: actorId };
    const identity = {
      principal,
      subjects: await this.authorization.subjects.resolveFor(principal),
    };
    const decision = await this.authorization.for(identity).authorize({
      resource: { type: 'composite', id: KNOWLEDGE_MATERIALS_RESOURCE },
      action: 'view',
    });
    if (decision.effect === 'deny') return undefined;
    return decision.conditions?.database?.[KNOWLEDGE_MATERIALS_COLLECTION];
  }

  /**
   * Every material one actor may read, in a stable order.
   *
   * The scope is applied by the database, not filtered here, so a material the actor may not see never leaves it.
   */
  async visibleMaterials(actorId: string): Promise<KnowledgeMaterialView[]> {
    const policy = await this.readPolicy(actorId);
    if (!policy || policy.read === false) return [];
    const scoped = this.database
      .repository<KnowledgeMaterial>(KNOWLEDGE_MATERIALS_COLLECTION)
      .withPolicy(policy);
    const rows = await scoped.findMany({ limit: 200 });
    return rows
      .map((row) => toView(row))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  /** One readable material by identifier, or `undefined` when it is not in the actor's scope. */
  async visibleMaterial(
    actorId: string,
    id: string,
  ): Promise<KnowledgeMaterialView | undefined> {
    return (await this.visibleMaterials(actorId)).find(
      (material) => material.id === id,
    );
  }
}

function toView(row: Partial<KnowledgeMaterial>): KnowledgeMaterialView {
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    content: String(row.content ?? ''),
  };
}
