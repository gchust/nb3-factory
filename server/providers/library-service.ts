import type { FileRecord } from '@nocobase/app-plugin-file/server';
import type { DatabaseManager } from '@nocobase/db';
import type { Readable } from 'node:stream';

import {
  DEMO_FILE_CONTENT_TYPE,
  generateDemoFileBuffer,
  type DemoFileKind,
} from './library-demo-files.js';

/** Minimal storage surface the service needs. Structurally satisfied by the app drive manager. */
export interface LibraryDrive {
  use(disk: string): {
    getStream(key: string): Promise<Readable>;
    exists(key: string): Promise<boolean>;
    put(
      key: string,
      contents: Buffer,
      options?: { contentType?: string },
    ): Promise<void>;
    delete(key: string): Promise<void>;
  };
}

/** Minimal upload surface the service needs. Structurally satisfied by the file Repository. */
export interface LibraryFileUploader {
  uploadOne(input: { file: File }): Promise<{ record: FileRecord }>;
}

export interface LibraryServiceDeps {
  database: DatabaseManager;
  isAdministrator(userId: string): Promise<boolean>;
  files: LibraryFileUploader;
  drive: LibraryDrive;
}

export type LibraryErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'NOT_BORROWABLE'
  | 'ALREADY_ACTIVE'
  | 'INVALID_STATUS'
  | 'OUT_OF_STOCK'
  | 'TOO_MANY_FILES'
  | 'FILE_TOO_LARGE'
  | 'NO_FILE'
  | 'INVALID_INPUT';

export class LibraryError extends Error {
  public readonly code: LibraryErrorCode;
  public readonly status: 400 | 403 | 404 | 409 | 413;

  public constructor(
    code: LibraryErrorCode,
    message: string,
    status: 400 | 403 | 404 | 409 | 413,
  ) {
    super(message);
    this.name = 'LibraryError';
    this.code = code;
    this.status = status;
  }
}

export const MATERIAL_VISIBILITY_ALL = 'all';
export const MATERIAL_VISIBILITY_RESTRICTED = 'restricted';

export const BORROWING_PENDING = 'pending';
export const BORROWING_BORROWED = 'borrowed';
export const BORROWING_RETURNED = 'returned';
export const BORROWING_CANCELLED = 'cancelled';

export const MAX_FILES_PER_UPLOAD = 3;
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export type PreviewKind = 'image' | 'pdf' | 'text' | 'other';

export interface MaterialRow {
  readonly id: number;
  readonly title: string;
  readonly category: string | null;
  readonly summary: string | null;
  readonly owner: string | null;
  readonly borrowable: boolean | number;
  readonly totalCopies: number;
  readonly availableCopies: number;
  readonly visibility: string;
  readonly coverFileId: string | null;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
}

interface MaterialFileRow {
  readonly id: string;
  readonly disk: string;
  readonly key: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: string | number;
  readonly role: string;
  readonly uploaderId: string | null;
  readonly uploaderName: string | null;
  readonly createdAt: Date | string;
  readonly materialId: number | null;
}

export interface MaterialFileDto {
  readonly id: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly role: string;
  readonly uploaderId: string | null;
  readonly uploaderName: string | null;
  readonly createdAt: Date | string;
  readonly previewKind: PreviewKind;
}

export interface MaterialSummaryDto {
  readonly id: number;
  readonly title: string;
  readonly category: string | null;
  readonly summary: string | null;
  readonly owner: string | null;
  readonly borrowable: boolean;
  readonly totalCopies: number;
  readonly availableCopies: number;
  readonly visibility: string;
  readonly coverFileId: string | null;
  readonly fileCount: number;
  readonly updatedAt: Date | string;
}

export interface MaterialDetailDto extends MaterialSummaryDto {
  readonly files: readonly MaterialFileDto[];
  readonly readers: readonly string[];
  readonly canManage: boolean;
  readonly myActiveBorrowing: BorrowingDto | null;
}

export interface BorrowingDto {
  readonly id: number;
  readonly materialId: number;
  readonly materialTitle: string;
  readonly userId: string;
  readonly borrowerName: string | null;
  readonly status: string;
  readonly requestedAt: Date | string;
  readonly borrowedAt: Date | string | null;
  readonly returnedAt: Date | string | null;
}

export interface MaterialInput {
  readonly title?: unknown;
  readonly category?: unknown;
  readonly summary?: unknown;
  readonly owner?: unknown;
  readonly borrowable?: unknown;
  readonly totalCopies?: unknown;
  readonly visibility?: unknown;
  readonly readers?: unknown;
}

export interface ListMaterialsOptions {
  readonly query?: string;
  readonly category?: string;
}

