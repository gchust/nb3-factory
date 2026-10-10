import type { DatabaseManager } from '@nocobase/db';

/**
 * Domain logic for the internal document library (资料库).
 *
 * HTTP lives in `server/routes/materials.ts`; this module decides who may read,
 * write and share a document, and persists the result. Keeping the access
 * decision here makes it testable without a server.
 */

export interface MaterialRow {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly ownerId: string;
  readonly published: boolean;
  readonly confidential: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MaterialListItem extends MaterialRow {
  readonly ownerName: string;
  readonly canEdit: boolean;
  /** The document is open to the current user through a temporary single-document share. */
  readonly shared: boolean;
}

export interface MaterialShare {
  readonly userId: string;
  readonly userName: string;
  readonly createdAt: string;
}

export interface MaterialDetail extends MaterialListItem {
  /** Whether the current user may manage sharing. Administrators only. */
  readonly canShare: boolean;
  /** Who the document is temporarily open to. Present for administrators only. */
  readonly shares: readonly MaterialShare[];
}

export interface MaterialListResult {
  readonly items: readonly MaterialListItem[];
  /** Whether the current user may create a document. */
  readonly canCreate: boolean;
}

export interface MaterialInput {
  readonly title: string;
  readonly content: string;
  readonly published: boolean;
  readonly confidential: boolean;
}

export interface MaterialViewer {
  readonly userId: string;
  readonly isRoot: boolean;
  readonly isCurator: boolean;
  readonly isReader: boolean;
}

export class MaterialError extends Error {
  constructor(
    readonly reason:
      | 'MATERIAL_NOT_FOUND'
      | 'MATERIAL_FORBIDDEN'
      | 'MATERIAL_INVALID_INPUT'
      | 'SHARE_NOT_FOUND'
      | 'SHARE_TARGET_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'MaterialError';
  }
}

const CURATOR_SET = 'curator';
const READER_SET = 'reader';
const ROOT_SET = 'root';

function asBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return '';
}

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') {
    return new Date(Number(value)).toISOString();
  }
  return '';
}

function toMaterial(row: Record<string, unknown>): MaterialRow {
  return {
    id: asText(row.id),
    title: asText(row.title),
    content: asText(row.content),
    ownerId: asText(row.ownerId),
    published: asBoolean(row.published),
    confidential: asBoolean(row.confidential),
    createdAt: asIso(row.createdAt),
    updatedAt: asIso(row.updatedAt),
  };
}

/**
 * A document is readable when the viewer is the owner or the root
 * administrator, or when it is published, not confidential, and the viewer
 * holds a reading role, or when an administrator opened this single document to
 * them. Confidentiality is checked before the share so a share can never expose
 * a confidential document, and a share never widens access to another document.
 */
export function canReadMaterial(
  material: Pick<MaterialRow, 'ownerId' | 'published' | 'confidential'>,
  viewer: MaterialViewer,
  shared: boolean,
): boolean {
  if (viewer.isRoot) return true;
  if (material.ownerId === viewer.userId) return true;
  if (material.confidential) return false;
  if (shared) return true;
  return material.published && (viewer.isReader || viewer.isCurator);
}

/** Reading never implies editing: only the owner, and only a curator, may write. */
export function canWriteMaterial(
  material: Pick<MaterialRow, 'ownerId'>,
  viewer: MaterialViewer,
): boolean {
  if (viewer.isRoot) return true;
  return viewer.isCurator && material.ownerId === viewer.userId;
}

export interface MaterialService {
  list(userId: string): Promise<MaterialListResult>;
  get(userId: string, materialId: string): Promise<MaterialDetail>;
  create(userId: string, input: MaterialInput): Promise<MaterialDetail>;
  update(
    userId: string,
    materialId: string,
    input: Partial<MaterialInput>,
  ): Promise<MaterialDetail>;
  remove(userId: string, materialId: string): Promise<void>;
  listShares(
    userId: string,
    materialId: string,
  ): Promise<readonly MaterialShare[]>;
  addShare(
    userId: string,
    materialId: string,
    targetUserId: string,
  ): Promise<MaterialShare>;
  removeShare(
    userId: string,
    materialId: string,
    targetUserId: string,
  ): Promise<void>;
}

type Query = ReturnType<DatabaseManager['query']>;

async function loadViewer(
  query: Query,
  userId: string,
): Promise<MaterialViewer> {
  const rows = await query
    .selectFrom('authorizationPermissionSetAssignments')
    .select('permissionSetKey')
    .where('subjectType', '=', 'user')
    .where('subjectId', '=', userId)
    .execute();
  const keys = new Set(rows.map((row) => asText(row.permissionSetKey)));
  return {
    userId,
    isRoot: keys.has(ROOT_SET),
    isCurator: keys.has(CURATOR_SET),
    isReader: keys.has(READER_SET),
  };
}

