import type { Application } from '@nocobase/app-server/application';
import {
  databaseManagerToken,
  type DatabaseManager,
  type QueryAdapter,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

/** A library work role: `editor` keeps materials, `reader` only reads what is open to them. */
export type LibraryRole = 'editor' | 'reader';

/** Who is asking: their id, whether they are an administrator, and their library role (if they have one). */
export interface LibraryActor {
  readonly userId: string;
  readonly isAdmin: boolean;
  readonly role: LibraryRole | null;
}

export interface LibraryMaterial {
  readonly id: string;
  readonly title: string;
  readonly body: string | null;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly published: boolean;
  readonly confidential: boolean;
  /** Whether the actor is one of the people this material was temporarily shared with. */
  readonly shared: boolean;
  /** Whether the actor may edit or delete it. Reading does not imply writing. */
  readonly writable: boolean;
  /** Whether the actor may manage its shares. Only administrators may. */
  readonly canShare: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface LibraryShare {
  readonly userId: string;
  readonly name: string;
  readonly username: string | null;
  readonly email: string;
  readonly createdAt: string;
}

export interface LibraryMember {
  readonly userId: string;
  readonly name: string;
  readonly username: string | null;
  readonly email: string;
  readonly role: LibraryRole | null;
  readonly disabled: boolean;
  readonly isAdmin: boolean;
}

export interface CreateMaterialInput {
  readonly title: string;
  readonly body?: string | null;
  readonly published?: boolean;
  readonly confidential?: boolean;
}

export type UpdateMaterialInput = Partial<CreateMaterialInput>;

export class LibraryNotFoundError extends Error {
  constructor(
    message = 'The material does not exist or is not visible to you.',
  ) {
    super(message);
    this.name = 'LibraryNotFoundError';
  }
}

export class LibraryForbiddenError extends Error {
  constructor(message = 'You are not allowed to do that.') {
    super(message);
    this.name = 'LibraryForbiddenError';
  }
}

export class LibraryInvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LibraryInvalidInputError';
  }
}

export interface LibraryService {
  /**
   * Resolves the actor. `unrestricted` comes from the request's authorization snapshot, so an administrator the
   * framework already trusts stays an administrator here even if the permission-set assignment row is missing.
   */
  resolveActor(userId: string, unrestricted?: boolean): Promise<LibraryActor>;
  listMaterials(actor: LibraryActor): Promise<LibraryMaterial[]>;
  getMaterial(
    actor: LibraryActor,
    materialId: string,
  ): Promise<LibraryMaterial>;
  createMaterial(
    actor: LibraryActor,
    input: CreateMaterialInput,
  ): Promise<LibraryMaterial>;
  updateMaterial(
    actor: LibraryActor,
    materialId: string,
    input: UpdateMaterialInput,
  ): Promise<LibraryMaterial>;
  deleteMaterial(actor: LibraryActor, materialId: string): Promise<void>;
  listShares(actor: LibraryActor, materialId: string): Promise<LibraryShare[]>;
  shareMaterial(
    actor: LibraryActor,
    materialId: string,
    userId: string,
  ): Promise<LibraryShare[]>;
  unshareMaterial(
    actor: LibraryActor,
    materialId: string,
    userId: string,
  ): Promise<LibraryShare[]>;
  listMembers(actor: LibraryActor): Promise<LibraryMember[]>;
  setMemberRole(
    actor: LibraryActor,
    userId: string,
    role: LibraryRole,
  ): Promise<LibraryMember>;
}

export const libraryServiceToken: ServiceToken<LibraryService> =
  createServiceToken('libraryService');

export function createLibraryService(options: {
  readonly database: DatabaseManager;
}): LibraryService {
  return new DefaultLibraryService(options.database.query());
}

type MaterialRow = {
  id: string;
  reference: string;
  title: string;
  body: string | null;
  ownerId: string;
  published: boolean | number;
  confidential: boolean | number;
  createdAt: Date | string | number;
  updatedAt: Date | string | number;
};

type ShareRow = {
  materialId: string;
  userId: string;
  createdAt: Date | string | number;
};

type UserRow = {
  id: string;
  name: string | null;
  username: string | null;
  email: string | null;
  disabledAt: Date | string | number | null;
};

