import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import {
  authorizationToken,
  type AppAuthorization,
} from '@nocobase/app-plugin-authorization';
import {
  serverFileRepositoryManagerToken,
  type ServerFileRepositoryManager,
} from '@nocobase/app-plugin-file/server';
import {
  databaseManagerToken,
  type DatabaseManager,
  type Row,
} from '@nocobase/db';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';
import type { Readable } from 'node:stream';

import {
  createAuthorizationDirectory,
  INSPECTOR_ROLE,
  PRODUCTION_LEAD_ROLE,
  QUALITY_SUPERVISOR_ROLE,
  QualityError,
  SYSTEM_ADMINISTRATOR_ROLE,
  type QualityActor,
  type QualityDirectory,
} from './quality.js';

/** A single file may be at most 5 MiB. */
export const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;
/** At most five files are uploaded from one selection. */
export const MAX_ATTACHMENT_FILES = 5;

export type AttachmentTargetType = 'batch' | 'item' | 'nonconformance';

export type AttachmentCategory =
  | 'item_photo'
  | 'item_report'
  | 'item_note'
  | 'batch_factory_report'
  | 'nc_problem'
  | 'nc_after';

const CATEGORIES_BY_TARGET: Readonly<
  Record<AttachmentTargetType, readonly AttachmentCategory[]>
> = {
  item: ['item_photo', 'item_report', 'item_note'],
  batch: ['batch_factory_report'],
  nonconformance: ['nc_problem', 'nc_after'],
};

export interface AttachmentView {
  readonly id: string;
  readonly targetType: AttachmentTargetType;
  readonly targetId: string;
  readonly category: AttachmentCategory;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly uploadedById: string;
  readonly uploadedByName: string;
  readonly createdAt: string;
}

export interface AttachmentListResult {
  /** Whether the current actor may add or remove files in this group. */
  readonly canModify: boolean;
  readonly files: readonly AttachmentView[];
}

export interface AttachmentDownload {
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly stream: Readable;
}

export interface AttachmentTarget {
  readonly targetType: string;
  readonly targetId: string;
  readonly category: string;
}

/** The file columns an upload produces, plus its stored object identity. */
export interface StoredAttachment {
  readonly id: string;
  readonly disk: string;
  readonly key: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AttachmentStoreInput {
  readonly file: File;
  readonly targetType: AttachmentTargetType;
  readonly targetId: string;
  readonly category: AttachmentCategory;
  readonly uploadedById: string;
}

/** Storage seam: the provider binds the file plugin's Repository here. */
export interface AttachmentStore {
  upload(input: AttachmentStoreInput): Promise<StoredAttachment>;
}

/** Byte access seam, so permission logic is testable without a real disk. */
export interface AttachmentStorage {
  exists(disk: string, key: string): Promise<boolean>;
  getStream(disk: string, key: string): Promise<Readable>;
  delete(disk: string, key: string): Promise<void>;
}

export interface QualityFileService {
  resolveActor(userId: string, userName: string): Promise<QualityActor>;
  list(
    actor: QualityActor,
    target: AttachmentTarget,
  ): Promise<AttachmentListResult>;
  upload(
    actor: QualityActor,
    target: AttachmentTarget,
    file: File,
  ): Promise<AttachmentView>;
  remove(actor: QualityActor, id: string): Promise<void>;
  open(actor: QualityActor, id: string): Promise<AttachmentDownload>;
}

export const qualityFileServiceToken: ServiceToken<QualityFileService> =
  createServiceToken<QualityFileService>('app/quality-file-service');

export default class QualityFileProvider extends ServiceProvider<Application> {
  public readonly name = 'app/quality-file-provider';

  public override register(): void {
    this.app.container.singleton(qualityFileServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      const directory = this.app.container.has(authorizationToken)
        ? createQualityFileDirectory(
            this.app.container.resolve(authorizationToken),
          )
        : {
            rolesForUser: () => Promise.resolve([] as readonly string[]),
            listUsers: () => Promise.resolve([]),
          };
      const drive = this.app.container.resolve(driveManagerToken);
      const manager = this.app.container.resolve(
        serverFileRepositoryManagerToken,
      );
      return createQualityFileService({
        database,
        directory,
        store: createRepositoryStore(manager),
        storage: {
          exists: async (disk, key) => await drive.use(disk).exists(key),
          getStream: async (disk, key) => await drive.use(disk).getStream(key),
          delete: async (disk, key) => {
            await drive.use(disk).delete(key);
          },
        },
      });
    });
  }
}