async function userNameById(
  query: Query,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)].filter((id) => id.length > 0);
  if (unique.length === 0) return new Map();
  const rows = await query
    .selectFrom('user')
    .select(['id', 'name', 'username'])
    .where('id', 'in', unique)
    .execute();
  const names = new Map<string, string>();
  for (const row of rows) {
    const id = asText(row.id);
    const name = asText(row.name) || asText(row.username) || id;
    names.set(id, name);
  }
  return names;
}

async function sharedMaterialIds(
  query: Query,
  userId: string,
): Promise<Set<string>> {
  const rows = await query
    .selectFrom('materialShares')
    .select('materialId')
    .where('userId', '=', userId)
    .execute();
  return new Set(rows.map((row) => asText(row.materialId)));
}

async function loadMaterial(
  query: Query,
  materialId: string,
): Promise<MaterialRow | undefined> {
  const row = await query
    .selectFrom('materials')
    .selectAll()
    .where('id', '=', materialId)
    .executeTakeFirst();
  return row ? toMaterial(row) : undefined;
}

async function requireReadable(
  query: Query,
  viewer: MaterialViewer,
  materialId: string,
): Promise<MaterialRow> {
  const material = await loadMaterial(query, materialId);
  const shares = material
    ? await sharedMaterialIds(query, viewer.userId)
    : new Set<string>();
  if (
    !material ||
    !canReadMaterial(material, viewer, shares.has(material.id))
  ) {
    // A missing document and one the viewer may not read answer the same way,
    // so an unshared draft does not reveal that it exists.
    throw new MaterialError('MATERIAL_NOT_FOUND', 'Material not found.');
  }
  return material;
}

async function requireWritable(
  query: Query,
  viewer: MaterialViewer,
  materialId: string,
): Promise<MaterialRow> {
  const material = await loadMaterial(query, materialId);
  if (!material) {
    throw new MaterialError('MATERIAL_NOT_FOUND', 'Material not found.');
  }
  if (!canWriteMaterial(material, viewer)) {
    throw new MaterialError(
      'MATERIAL_FORBIDDEN',
      'You may not edit this material.',
    );
  }
  return material;
}

function normalizeInput(input: MaterialInput): MaterialInput {
  const title = input.title.trim();
  if (title.length === 0 || title.length > 255) {
    throw new MaterialError(
      'MATERIAL_INVALID_INPUT',
      'Title is required and must be at most 255 characters.',
    );
  }
  return {
    title,
    content: input.content ?? '',
    published: Boolean(input.published),
    confidential: Boolean(input.confidential),
  };
}