class DefaultLibraryService implements LibraryService {
  constructor(private readonly query: QueryAdapter) {}

  async resolveActor(
    userId: string,
    unrestricted = false,
  ): Promise<LibraryActor> {
    const [roleRow, adminRow] = await Promise.all([
      this.query
        .selectFrom('libraryMemberRoles')
        .select('role')
        .where('userId', '=', userId)
        .executeTakeFirst(),
      this.query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('subjectType', '=', 'user')
        .where('subjectId', '=', userId)
        .where('permissionSetKey', '=', 'root')
        .executeTakeFirst(),
    ]);

    return {
      userId,
      isAdmin: unrestricted || adminRow !== undefined,
      role: toRole(roleRow?.role),
    };
  }

  async listMaterials(actor: LibraryActor): Promise<LibraryMaterial[]> {
    const rows = await this.query
      .selectFrom('materials')
      .selectAll()
      .orderBy('updatedAt', 'desc')
      .execute<MaterialRow>();
    const shared = await this.sharedMaterialIds(actor.userId);
    const owners = await this.userInfo(rows.map((row) => String(row.ownerId)));
    return rows
      .filter((row) => this.canRead(actor, row, shared))
      .map((row) => this.toMaterial(actor, row, shared, owners));
  }

  async getMaterial(
    actor: LibraryActor,
    materialId: string,
  ): Promise<LibraryMaterial> {
    const row = await this.findMaterialRow(materialId);
    const shared = await this.sharedMaterialIds(actor.userId);
    // A material the actor may not read is reported as missing, so confidentiality does not leak its existence.
    if (!this.canRead(actor, row, shared)) {
      throw new LibraryNotFoundError();
    }
    const owners = await this.userInfo([String(row.ownerId)]);
    return this.toMaterial(actor, row, shared, owners);
  }