export class LibraryService {
  private readonly database: DatabaseManager;
  private readonly isAdministrator: (userId: string) => Promise<boolean>;
  private readonly files: LibraryFileUploader;
  private readonly drive: LibraryDrive;

  public constructor(deps: LibraryServiceDeps) {
    this.database = deps.database;
    this.isAdministrator = (userId) => deps.isAdministrator(userId);
    this.files = deps.files;
    this.drive = deps.drive;
  }

  public async isAdmin(userId: string): Promise<boolean> {
    return this.isAdministrator(userId);
  }

  public async listMaterials(
    userId: string,
    options: ListMaterialsOptions = {},
  ): Promise<readonly MaterialSummaryDto[]> {
    const query = this.database.query();
    let builder = query
      .selectFrom('materials')
      .selectAll()
      .orderBy('updatedAt', 'desc');

    if (!(await this.isAdministrator(userId))) {
      builder = builder.where((eb) =>
        eb.or([
          eb('visibility', '=', MATERIAL_VISIBILITY_ALL),
          eb(
            'id',
            'in',
            eb
              .selectFrom('materialReaders')
              .select('materialId')
              .where('userId', '=', userId),
          ),
        ]),
      );
    }

    const search = options.query?.trim();
    if (search) {
      const pattern = `%${search.replace(/[%_\\]/g, (char) => `\\${char}`)}%`;
      builder = builder.where((eb) =>
        eb.or([
          eb('title', 'like', pattern),
          eb('summary', 'like', pattern),
          eb('owner', 'like', pattern),
        ]),
      );
    }

    const category = options.category?.trim();
    if (category) {
      builder = builder.where('category', '=', category);
    }

    const rows = (await builder.execute()) as unknown as MaterialRow[];
    const fileCounts = await this.fileCountsByMaterial(
      rows.map((row) => row.id),
    );
    return rows.map((row) => this.toSummary(row, fileCounts.get(row.id) ?? 0));
  }

  public async getMaterial(
    userId: string,
    materialId: number,
  ): Promise<MaterialDetailDto> {
    const admin = await this.isAdministrator(userId);
    const row = await this.loadMaterial(materialId);
    if (!row) {
      throw new LibraryError('NOT_FOUND', 'Material not found.', 404);
    }
    const readable = await this.canReadMaterial(userId, row, admin);
    if (!readable) {
      throw new LibraryError(
        'FORBIDDEN',
        'You cannot read this material.',
        403,
      );
    }

    const fileRows = (await this.database
      .query()
      .selectFrom('materialFiles')
      .selectAll()
      .where('materialId', '=', materialId)
      .orderBy('createdAt', 'asc')
      .execute()) as unknown as MaterialFileRow[];

    const readers = admin ? await this.listReaderIds(materialId) : [];
    const active = await this.findActiveBorrowing(userId, materialId);
    const activeName = active
      ? await this.resolveBorrowerName(active.userId, active.borrowerName)
      : null;
    const materials = [row];
    const counts = await this.fileCountsByMaterial(
      materials.map((item) => item.id),
    );

    return {
      ...this.toSummary(row, counts.get(row.id) ?? 0),
      files: fileRows.map((file) => this.toFileDto(file)),
      readers,
      canManage: admin,
      myActiveBorrowing: active
        ? {
            id: active.id,
            materialId: active.materialId,
            materialTitle: row.title,
            userId: active.userId,
            borrowerName: activeName,
            status: active.status,
            requestedAt: active.requestedAt,
            borrowedAt: active.borrowedAt,
            returnedAt: active.returnedAt,
          }
        : null,
    };
  }

  public async listCategories(userId: string): Promise<readonly string[]> {
    const rows = await this.listMaterials(userId);
    const categories = new Set<string>();
    for (const row of rows) {
      if (row.category) categories.add(row.category);
    }
    return [...categories].sort((left, right) =>
      left.localeCompare(right, 'zh'),
    );
  }

  public async getReadableFile(
    userId: string,
    fileId: string,
  ): Promise<MaterialFileRow> {
    const file = (await this.database
      .query()
      .selectFrom('materialFiles')
      .selectAll()
      .where('id', '=', fileId)
      .executeTakeFirst()) as unknown as MaterialFileRow | undefined;
    if (!file) {
      throw new LibraryError('NOT_FOUND', 'File not found.', 404);
    }
    const admin = await this.isAdministrator(userId);
    if (file.materialId === null) {
      if (!admin) {
        throw new LibraryError('FORBIDDEN', 'You cannot read this file.', 403);
      }
      return file;
    }
    const material = await this.loadMaterial(file.materialId);
    if (!material) {
      throw new LibraryError('NOT_FOUND', 'Material not found.', 404);
    }
    if (!(await this.canReadMaterial(userId, material, admin))) {
      throw new LibraryError('FORBIDDEN', 'You cannot read this file.', 403);
    }
    return file;
  }

