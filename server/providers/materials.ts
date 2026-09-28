import type { Application } from '@nocobase/app-server/application';
import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server';
import {
  databaseManagerToken,
  type DatabaseManager,
  type QueryAdapter,
} from '@nocobase/db';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization/server';
import {
  ServiceProvider,
  createServiceToken,
} from '@nocobase/service-provider';

/**
 * The Permission Set that marks a materials manager. Both role markers carry no
 * grants; the service reads them the way the authorization library reads the
 * built-in `root` set — as code-declared identity, not as a permission list.
 * They are seeded in `202609280004_materials_permission_sets` and are assignable
 * from the Users page through the Users plugin's application role scope.
 */
export const MATERIALS_MANAGER_SET = 'materials-manager';
export const MATERIALS_COLLEAGUE_SET = 'materials-colleague';
/** The authorization plugin's unrestricted set, assigned to the application's root account. */
export const ROOT_PERMISSION_SET = 'root';
/** The subject every signed-in user carries, so a default-assigned set counts as effective. */
const AUTHENTICATED_SUBJECT = { type: 'authenticated', id: '*' } as const;

/** Who is asking. Only the identity is needed; roles are resolved from the authorization store. */
export interface MaterialsActor {
  readonly id: string | number;
}

export type MaterialAudience = 'all' | 'manager';

export interface Material {
  readonly id: number;
  readonly slug: string;
  readonly title: string;
  readonly body: string;
  readonly audience: MaterialAudience;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MaterialsOverview {
  readonly materials: readonly Material[];
  /** Whether the actor may edit materials and read manager-only ones. */
  readonly canManage: boolean;
}

export interface MaterialUpdate {
  readonly title?: string;
  readonly body?: string;
}

/** Raised when a non-manager attempts a manager-only operation. */
export class MaterialsForbiddenError extends Error {
  constructor(
    message = 'Only a materials manager may perform this operation.',
  ) {
    super(message);
    this.name = 'MaterialsForbiddenError';
  }
}

/** Raised when a material does not exist, or exists but is not visible to the actor. */
export class MaterialsNotFoundError extends Error {
  constructor(id: string | number) {
    super(`Material "${id}" was not found.`);
    this.name = 'MaterialsNotFoundError';
  }
}

interface MaterialRow {
  readonly id: number | string;
  readonly slug: string;
  readonly title: string;
  readonly body: string;
  readonly audience: string;
  readonly createdAt: Date | string | number;
  readonly updatedAt: Date | string | number;
}

const MATERIAL_COLUMNS = [
  'id',
  'slug',
  'title',
  'body',
  'audience',
  'createdAt',
  'updatedAt',
] as const;

function toIso(value: Date | string | number): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function toMaterial(row: MaterialRow): Material {
  return {
    id: Number(row.id),
    slug: row.slug,
    title: row.title,
    body: row.body,
    audience: row.audience === 'manager' ? 'manager' : 'all',
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

const CJK_RUN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/gu;
const WORD = /[a-z0-9][a-z0-9._-]*/gu;

/**
 * The words and character n-grams a question is searched by.
 *
 * A question rarely contains a material's sentence verbatim, and Chinese has no
 * spaces to split on, so both Latin words and 2-4 character CJK n-grams are
 * used as candidate terms. Recall matters more than precision here: the model
 * receives the matching materials and picks the relevant part, and the
 * visibility filter has already run.
 */
export function extractSearchTerms(query: string): readonly string[] {
  const normalized = query.toLowerCase();
  const terms = new Set<string>();

  for (const word of normalized.match(WORD) ?? []) {
    terms.add(word);
  }

  for (const run of normalized.match(CJK_RUN) ?? []) {
    const longest = Math.min(4, run.length);
    for (let length = longest; length >= 2; length -= 1) {
      for (let start = 0; start + length <= run.length; start += 1) {
        terms.add(run.slice(start, start + length));
      }
    }
  }

  return [...terms];
}

function scoreMaterial(material: Material, terms: readonly string[]): number {
  const title = material.title.toLowerCase();
  const body = material.body.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (title.includes(term)) {
      score += term.length > 1 ? 4 : 1;
    }
    if (body.includes(term)) {
      score += 1;
    }
  }
  return score;
}

/**
 * The materials feature's domain logic: who may see and change which material.
 *
 * It is the single place the rule lives. The API route and the assistant tool
 * both go through it, so a material that is invisible on the page cannot become
 * answerable through the assistant, and a query the model writes cannot widen
 * what it sees. The `materials` collection is deliberately not registered with
 * the authorization database plugin, so no generic data tool can reach it
 * either.
 */
export class MaterialsService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly authorization: AppAuthorization,
  ) {}

  private get query(): QueryAdapter {
    return this.database.query();
  }