export function createQualityFileDirectory(
  authorization: Pick<AppAuthorization, 'permissionSets' | 'administration'>,
): QualityDirectory {
  return createAuthorizationDirectory(authorization);
}

const ATTACHMENT_DISK = 'local';

/**
 * Uploads through the file plugin's Repository. The business columns are bound
 * as Repository create defaults so the stored row carries its target and
 * uploader from the moment the metadata commit succeeds.
 */
export function createRepositoryStore(
  manager: ServerFileRepositoryManager,
  disk = ATTACHMENT_DISK,
): AttachmentStore {
  return {
    async upload(input: AttachmentStoreInput): Promise<StoredAttachment> {
      const repository = manager.repository('qualityAttachments', {
        disk,
        accessPath: '/quality-attachments',
        policy: {
          read: true,
          create: {
            scope: true,
            defaults: {
              targetType: input.targetType,
              targetId: input.targetId,
              category: input.category,
              uploadedById: input.uploadedById,
            },
          },
          update: false,
          delete: false,
        },
      });
      const { record } = await repository.uploadOne({ file: input.file });
      return {
        id: String(record.id),
        disk: String(record.disk),
        key: String(record.key),
        filename: String(record.filename),
        ext: String(record.ext ?? ''),
        mimeType: String(record.mimeType),
        size: Number(record.size),
        createdAt: toIso(record.createdAt) ?? new Date().toISOString(),
        updatedAt: toIso(record.updatedAt) ?? new Date().toISOString(),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

interface AttachmentRow extends Row {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number | bigint | string;
  createdAt: Date | string;
  targetType: string | null;
  targetId: string | null;
  category: string | null;
  uploadedById: string | null;
}

interface ItemRow extends Row {
  id: string;
  taskId: string;
}

interface TaskRow extends Row {
  id: string;
  inspectorId: string;
  status: string;
}

interface NonconformanceRow extends Row {
  id: string;
  taskId: string;
  assignedToId: string;
  status: string;
}

export interface QualityFileServiceOptions {
  readonly database: DatabaseManager;
  readonly directory: QualityDirectory;
  readonly store: AttachmentStore;
  readonly storage: AttachmentStorage;
}

export function createQualityFileService(
  options: QualityFileServiceOptions,
): QualityFileService {
  const { database, directory, store, storage } = options;

  const isSupervisor = (actor: QualityActor): boolean =>
    actor.roles.includes(QUALITY_SUPERVISOR_ROLE) ||
    actor.roles.includes(SYSTEM_ADMINISTRATOR_ROLE);
  const isInspector = (actor: QualityActor): boolean =>
    actor.roles.includes(INSPECTOR_ROLE);
  const isProductionLead = (actor: QualityActor): boolean =>
    actor.roles.includes(PRODUCTION_LEAD_ROLE);

  function requireCategory(
    targetType: unknown,
    category: unknown,
  ): { targetType: AttachmentTargetType; category: AttachmentCategory } {
    if (
      targetType !== 'batch' &&
      targetType !== 'item' &&
      targetType !== 'nonconformance'
    ) {
      throw new QualityError(
        'VALIDATION',
        'targetType must be batch, item or nonconformance.',
        400,
      );
    }
    const allowed = CATEGORIES_BY_TARGET[targetType];
    if (
      typeof category !== 'string' ||
      !allowed.includes(category as AttachmentCategory)
    ) {
      throw new QualityError(
        'VALIDATION',
        `category must be one of ${allowed.join(', ')} for ${targetType}.`,
        400,
      );
    }
    return { targetType, category: category as AttachmentCategory };
  }

  function requireTargetId(value: unknown): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new QualityError('VALIDATION', 'targetId is required.', 400);
    }
    return value.trim();
  }

  async function findTask(taskId: string): Promise<TaskRow | undefined> {
    return database
      .query()
      .selectFrom('inspectionTasks')
      .select(['id', 'inspectorId', 'status'])
      .where('id', '=', taskId)
      .executeTakeFirst<TaskRow>();
  }

  async function findItem(itemId: string): Promise<ItemRow | undefined> {
    return database
      .query()
      .selectFrom('inspectionItems')
      .select(['id', 'taskId'])
      .where('id', '=', itemId)
      .executeTakeFirst<ItemRow>();
  }

  async function findNonconformance(
    id: string,
  ): Promise<NonconformanceRow | undefined> {
    return database
      .query()
      .selectFrom('nonconformances')
      .select(['id', 'taskId', 'assignedToId', 'status'])
      .where('id', '=', id)
      .executeTakeFirst<NonconformanceRow>();
  }

  async function hasAssignedNonconformance(
    taskId: string,
    userId: string,
  ): Promise<boolean> {
    const row = await database
      .query()
      .selectFrom('nonconformances')
      .select('id')
      .where('taskId', '=', taskId)
      .where('assignedToId', '=', userId)
      .limit(1)
      .executeTakeFirst();
    return Boolean(row);
  }

  /**
   * Mirrors the business access rules: a supervisor sees everything, an
   * inspector their own tasks, a production lead the rectifications assigned
   * to them. Modification is narrower than viewing and follows the record's
   * status, so a submitted inspection or a closed rectification is read-only.
   */
  async function targetPermissions(
    actor: QualityActor,
    targetType: AttachmentTargetType,
    targetId: string,
  ): Promise<{ canView: boolean; canModify: boolean }> {
    if (targetType === 'batch') {
      const batch = await database
        .query()
        .selectFrom('productionBatches')
        .select('id')
        .where('id', '=', targetId)
        .executeTakeFirst();
      if (!batch) {
        throw new QualityError('NOT_FOUND', 'Production batch not found.', 404);
      }
      const quality =
        isSupervisor(actor) || isInspector(actor) || isProductionLead(actor);
      return { canView: quality, canModify: isSupervisor(actor) };
    }

    if (targetType === 'item') {
      const item = await findItem(targetId);
      if (!item) {
        throw new QualityError('NOT_FOUND', 'Inspection item not found.', 404);
      }
      const task = await findTask(item.taskId);
      if (!task) {
        throw new QualityError('NOT_FOUND', 'Inspection task not found.', 404);
      }
      const isAssignedInspector =
        isInspector(actor) && task.inspectorId === actor.id;
      const assignedLead =
        isProductionLead(actor) &&
        (await hasAssignedNonconformance(task.id, actor.id));
      const canView =
        isSupervisor(actor) || isAssignedInspector || assignedLead;
      const canModify = isAssignedInspector && task.status !== 'submitted';
      return { canView, canModify };
    }

    const nonconformance = await findNonconformance(targetId);
    if (!nonconformance) {
      throw new QualityError('NOT_FOUND', 'Nonconformance not found.', 404);
    }
    const task = await findTask(nonconformance.taskId);
    const assignedLead =
      isProductionLead(actor) && nonconformance.assignedToId === actor.id;
    const inspector = isInspector(actor) && task?.inspectorId === actor.id;
    const canView = isSupervisor(actor) || assignedLead || inspector;
    const canModify =
      assignedLead &&
      ['open', 'processing', 'returned'].includes(nonconformance.status);
    return { canView, canModify };
  }

  async function assertCanView(
    actor: QualityActor,
    targetType: AttachmentTargetType,
    targetId: string,
  ): Promise<void> {
    const { canView } = await targetPermissions(actor, targetType, targetId);
    if (!canView) {
      throw new QualityError(
        'FORBIDDEN',
        'You do not have access to this record.',
        403,
      );
    }
  }

  async function assertCanModify(
    actor: QualityActor,
    targetType: AttachmentTargetType,
    targetId: string,
  ): Promise<void> {
    const { canView, canModify } = await targetPermissions(
      actor,
      targetType,
      targetId,
    );
    if (!canView) {
      throw new QualityError(
        'FORBIDDEN',
        'You do not have access to this record.',
        403,
      );
    }
    if (!canModify) {
      throw new QualityError(
        'READ_ONLY',
        'This record is read-only for the current status and role.',
        409,
      );
    }
  }

  async function findAttachment(id: string): Promise<AttachmentRow> {
    const row = await database
      .query()
      .selectFrom('qualityAttachments')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst<AttachmentRow>();
    if (!row) {
      throw new QualityError('NOT_FOUND', 'Attachment not found.', 404);
    }
    return row;
  }

  async function toView(
    row: AttachmentRow,
    names: Map<string, string>,
  ): Promise<AttachmentView> {
    if (
      (row.targetType !== 'batch' &&
        row.targetType !== 'item' &&
        row.targetType !== 'nonconformance') ||
      !row.targetId ||
      !row.category
    ) {
      throw new QualityError(
        'NOT_FOUND',
        'Attachment is not linked to a business record.',
        404,
      );
    }
    const uploadedById = row.uploadedById ?? '';
    return {
      id: row.id,
      targetType: row.targetType,
      targetId: row.targetId,
      category: row.category as AttachmentCategory,
      filename: row.filename,
      ext: row.ext,
      mimeType: row.mimeType,
      size: Number(row.size),
      uploadedById,
      uploadedByName: names.get(uploadedById) ?? uploadedById,
      createdAt: toIso(row.createdAt) ?? '',
    };
  }

  return {
    async resolveActor(
      userId: string,
      userName: string,
    ): Promise<QualityActor> {
      const roles = await directory.rolesForUser(userId);
      return { id: userId, name: userName, roles };
    },

    async list(actor, target): Promise<AttachmentListResult> {
      const targetType = requireAttachmentTargetType(target.targetType);
      const targetId = requireTargetId(target.targetId);
      const { category } = requireCategory(targetType, target.category);
      await assertCanView(actor, targetType, targetId);
      const { canModify } = await targetPermissions(
        actor,
        targetType,
        targetId,
      );

      const rows = await database
        .query()
        .selectFrom('qualityAttachments')
        .selectAll()
        .where('targetType', '=', targetType)
        .where('targetId', '=', targetId)
        .where('category', '=', category)
        .orderBy('createdAt', 'asc')
        .execute<AttachmentRow>();
      const names = await userMap(directory);
      return {
        canModify,
        files: await Promise.all(rows.map((row) => toView(row, names))),
      };
    },

    async upload(actor, target, file): Promise<AttachmentView> {
      const targetType = requireAttachmentTargetType(target.targetType);
      const targetId = requireTargetId(target.targetId);
      const { category } = requireCategory(targetType, target.category);
      await assertCanModify(actor, targetType, targetId);

      if (!(file instanceof File)) {
        throw new QualityError('INVALID_FILE', 'A file is required.', 400);
      }
      if (file.size <= 0) {
        throw new QualityError('EMPTY_FILE', 'The file is empty.', 400);
      }
      if (file.size > MAX_ATTACHMENT_SIZE) {
        throw new QualityError(
          'TOO_LARGE',
          'The file exceeds the 5 MB limit.',
          413,
        );
      }

      const stored = await store.upload({
        file,
        targetType,
        targetId,
        category,
        uploadedById: actor.id,
      });
      const names = await userMap(directory);
      return {
        id: stored.id,
        targetType,
        targetId,
        category,
        filename: stored.filename,
        ext: stored.ext,
        mimeType: stored.mimeType,
        size: stored.size,
        uploadedById: actor.id,
        uploadedByName: names.get(actor.id) ?? actor.name,
        createdAt: stored.createdAt,
      };
    },

    async remove(actor, id): Promise<void> {
      const row = await findAttachment(id);
      const targetType = requireAttachmentTargetType(row.targetType);
      await assertCanModify(actor, targetType, row.targetId ?? '');
      await database
        .query()
        .deleteFrom('qualityAttachments')
        .where('id', '=', id)
        .execute();
      try {
        await storage.delete(row.disk, row.key);
      } catch {
        // The metadata is gone; an orphaned object is acceptable and must not
        // make a successful removal look like a failure.
      }
    },

    async open(actor, id): Promise<AttachmentDownload> {
      const row = await findAttachment(id);
      const targetType = requireAttachmentTargetType(row.targetType);
      await assertCanView(actor, targetType, row.targetId ?? '');
      if (!(await storage.exists(row.disk, row.key))) {
        throw new QualityError(
          'NOT_FOUND',
          'Attachment content not found.',
          404,
        );
      }
      return {
        filename: row.filename,
        mimeType: row.mimeType,
        size: Number(row.size),
        stream: await storage.getStream(row.disk, row.key),
      };
    },
  };
}

function requireAttachmentTargetType(value: unknown): AttachmentTargetType {
  if (value === 'batch' || value === 'item' || value === 'nonconformance') {
    return value;
  }
  throw new QualityError(
    'VALIDATION',
    'targetType must be batch, item or nonconformance.',
    400,
  );
}

async function userMap(
  directory: QualityDirectory,
): Promise<Map<string, string>> {
  const users = await directory.listUsers();
  return new Map(users.map((user) => [user.id, user.name]));
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}