  public async openFile(
    userId: string,
    fileId: string,
  ): Promise<{ file: MaterialFileRow; stream: Readable }> {
    const file = await this.getReadableFile(userId, fileId);
    const disk = this.drive.use(file.disk);
    if (isDemoFileKey(file.key) && !(await disk.exists(file.key))) {
      await this.materializeDemoFile(file);
    }
    const stream = await disk.getStream(file.key);
    return { file, stream };
  }

  public async createMaterial(
    userId: string,
    input: MaterialInput,
  ): Promise<MaterialRow> {
    await this.requireAdmin(userId);
    const values = this.normalizeMaterialInput(input);
    const now = new Date();
    const result = await this.database
      .query()
      .insertInto('materials')
      .values({
        title: values.title,
        category: values.category,
        summary: values.summary,
        owner: values.owner,
        borrowable: values.borrowable,
        totalCopies: values.totalCopies,
        availableCopies: values.totalCopies,
        visibility: values.visibility,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const id = Number(result.insertId);
    if (values.visibility === MATERIAL_VISIBILITY_RESTRICTED) {
      await this.replaceReaders(id, values.readers);
    }
    return (await this.loadMaterial(id))!;
  }

  public async updateMaterial(
    userId: string,
    materialId: number,
    input: MaterialInput,
  ): Promise<MaterialRow> {
    await this.requireAdmin(userId);
    const existing = await this.loadMaterial(materialId);
    if (!existing) {
      throw new LibraryError('NOT_FOUND', 'Material not found.', 404);
    }
    const values = this.normalizeMaterialInput(input, existing);
    // Available stock tracks the change in total copies and never drops below zero.
    const totalDelta = values.totalCopies - Number(existing.totalCopies);
    const available = Math.max(
      0,
      Math.min(
        values.totalCopies,
        Number(existing.availableCopies) + totalDelta,
      ),
    );
    await this.database
      .query()
      .updateTable('materials')
      .set({
        title: values.title,
        category: values.category,
        summary: values.summary,
        owner: values.owner,
        borrowable: values.borrowable,
        totalCopies: values.totalCopies,
        availableCopies: available,
        visibility: values.visibility,
        updatedAt: new Date(),
      })
      .where('id', '=', materialId)
      .execute();
    await this.replaceReaders(
      materialId,
      values.visibility === MATERIAL_VISIBILITY_RESTRICTED
        ? values.readers
        : [],
    );
    return (await this.loadMaterial(materialId))!;
  }

  public async deleteMaterial(
    userId: string,
    materialId: number,
  ): Promise<void> {
    await this.requireAdmin(userId);
    const existing = await this.loadMaterial(materialId);
    if (!existing) {
      throw new LibraryError('NOT_FOUND', 'Material not found.', 404);
    }
    const files = await this.listFileRows(materialId);
    await this.database.transaction(async (connection) => {
      await connection.query
        .deleteFrom('materialReaders')
        .where('materialId', '=', materialId)
        .execute();
      await connection.query
        .deleteFrom('materialFiles')
        .where('materialId', '=', materialId)
        .execute();
      await connection.query
        .deleteFrom('materials')
        .where('id', '=', materialId)
        .execute();
    });
    for (const file of files) {
      await this.safeDeleteObject(file);
    }
  }

  public async uploadFiles(
    userId: string,
    userName: string | null,
    materialId: number,
    input: { files: readonly File[]; role: string },
  ): Promise<readonly MaterialFileDto[]> {
    await this.requireAdmin(userId);
    const material = await this.loadMaterial(materialId);
    if (!material) {
      throw new LibraryError('NOT_FOUND', 'Material not found.', 404);
    }
    if (input.files.length === 0) {
      throw new LibraryError('NO_FILE', 'No file was uploaded.', 400);
    }
    if (input.files.length > MAX_FILES_PER_UPLOAD) {
      throw new LibraryError(
        'TOO_MANY_FILES',
        `At most ${MAX_FILES_PER_UPLOAD} files may be uploaded at once.`,
        400,
      );
    }
    for (const file of input.files) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        throw new LibraryError(
          'FILE_TOO_LARGE',
          `File "${file.name}" exceeds the ${MAX_FILE_SIZE_BYTES} byte limit.`,
          413,
        );
      }
    }

    const role = input.role === 'cover' ? 'cover' : 'attachment';
    const created: MaterialFileRow[] = [];
    for (const file of input.files) {
      let record: FileRecord;
      try {
        ({ record } = await this.files.uploadOne({ file }));
      } catch {
        throw new LibraryError(
          'INVALID_INPUT',
          `Failed to store file "${file.name}".`,
          400,
        );
      }
      const now = new Date();
      await this.database
        .query()
        .updateTable('materialFiles')
        .set({
          materialId,
          role,
          uploaderId: userId,
          uploaderName: userName,
          updatedAt: now,
        })
        .where('id', '=', record.id)
        .execute();
      created.push({
        ...(record as unknown as MaterialFileRow),
        materialId,
        role,
        uploaderId: userId,
        uploaderName: userName,
      });
    }

    if (role === 'cover') {
      // A material has exactly one cover: uploading a new one replaces the previous file.
      const previous = await this.listFileRows(materialId, 'cover');
      const newIds = new Set(created.map((file) => file.id));
      await this.database
        .query()
        .updateTable('materials')
        .set({ coverFileId: created[0].id, updatedAt: new Date() })
        .where('id', '=', materialId)
        .execute();
      for (const file of previous) {
        if (!newIds.has(file.id)) {
          await this.deleteFileRecord(file);
        }
      }
    }

    return created.map((file) => this.toFileDto(file));
  }