  /**
   * Roles come from the authorization store, never from a session field: the
   * session carries no roles, and an administrator may change an assignment
   * between two requests.
   */
  async isManager(actor: MaterialsActor): Promise<boolean> {
    const permissionSets = await this.authorization.permissionSets.getEffective(
      {
        principal: { type: 'user', id: String(actor.id) },
        subjects: [AUTHENTICATED_SUBJECT],
      },
    );
    return permissionSets.some(
      (set) =>
        set.key === MATERIALS_MANAGER_SET || set.key === ROOT_PERMISSION_SET,
    );
  }

  /** Everything the actor may read, oldest first, in the order the page lists them. */
  async listFor(actor: MaterialsActor): Promise<MaterialsOverview> {
    const canManage = await this.isManager(actor);
    let statement = this.query
      .selectFrom('materials')
      .select([...MATERIAL_COLUMNS])
      .orderBy('id', 'asc');

    if (!canManage) {
      statement = statement.where('audience', '=', 'all');
    }

    const rows = await statement.execute<MaterialRow>();
    return { materials: rows.map(toMaterial), canManage };
  }

  /**
   * One material, or `undefined` when it does not exist or is manager-only and
   * the actor is not a manager. The two cases are deliberately indistinguishable
   * to the caller that is not allowed to see it.
   */
  async getFor(
    actor: MaterialsActor,
    id: string | number,
  ): Promise<Material | undefined> {
    const numericId = Number(id);
    if (!Number.isInteger(numericId)) {
      return undefined;
    }

    const row = await this.query
      .selectFrom('materials')
      .select([...MATERIAL_COLUMNS])
      .where('id', '=', numericId)
      .limit(1)
      .executeTakeFirst<MaterialRow>();

    if (!row) {
      return undefined;
    }

    const material = toMaterial(row);
    if (material.audience === 'manager' && !(await this.isManager(actor))) {
      return undefined;
    }

    return material;
  }

  /** Manager-only. Throws {@link MaterialsForbiddenError} for anyone else. */
  async updateFor(
    actor: MaterialsActor,
    id: string | number,
    input: MaterialUpdate,
  ): Promise<Material> {
    if (!(await this.isManager(actor))) {
      throw new MaterialsForbiddenError();
    }

    const existing = await this.getFor(actor, id);
    if (!existing) {
      throw new MaterialsNotFoundError(id);
    }

    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (input.title !== undefined) {
      values.title = requireText(input.title, 'title');
    }
    if (input.body !== undefined) {
      values.body = requireText(input.body, 'body');
    }

    await this.query
      .updateTable('materials')
      .set(values)
      .where('id', '=', existing.id)
      .execute();

    const updated = await this.getFor(actor, existing.id);
    // The row was just written by this call, so it cannot have disappeared.
    return updated ?? existing;
  }

  /**
   * The read-only search behind the assistant tool. It applies the same
   * visibility rule as the page before scoring, so an inaccessible material is
   * never a candidate and its text never reaches the model.
   */
  async search(
    actor: MaterialsActor,
    query: string,
    options: { readonly limit?: number } = {},
  ): Promise<readonly Material[]> {
    const terms = extractSearchTerms(query);
    if (terms.length === 0) {
      return [];
    }

    const canManage = await this.isManager(actor);
    let statement = this.query
      .selectFrom('materials')
      .select([...MATERIAL_COLUMNS])
      .orderBy('id', 'asc');

    if (!canManage) {
      statement = statement.where('audience', '=', 'all');
    }

    const rows = await statement.execute<MaterialRow>();
    const limit = Math.min(Math.max(options.limit ?? 5, 1), 20);

    return rows
      .map(toMaterial)
      .map((material) => ({ material, score: scoreMaterial(material, terms) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.material.id - b.material.id)
      .slice(0, limit)
      .map((entry) => entry.material);
  }
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`Material ${field} must be a non-empty string.`);
  }
  return value.trim();
}

export const materialsServiceToken =
  createServiceToken<MaterialsService>('materials-service');

export class MaterialsServiceProvider extends ServiceProvider<Application> {
  readonly name = '@nb3-factory/materials';

  register(): void {
    this.app.container.singleton(
      materialsServiceToken,
      (resolver) =>
        new MaterialsService(
          resolver.resolve(databaseManagerToken),
          resolver.resolve(authorizationToken),
        ),
    );
  }

  /**
   * Registers the assistant and its tool once the AI employee plugin has booted
   * and its own resources exist. The AI plugin resolves and initializes its
   * manager in its own `boot`, and every provider boots before any provider
   * starts, so the manager is ready here.
   */
  async boot(): Promise<void> {
    if (!this.app.container.has(aiManagerToken)) {
      return;
    }

    // Loaded lazily on purpose. The AI resources import this module for its
    // service token, so a top-level import here would close an import cycle:
    // the tool list would be built before it, and the assistant would register
    // an empty tool. `boot` runs after the AI plugin registered its manager.
    const { registerMaterialsAIResources } = await import('../ai/index.js');
    await registerMaterialsAIResources(
      this.app.container.resolve(aiManagerToken),
    );
  }
}