  async createMaterial(
    actor: LibraryActor,
    input: CreateMaterialInput,
  ): Promise<LibraryMaterial> {
    if (!actor.isAdmin && actor.role !== 'editor') {
      throw new LibraryForbiddenError(
        'Only a library editor may create a material.',
      );
    }
    const now = new Date();
    const reference = `material-${crypto.randomUUID()}`;
    await this.query
      .insertInto('materials')
      .values({
        id: crypto.randomUUID(),
        reference,
        title: normalizeTitle(input.title),
        body: input.body == null ? null : String(input.body),
        ownerId: actor.userId,
        published: Boolean(input.published),
        confidential: Boolean(input.confidential),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const row = await this.query
      .selectFrom('materials')
      .selectAll()
      .where('reference', '=', reference)
      .executeTakeFirst<MaterialRow>();
    if (!row) throw new LibraryNotFoundError();
    return this.getMaterial(actor, String(row.id));
  }

  async updateMaterial(
    actor: LibraryActor,
    materialId: string,
    input: UpdateMaterialInput,
  ): Promise<LibraryMaterial> {
    const row = await this.findMaterialRow(materialId);
    if (!this.canWrite(actor, row)) {
      throw new LibraryForbiddenError('You may only edit your own materials.');
    }
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.title !== undefined) patch.title = normalizeTitle(input.title);
    if (input.body !== undefined) {
      patch.body = input.body == null ? null : String(input.body);
    }
    if (input.published !== undefined) {
      patch.published = Boolean(input.published);
    }
    if (input.confidential !== undefined) {
      patch.confidential = Boolean(input.confidential);
    }
    await this.query
      .updateTable('materials')
      .set(patch)
      .where('id', '=', materialId)
      .execute();
    return this.getMaterial(actor, materialId);
  }

  async deleteMaterial(actor: LibraryActor, materialId: string): Promise<void> {
    const row = await this.findMaterialRow(materialId);
    if (!this.canWrite(actor, row)) {
      throw new LibraryForbiddenError(
        'You may only delete your own materials.',
      );
    }
    // The shares point at the material, so they go first.
    await this.query
      .deleteFrom('materialShares')
      .where('materialId', '=', materialId)
      .execute();
    await this.query
      .deleteFrom('materials')
      .where('id', '=', materialId)
      .execute();
  }

  async listShares(
    actor: LibraryActor,
    materialId: string,
  ): Promise<LibraryShare[]> {
    this.assertAdmin(actor);
    await this.findMaterialRow(materialId);
    const shares = await this.query
      .selectFrom('materialShares')
      .selectAll()
      .where('materialId', '=', materialId)
      .orderBy('createdAt', 'asc')
      .execute<ShareRow>();
    const users = await this.userInfo(
      shares.map((share) => String(share.userId)),
    );
    return shares.map((share) => {
      const userId = String(share.userId);
      const info = users.get(userId);
      return {
        userId,
        name: info?.name ?? '',
        username: info?.username ?? null,
        email: info?.email ?? '',
        createdAt: toIso(share.createdAt),
      };
    });
  }

  async shareMaterial(
    actor: LibraryActor,
    materialId: string,
    userId: string,
  ): Promise<LibraryShare[]> {
    this.assertAdmin(actor);
    await this.findMaterialRow(materialId);
    const target = await this.query
      .selectFrom('user')
      .select('id')
      .where('id', '=', userId)
      .executeTakeFirst();
    if (!target) throw new LibraryInvalidInputError('Unknown user.');
    const existing = await this.query
      .selectFrom('materialShares')
      .select('id')
      .where('materialId', '=', materialId)
      .where('userId', '=', userId)
      .executeTakeFirst();
    if (!existing) {
      await this.query
        .insertInto('materialShares')
        .values({
          materialId,
          userId,
          grantedById: actor.userId,
          createdAt: new Date(),
        })
        .execute();
    }
    return this.listShares(actor, materialId);
  }

  async unshareMaterial(
    actor: LibraryActor,
    materialId: string,
    userId: string,
  ): Promise<LibraryShare[]> {
    this.assertAdmin(actor);
    await this.findMaterialRow(materialId);
    await this.query
      .deleteFrom('materialShares')
      .where('materialId', '=', materialId)
      .where('userId', '=', userId)
      .execute();
    return this.listShares(actor, materialId);
  }

  async listMembers(actor: LibraryActor): Promise<LibraryMember[]> {
    this.assertAdmin(actor);
    const users = await this.query
      .selectFrom('user')
      .select(['id', 'name', 'username', 'email', 'disabledAt'])
      .where('deletedAt', 'is', null)
      .orderBy('createdAt', 'asc')
      .execute<UserRow>();
    const roles = await this.query
      .selectFrom('libraryMemberRoles')
      .select(['userId', 'role'])
      .execute();
    const roleByUser = new Map(
      roles.map((row) => [String(row.userId), toRole(row.role)]),
    );
    const admins = await this.query
      .selectFrom('authorizationPermissionSetAssignments')
      .select('subjectId')
      .where('subjectType', '=', 'user')
      .where('permissionSetKey', '=', 'root')
      .execute();
    const adminIds = new Set(admins.map((row) => String(row.subjectId)));
    return users.map((user) => this.toMember(user, roleByUser, adminIds));
  }

  async setMemberRole(
    actor: LibraryActor,
    userId: string,
    role: LibraryRole,
  ): Promise<LibraryMember> {
    this.assertAdmin(actor);
    if (role !== 'editor' && role !== 'reader') {
      throw new LibraryInvalidInputError('Unknown library role.');
    }
    const user = await this.query
      .selectFrom('user')
      .select(['id', 'name', 'username', 'email', 'disabledAt'])
      .where('id', '=', userId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst<UserRow>();
    if (!user) throw new LibraryNotFoundError('Unknown user.');

    const now = new Date();
    const existing = await this.query
      .selectFrom('libraryMemberRoles')
      .select('id')
      .where('userId', '=', userId)
      .executeTakeFirst();
    if (existing) {
      await this.query
        .updateTable('libraryMemberRoles')
        .set({ role, updatedAt: now })
        .where('userId', '=', userId)
        .execute();
    } else {
      await this.query
        .insertInto('libraryMemberRoles')
        .values({ userId, role, createdAt: now, updatedAt: now })
        .execute();
    }

    const roles = new Map([[userId, role]]);
    const admins = await this.query
      .selectFrom('authorizationPermissionSetAssignments')
      .select('subjectId')
      .where('subjectType', '=', 'user')
      .where('subjectId', '=', userId)
      .where('permissionSetKey', '=', 'root')
      .execute();
    return this.toMember(
      user,
      roles,
      new Set(admins.map((row) => String(row.subjectId))),
    );
  }

  private assertAdmin(actor: LibraryActor): void {
    if (!actor.isAdmin) {
      throw new LibraryForbiddenError('Only an administrator may do that.');
    }
  }

  private canRead(
    actor: LibraryActor,
    row: MaterialRow,
    shared: ReadonlySet<string>,
  ): boolean {
    if (actor.isAdmin) return true;
    if (String(row.ownerId) === actor.userId) return true;
    // Confidentiality outranks both publication and a share.
    if (row.confidential) return false;
    // Only library members read the published materials.
    if (actor.role === null) return false;
    if (row.published) return true;
    return shared.has(String(row.id));
  }

  private canWrite(actor: LibraryActor, row: MaterialRow): boolean {
    return actor.isAdmin || String(row.ownerId) === actor.userId;
  }

  private toMaterial(
    actor: LibraryActor,
    row: MaterialRow,
    shared: ReadonlySet<string>,
    owners: ReadonlyMap<string, UserInfo>,
  ): LibraryMaterial {
    const ownerId = String(row.ownerId);
    return {
      id: String(row.id),
      title: String(row.title),
      body: row.body == null ? null : String(row.body),
      ownerId,
      ownerName: owners.get(ownerId)?.name ?? '',
      published: Boolean(row.published),
      confidential: Boolean(row.confidential),
      shared: shared.has(String(row.id)),
      writable: this.canWrite(actor, row),
      canShare: actor.isAdmin,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    };
  }

  private toMember(
    user: UserRow,
    roles: ReadonlyMap<string, LibraryRole | null>,
    adminIds: ReadonlySet<string>,
  ): LibraryMember {
    const userId = String(user.id);
    return {
      userId,
      name: user.name == null ? '' : String(user.name),
      username: user.username == null ? null : String(user.username),
      email: user.email == null ? '' : String(user.email),
      role: roles.get(userId) ?? null,
      disabled: user.disabledAt != null,
      isAdmin: adminIds.has(userId),
    };
  }

  private async findMaterialRow(materialId: string): Promise<MaterialRow> {
    if (typeof materialId !== 'string' || materialId === '') {
      throw new LibraryNotFoundError();
    }
    const row = await this.query
      .selectFrom('materials')
      .selectAll()
      .where('id', '=', materialId)
      .executeTakeFirst<MaterialRow>();
    if (!row) throw new LibraryNotFoundError();
    return row;
  }

  private async sharedMaterialIds(userId: string): Promise<Set<string>> {
    const rows = await this.query
      .selectFrom('materialShares')
      .select('materialId')
      .where('userId', '=', userId)
      .execute();
    return new Set(rows.map((row) => String(row.materialId)));
  }

  private async userInfo(
    ids: readonly string[],
  ): Promise<Map<string, UserInfo>> {
    const unique = [...new Set(ids)].filter((id) => id !== '');
    if (unique.length === 0) return new Map();
    const rows = await this.query
      .selectFrom('user')
      .select(['id', 'name', 'username', 'email'])
      .where('id', 'in', unique)
      .execute<UserRow>();
    return new Map(
      rows.map((row) => [
        String(row.id),
        {
          name: row.name == null ? '' : String(row.name),
          username: row.username == null ? null : String(row.username),
          email: row.email == null ? '' : String(row.email),
        },
      ]),
    );
  }
}

interface UserInfo {
  readonly name: string;
  readonly username: string | null;
  readonly email: string;
}

function toRole(value: unknown): LibraryRole | null {
  return value === 'editor' || value === 'reader' ? value : null;
}

function normalizeTitle(value: unknown): string {
  const title = typeof value === 'string' ? value.trim() : '';
  if (title === '') {
    throw new LibraryInvalidInputError('A title is required.');
  }
  if (title.length > 255) {
    throw new LibraryInvalidInputError('The title is too long.');
  }
  return title;
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return new Date(value).toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  return '';
}

export class LibraryProvider extends ServiceProvider<Application> {
  readonly name = 'library';

  register(): void {
    this.app.container.singleton(libraryServiceToken, (container) =>
      createLibraryService({
        database: container.resolve(databaseManagerToken),
      }),
    );
  }
}

export default LibraryProvider;