  public async setCover(
    userId: string,
    materialId: number,
    fileId: string,
  ): Promise<void> {
    await this.requireAdmin(userId);
    const file = await this.loadFileRow(fileId);
    if (!file || file.materialId !== materialId) {
      throw new LibraryError('NOT_FOUND', 'File not found.', 404);
    }
    await this.database
      .query()
      .updateTable('materialFiles')
      .set({ role: 'attachment', updatedAt: new Date() })
      .where('materialId', '=', materialId)
      .where('role', '=', 'cover')
      .execute();
    await this.database
      .query()
      .updateTable('materialFiles')
      .set({ role: 'cover', updatedAt: new Date() })
      .where('id', '=', fileId)
      .execute();
    await this.database
      .query()
      .updateTable('materials')
      .set({ coverFileId: fileId, updatedAt: new Date() })
      .where('id', '=', materialId)
      .execute();
  }

  public async deleteFile(
    userId: string,
    materialId: number,
    fileId: string,
  ): Promise<void> {
    await this.requireAdmin(userId);
    const file = await this.loadFileRow(fileId);
    if (!file || file.materialId !== materialId) {
      throw new LibraryError('NOT_FOUND', 'File not found.', 404);
    }
    await this.deleteFileRecord(file);
  }

  public async requestBorrow(
    userId: string,
    userName: string | null,
    materialId: number,
  ): Promise<{ borrowing: BorrowingDto; created: boolean }> {
    const admin = await this.isAdministrator(userId);
    const material = await this.loadMaterial(materialId);
    if (!material) {
      throw new LibraryError('NOT_FOUND', 'Material not found.', 404);
    }
    if (!(await this.canReadMaterial(userId, material, admin))) {
      throw new LibraryError(
        'FORBIDDEN',
        'You cannot read this material.',
        403,
      );
    }
    if (!toBoolean(material.borrowable)) {
      throw new LibraryError(
        'NOT_BORROWABLE',
        'This material cannot be borrowed.',
        409,
      );
    }
    const active = await this.findActiveBorrowing(userId, materialId);
    if (active) {
      return {
        borrowing: this.toBorrowingDto(active, material.title),
        created: false,
      };
    }
    const now = new Date();
    const result = await this.database
      .query()
      .insertInto('materialBorrowings')
      .values({
        materialId,
        userId,
        borrowerName: userName,
        status: BORROWING_PENDING,
        requestedAt: now,
        borrowedAt: null,
        returnedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return {
      borrowing: {
        id: Number(result.insertId),
        materialId,
        materialTitle: material.title,
        userId,
        borrowerName: userName,
        status: BORROWING_PENDING,
        requestedAt: now,
        borrowedAt: null,
        returnedAt: null,
      },
      created: true,
    };
  }

  public async cancelBorrow(
    userId: string,
    borrowingId: number,
  ): Promise<BorrowingDto> {
    const result = await this.database
      .query()
      .updateTable('materialBorrowings')
      .set({ status: BORROWING_CANCELLED, updatedAt: new Date() })
      .where('id', '=', borrowingId)
      .where('userId', '=', userId)
      .where('status', '=', BORROWING_PENDING)
      .execute();
    if (toCount(result) === 0) {
      const existing = await this.loadBorrowing(borrowingId);
      if (!existing) {
        throw new LibraryError('NOT_FOUND', 'Borrowing not found.', 404);
      }
      if (existing.userId !== userId) {
        throw new LibraryError('FORBIDDEN', 'Not your borrowing.', 403);
      }
      throw new LibraryError(
        'INVALID_STATUS',
        'Only a pending request can be cancelled.',
        409,
      );
    }
    const updated = await this.loadBorrowing(borrowingId);
    const material = await this.loadMaterial(updated!.materialId);
    return this.toBorrowingDto(updated!, material?.title ?? '');
  }

  public async confirmBorrow(
    userId: string,
    borrowingId: number,
  ): Promise<{ borrowing: BorrowingDto; changed: boolean }> {
    await this.requireAdmin(userId);
    return this.database.transaction(async (connection) => {
      const now = new Date();
      // Claiming the transition first makes a repeated confirm a no-op instead of a second decrement.
      const claimed = await connection.query
        .updateTable('materialBorrowings')
        .set({ status: BORROWING_BORROWED, borrowedAt: now, updatedAt: now })
        .where('id', '=', borrowingId)
        .where('status', '=', BORROWING_PENDING)
        .execute();
      if (toCount(claimed) === 0) {
        const existing = await connection.query
          .selectFrom('materialBorrowings')
          .selectAll()
          .where('id', '=', borrowingId)
          .executeTakeFirst();
        if (!existing) {
          throw new LibraryError('NOT_FOUND', 'Borrowing not found.', 404);
        }
        if (existing.status === BORROWING_BORROWED) {
          const material = await connection.query
            .selectFrom('materials')
            .select('title')
            .where('id', '=', existing.materialId)
            .executeTakeFirst();
          return {
            borrowing: this.toBorrowingDto(
              existing as unknown as BorrowingRow,
              readTitle(material?.title),
            ),
            changed: false,
          };
        }
        throw new LibraryError(
          'INVALID_STATUS',
          'Only a pending request can be confirmed as borrowed.',
          409,
        );
      }

      const borrowing = (await connection.query
        .selectFrom('materialBorrowings')
        .selectAll()
        .where('id', '=', borrowingId)
        .executeTakeFirst()) as unknown as BorrowingRow;

      const material = (await connection.query
        .selectFrom('materials')
        .selectAll()
        .where('id', '=', borrowing.materialId)
        .executeTakeFirst()) as unknown as MaterialRow | undefined;
      if (!material) {
        throw new LibraryError('NOT_FOUND', 'Material not found.', 404);
      }
      const nextAvailable = Number(material.availableCopies) - 1;
      // Throwing rolls the whole transaction back, including the status claim above.
      if (nextAvailable < 0) {
        throw new LibraryError(
          'OUT_OF_STOCK',
          'No copy is available to borrow.',
          409,
        );
      }
      const decremented = await connection.query
        .updateTable('materials')
        .set({ availableCopies: nextAvailable, updatedAt: now })
        .where('id', '=', material.id)
        .where('availableCopies', '>', 0)
        .execute();
      if (toCount(decremented) === 0) {
        throw new LibraryError(
          'OUT_OF_STOCK',
          'No copy is available to borrow.',
          409,
        );
      }
      return {
        borrowing: this.toBorrowingDto(borrowing, material.title),
        changed: true,
      };
    });
  }

  public async confirmReturn(
    userId: string,
    borrowingId: number,
  ): Promise<{ borrowing: BorrowingDto; changed: boolean }> {
    await this.requireAdmin(userId);
    return this.database.transaction(async (connection) => {
      const now = new Date();
      const claimed = await connection.query
        .updateTable('materialBorrowings')
        .set({ status: BORROWING_RETURNED, returnedAt: now, updatedAt: now })
        .where('id', '=', borrowingId)
        .where('status', '=', BORROWING_BORROWED)
        .execute();
      if (toCount(claimed) === 0) {
        const existing = (await connection.query
          .selectFrom('materialBorrowings')
          .selectAll()
          .where('id', '=', borrowingId)
          .executeTakeFirst()) as unknown as BorrowingRow | undefined;
        if (!existing) {
          throw new LibraryError('NOT_FOUND', 'Borrowing not found.', 404);
        }
        if (existing.status === BORROWING_RETURNED) {
          const material = await connection.query
            .selectFrom('materials')
            .select('title')
            .where('id', '=', existing.materialId)
            .executeTakeFirst();
          return {
            borrowing: this.toBorrowingDto(
              existing,
              readTitle(material?.title),
            ),
            changed: false,
          };
        }
        throw new LibraryError(
          'INVALID_STATUS',
          'Only a borrowed record can be returned.',
          409,
        );
      }

      const borrowing = (await connection.query
        .selectFrom('materialBorrowings')
        .selectAll()
        .where('id', '=', borrowingId)
        .executeTakeFirst()) as unknown as BorrowingRow;
      const material = (await connection.query
        .selectFrom('materials')
        .selectAll()
        .where('id', '=', borrowing.materialId)
        .executeTakeFirst()) as unknown as MaterialRow | undefined;
      if (!material) {
        throw new LibraryError('NOT_FOUND', 'Material not found.', 404);
      }
      const restored = Math.min(
        Number(material.availableCopies) + 1,
        Number(material.totalCopies),
      );
      await connection.query
        .updateTable('materials')
        .set({ availableCopies: restored, updatedAt: now })
        .where('id', '=', material.id)
        .execute();
      return {
        borrowing: this.toBorrowingDto(borrowing, material.title),
        changed: true,
      };
    });
  }

  public async listMyBorrowings(
    userId: string,
  ): Promise<readonly BorrowingDto[]> {
    const rows = (await this.database
      .query()
      .selectFrom('materialBorrowings')
      .selectAll()
      .where('userId', '=', userId)
      .orderBy('requestedAt', 'desc')
      .execute()) as unknown as BorrowingRow[];
    return this.attachTitles(rows);
  }

  public async listBorrowings(
    userId: string,
    status?: string,
  ): Promise<readonly BorrowingDto[]> {
    await this.requireAdmin(userId);
    let builder = this.database
      .query()
      .selectFrom('materialBorrowings')
      .selectAll()
      .orderBy('requestedAt', 'desc');
    if (status) {
      builder = builder.where('status', '=', status);
    }
    const rows = (await builder.execute()) as unknown as BorrowingRow[];
    return this.attachTitles(rows);
  }

  public async listSelectableUsers(userId: string): Promise<
    readonly {
      id: string;
      name: string;
      username: string | null;
      email: string | null;
    }[]
  > {
    await this.requireAdmin(userId);
    const rows = (await this.database
      .query()
      .selectFrom('user')
      .select(['id', 'name', 'username', 'email'])
      .orderBy('name', 'asc')
      .execute()) as unknown as {
      id: string;
      name: string;
      username: string | null;
      email: string | null;
    }[];
    return rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      username: row.username,
      email: row.email,
    }));
  }

  private async requireAdmin(userId: string): Promise<void> {
    if (!(await this.isAdministrator(userId))) {
      throw new LibraryError(
        'FORBIDDEN',
        'Only an administrator may perform this action.',
        403,
      );
    }
  }

  private async canReadMaterial(
    userId: string,
    material: MaterialRow,
    admin: boolean,
  ): Promise<boolean> {
    if (admin) return true;
    if (material.visibility !== MATERIAL_VISIBILITY_RESTRICTED) return true;
    const reader = await this.database
      .query()
      .selectFrom('materialReaders')
      .select('id')
      .where('materialId', '=', Number(material.id))
      .where('userId', '=', userId)
      .executeTakeFirst();
    return Boolean(reader);
  }

  private async loadMaterial(id: number): Promise<MaterialRow | undefined> {
    return (await this.database
      .query()
      .selectFrom('materials')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()) as unknown as MaterialRow | undefined;
  }

  private async loadBorrowing(id: number): Promise<BorrowingRow | undefined> {
    return (await this.database
      .query()
      .selectFrom('materialBorrowings')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()) as unknown as BorrowingRow | undefined;
  }

  private async findActiveBorrowing(
    userId: string,
    materialId: number,
  ): Promise<BorrowingRow | undefined> {
    return (await this.database
      .query()
      .selectFrom('materialBorrowings')
      .selectAll()
      .where('userId', '=', userId)
      .where('materialId', '=', materialId)
      .where('status', 'in', [BORROWING_PENDING, BORROWING_BORROWED])
      .executeTakeFirst()) as unknown as BorrowingRow | undefined;
  }

  private async fileCountsByMaterial(
    materialIds: readonly number[],
  ): Promise<Map<number, number>> {
    const counts = new Map<number, number>();
    if (materialIds.length === 0) return counts;
    const rows = (await this.database
      .query()
      .selectFrom('materialFiles')
      .select((eb) => ['materialId', eb.fn.count('id').as('total')])
      .where('materialId', 'in', [...materialIds])
      .groupBy('materialId')
      .execute()) as unknown as { materialId: number; total: unknown }[];
    for (const row of rows) {
      counts.set(Number(row.materialId), Number(row.total ?? 0));
    }
    return counts;
  }

  private async listReaderIds(materialId: number): Promise<readonly string[]> {
    const rows = (await this.database
      .query()
      .selectFrom('materialReaders')
      .select('userId')
      .where('materialId', '=', materialId)
      .execute()) as unknown as { userId: string }[];
    return rows.map((row) => String(row.userId));
  }

  private async replaceReaders(
    materialId: number,
    readers: readonly string[],
  ): Promise<void> {
    await this.database.transaction(async (connection) => {
      await connection.query
        .deleteFrom('materialReaders')
        .where('materialId', '=', materialId)
        .execute();
      const unique = [...new Set(readers)];
      if (unique.length === 0) return;
      const now = new Date();
      await connection.query
        .insertInto('materialReaders')
        .values(
          unique.map((userId) => ({ materialId, userId, createdAt: now })),
        )
        .execute();
    });
  }

  private async listFileRows(
    materialId: number,
    role?: string,
  ): Promise<readonly MaterialFileRow[]> {
    let builder = this.database
      .query()
      .selectFrom('materialFiles')
      .selectAll()
      .where('materialId', '=', materialId);
    if (role) builder = builder.where('role', '=', role);
    return (await builder.execute()) as unknown as MaterialFileRow[];
  }

  private async loadFileRow(id: string): Promise<MaterialFileRow | undefined> {
    return (await this.database
      .query()
      .selectFrom('materialFiles')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()) as unknown as MaterialFileRow | undefined;
  }

  private async deleteFileRecord(file: MaterialFileRow): Promise<void> {
    await this.database
      .query()
      .deleteFrom('materialFiles')
      .where('id', '=', file.id)
      .execute();
    const material = await this.loadMaterial(Number(file.materialId));
    if (material && material.coverFileId === file.id) {
      const replacement = await this.listFileRows(Number(file.materialId));
      await this.database
        .query()
        .updateTable('materials')
        .set({
          coverFileId:
            replacement.find((item) => item.role === 'cover')?.id ?? null,
          updatedAt: new Date(),
        })
        .where('id', '=', Number(file.materialId))
        .execute();
    }
    await this.safeDeleteObject(file);
  }

  private async safeDeleteObject(file: MaterialFileRow): Promise<void> {
    try {
      await this.drive.use(file.disk).delete(file.key);
    } catch {
      // The metadata is already gone; a missing object must not fail the request.
    }
  }

  private async materializeDemoFile(file: MaterialFileRow): Promise<void> {
    const kind = demoFileKind(file.key);
    if (!kind) return;
    await this.drive
      .use(file.disk)
      .put(file.key, generateDemoFileBuffer(kind), {
        contentType: DEMO_FILE_CONTENT_TYPE[kind],
      });
  }

  private async attachTitles(
    rows: readonly BorrowingRow[],
  ): Promise<readonly BorrowingDto[]> {
    if (rows.length === 0) return [];
    const materialIds = [...new Set(rows.map((row) => Number(row.materialId)))];
    const materials = (await this.database
      .query()
      .selectFrom('materials')
      .select(['id', 'title'])
      .where('id', 'in', materialIds)
      .execute()) as unknown as { id: number; title: string }[];
    const titles = new Map(
      materials.map((item) => [Number(item.id), item.title]),
    );
    // Records created before a name was stored (e.g. seeded rows) still need a human label.
    const missing = rows.filter((row) => !row.borrowerName);
    const names = await this.resolveBorrowerNames(
      missing.map((row) => String(row.userId)),
    );
    return rows.map((row) => ({
      ...this.toBorrowingDto(row, titles.get(Number(row.materialId)) ?? ''),
      borrowerName: row.borrowerName ?? names.get(String(row.userId)) ?? null,
    }));
  }

  /** Resolves a single borrower label, preferring the name stored on the record. */
  private async resolveBorrowerName(
    userId: string,
    stored: string | null,
  ): Promise<string | null> {
    if (stored) return stored;
    const names = await this.resolveBorrowerNames([userId]);
    return names.get(userId) ?? null;
  }

  /** Looks up display names for borrower ids, falling back to username, email then id. */
  private async resolveBorrowerNames(
    userIds: readonly string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(userIds.filter((id) => id.length > 0))];
    const names = new Map<string, string>();
    if (unique.length === 0) return names;
    let rows: readonly {
      id: string;
      name: string | null;
      username: string | null;
      email: string | null;
    }[];
    try {
      rows = (await this.database
        .query()
        .selectFrom('user')
        .select(['id', 'name', 'username', 'email'])
        .where('id', 'in', unique)
        .execute()) as unknown as typeof rows;
    } catch {
      // The identity table is optional here; a record without a stored name keeps its id.
      return names;
    }
    for (const row of rows) {
      const label = row.name || row.username || row.email || String(row.id);
      names.set(String(row.id), label);
    }
    return names;
  }

  private toSummary(row: MaterialRow, fileCount: number): MaterialSummaryDto {
    return {
      id: Number(row.id),
      title: row.title,
      category: row.category,
      summary: row.summary,
      owner: row.owner,
      borrowable: toBoolean(row.borrowable),
      totalCopies: Number(row.totalCopies),
      availableCopies: Number(row.availableCopies),
      visibility: row.visibility,
      coverFileId: row.coverFileId,
      fileCount,
      updatedAt: row.updatedAt,
    };
  }

  private toFileDto(file: MaterialFileRow): MaterialFileDto {
    return {
      id: file.id,
      filename: file.filename,
      ext: file.ext,
      mimeType: file.mimeType,
      size: Number(file.size),
      role: file.role,
      uploaderId: file.uploaderId,
      uploaderName: file.uploaderName,
      createdAt: file.createdAt,
      previewKind: previewKindFor(file.mimeType, file.ext),
    };
  }

  private toBorrowingDto(
    row: BorrowingRow,
    materialTitle: string,
  ): BorrowingDto {
    return {
      id: Number(row.id),
      materialId: Number(row.materialId),
      materialTitle,
      userId: String(row.userId),
      borrowerName: row.borrowerName,
      status: row.status,
      requestedAt: row.requestedAt,
      borrowedAt: row.borrowedAt,
      returnedAt: row.returnedAt,
    };
  }

  private normalizeMaterialInput(
    input: MaterialInput,
    existing?: MaterialRow,
  ): {
    title: string;
    category: string | null;
    summary: string | null;
    owner: string | null;
    borrowable: boolean;
    totalCopies: number;
    visibility: string;
    readers: readonly string[];
  } {
    const title = readString(input.title, existing?.title);
    if (!title) {
      throw new LibraryError('INVALID_INPUT', 'Title is required.', 400);
    }
    const totalCopies = readNonNegativeInteger(
      input.totalCopies,
      existing ? Number(existing.totalCopies) : 0,
    );
    const visibility = readVisibility(
      input.visibility,
      existing?.visibility ?? MATERIAL_VISIBILITY_ALL,
    );
    return {
      title,
      category: readNullableString(input.category, existing?.category ?? null),
      summary: readNullableString(input.summary, existing?.summary ?? null),
      owner: readNullableString(input.owner, existing?.owner ?? null),
      borrowable: readBoolean(
        input.borrowable,
        existing ? toBoolean(existing.borrowable) : false,
      ),
      totalCopies,
      visibility,
      readers: readStringArray(input.readers),
    };
  }
}