export function createMaterialService(
  database: DatabaseManager,
): MaterialService {
  const query = database.query();

  async function present(
    viewer: MaterialViewer,
    material: MaterialRow,
    shared: boolean,
    shares: readonly MaterialShare[],
  ): Promise<MaterialDetail> {
    const names = await userNameById(query, [material.ownerId]);
    return {
      ...material,
      ownerName: names.get(material.ownerId) ?? material.ownerId,
      canEdit: canWriteMaterial(material, viewer),
      shared,
      canShare: viewer.isRoot,
      shares,
    };
  }

  return {
    async list(userId) {
      const viewer = await loadViewer(query, userId);
      const rows = await query
        .selectFrom('materials')
        .selectAll()
        .orderBy('createdAt', 'asc')
        .execute();
      const materials = rows.map((row) =>
        toMaterial(row as Record<string, unknown>),
      );
      const shares = await sharedMaterialIds(query, userId);
      const names = await userNameById(
        query,
        materials.map((material) => material.ownerId),
      );
      const items = materials
        .filter((material) =>
          canReadMaterial(material, viewer, shares.has(material.id)),
        )
        .map((material) => ({
          ...material,
          ownerName: names.get(material.ownerId) ?? material.ownerId,
          canEdit: canWriteMaterial(material, viewer),
          shared: shares.has(material.id),
        }));
      return { items, canCreate: viewer.isRoot || viewer.isCurator };
    },

    async get(userId, materialId) {
      const viewer = await loadViewer(query, userId);
      const material = await requireReadable(query, viewer, materialId);
      const shared = (await sharedMaterialIds(query, userId)).has(material.id);
      const shares = viewer.isRoot ? await listShares(query, material.id) : [];
      return present(viewer, material, shared, shares);
    },

    async create(userId, input) {
      const viewer = await loadViewer(query, userId);
      if (!viewer.isRoot && !viewer.isCurator) {
        throw new MaterialError(
          'MATERIAL_FORBIDDEN',
          'Only a curator may create materials.',
        );
      }
      const value = normalizeInput(input);
      const now = new Date();
      const material: MaterialRow = {
        id: crypto.randomUUID(),
        ...value,
        ownerId: userId,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      await query
        .insertInto('materials')
        .values({
          id: material.id,
          title: material.title,
          content: material.content,
          ownerId: material.ownerId,
          published: material.published,
          confidential: material.confidential,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      return present(viewer, material, false, []);
    },

    async update(userId, materialId, input) {
      const viewer = await loadViewer(query, userId);
      const material = await requireWritable(query, viewer, materialId);
      const next = normalizeInput({
        title: input.title ?? material.title,
        content: input.content ?? material.content,
        published: input.published ?? material.published,
        confidential: input.confidential ?? material.confidential,
      });
      const now = new Date();
      await query
        .updateTable('materials')
        .set({
          title: next.title,
          content: next.content,
          published: next.published,
          confidential: next.confidential,
          updatedAt: now,
        })
        .where('id', '=', materialId)
        .execute();
      const updated: MaterialRow = {
        ...material,
        ...next,
        updatedAt: now.toISOString(),
      };
      const shared = (await sharedMaterialIds(query, userId)).has(material.id);
      const shares = viewer.isRoot ? await listShares(query, material.id) : [];
      return present(viewer, updated, shared, shares);
    },

    async remove(userId, materialId) {
      const viewer = await loadViewer(query, userId);
      await requireWritable(query, viewer, materialId);
      await query
        .deleteFrom('materialShares')
        .where('materialId', '=', materialId)
        .execute();
      await query
        .deleteFrom('materials')
        .where('id', '=', materialId)
        .execute();
    },

    async listShares(userId, materialId) {
      const viewer = await loadViewer(query, userId);
      if (!viewer.isRoot) {
        throw new MaterialError(
          'MATERIAL_FORBIDDEN',
          'Only an administrator may manage sharing.',
        );
      }
      const material = await loadMaterial(query, materialId);
      if (!material) {
        throw new MaterialError('MATERIAL_NOT_FOUND', 'Material not found.');
      }
      return listShares(query, material.id);
    },

    async addShare(userId, materialId, targetUserId) {
      const viewer = await loadViewer(query, userId);
      if (!viewer.isRoot) {
        throw new MaterialError(
          'MATERIAL_FORBIDDEN',
          'Only an administrator may manage sharing.',
        );
      }
      const material = await loadMaterial(query, materialId);
      if (!material) {
        throw new MaterialError('MATERIAL_NOT_FOUND', 'Material not found.');
      }
      const target = await query
        .selectFrom('user')
        .select(['id', 'name', 'username'])
        .where('id', '=', targetUserId)
        .executeTakeFirst();
      if (!target) {
        throw new MaterialError(
          'SHARE_TARGET_NOT_FOUND',
          'The selected user does not exist.',
        );
      }
      const existing = await query
        .selectFrom('materialShares')
        .select('id')
        .where('materialId', '=', materialId)
        .where('userId', '=', targetUserId)
        .executeTakeFirst();
      const now = new Date();
      if (!existing) {
        await query
          .insertInto('materialShares')
          .values({
            id: crypto.randomUUID(),
            materialId,
            userId: targetUserId,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }
      return {
        userId: targetUserId,
        userName:
          asText(target.name) || asText(target.username) || targetUserId,
        createdAt: now.toISOString(),
      };
    },

    async removeShare(userId, materialId, targetUserId) {
      const viewer = await loadViewer(query, userId);
      if (!viewer.isRoot) {
        throw new MaterialError(
          'MATERIAL_FORBIDDEN',
          'Only an administrator may manage sharing.',
        );
      }
      const deleted = await query
        .deleteFrom('materialShares')
        .where('materialId', '=', materialId)
        .where('userId', '=', targetUserId)
        .execute();
      if ((deleted.deletedCount ?? 0) === 0) {
        throw new MaterialError(
          'SHARE_NOT_FOUND',
          'That user does not currently have access to this material.',
        );
      }
    },
  };
}

async function listShares(
  query: Query,
  materialId: string,
): Promise<readonly MaterialShare[]> {
  const rows = await query
    .selectFrom('materialShares')
    .select(['userId', 'createdAt'])
    .where('materialId', '=', materialId)
    .orderBy('createdAt', 'asc')
    .execute();
  const names = await userNameById(
    query,
    rows.map((row) => asText(row.userId)),
  );
  return rows.map((row) => {
    const userId = asText(row.userId);
    return {
      userId,
      userName: names.get(userId) ?? userId,
      createdAt: asIso(row.createdAt),
    };
  });
}