interface BorrowingRow {
  readonly id: number;
  readonly materialId: number;
  readonly userId: string;
  readonly borrowerName: string | null;
  readonly status: string;
  readonly requestedAt: Date | string;
  readonly borrowedAt: Date | string | null;
  readonly returnedAt: Date | string | null;
}

const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'avif',
]);
const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'log',
  'csv',
  'json',
  'yml',
  'yaml',
  'ini',
  'conf',
  'xml',
]);

export function previewKindFor(mimeType: string, ext: string): PreviewKind {
  const normalizedExt = ext.toLowerCase();
  const normalizedMime = mimeType.toLowerCase();
  if (
    IMAGE_EXTENSIONS.has(normalizedExt) &&
    normalizedMime !== 'image/svg+xml'
  ) {
    return 'image';
  }
  if (normalizedExt === 'pdf' || normalizedMime === 'application/pdf') {
    return 'pdf';
  }
  if (
    TEXT_EXTENSIONS.has(normalizedExt) ||
    normalizedMime.startsWith('text/')
  ) {
    return 'text';
  }
  return 'other';
}

export function isDemoFileKey(key: string): boolean {
  return /^library-demo\/[a-z0-9-]+\.(png|pdf|txt|zip)$/.test(key);
}

export function demoFileKind(key: string): DemoFileKind | null {
  if (!isDemoFileKey(key)) return null;
  const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
  if (ext === 'txt') return 'text';
  if (ext === 'png' || ext === 'pdf' || ext === 'zip') return ext;
  return null;
}

function toBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

/** Reads a value the query builder types as `unknown` without stringifying a non-string. */
function readTitle(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toCount(result: {
  updatedCount?: number;
  deletedCount?: number;
}): number {
  return Number(result.updatedCount ?? 0);
}

function readString(value: unknown, fallback?: string | null): string {
  if (typeof value === 'string') return value.trim();
  return (fallback ?? '').trim();
}

function readNullableString(
  value: unknown,
  fallback: string | null,
): string | null {
  if (value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function readNonNegativeInteger(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new LibraryError(
      'INVALID_INPUT',
      'Copy count must be a non-negative number.',
      400,
    );
  }
  return Math.floor(parsed);
}

function readVisibility(value: unknown, fallback: string): string {
  if (
    value === MATERIAL_VISIBILITY_ALL ||
    value === MATERIAL_VISIBILITY_RESTRICTED
  ) {
    return value;
  }
  return fallback;
}

function readStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
