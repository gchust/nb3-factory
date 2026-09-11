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

/**
 * Equipment archive and inspection domain logic.
 *
 * File uploads are handled by the file plugin repository routes; this service
 * only reads file rows and maintains the business relations (main image,
 * documents, inspection photos) in the same transaction as the equipment /
 * inspection record itself.
 */

export const FILE_ACCESS_PATHS = {
  mainImage: '/uploads/equipment-main-images',
  document: '/uploads/equipment-documents',
  photo: '/uploads/inspection-photos',
} as const;

export const EQUIPMENT_STATUSES = [
  'running',
  'maintenance',
  'stopped',
  'scrapped',
] as const;

export const INSPECTION_CONCLUSIONS = ['normal', 'issue', 'major'] as const;

export interface FileRow {
  id: string;
  disk: string;
  key: string;
  filename: string;
  ext: string;
  mimeType: string;
  size: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface EquipmentRow {
  id: number;
  deviceNo: string;
  name: string;
  location: string;
  status: string;
  owner: string | null;
  remark: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface InspectionRow {
  id: number;
  equipmentId: number;
  inspectedAt: Date | string;
  inspector: string;
  conclusion: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface EquipmentSummary extends EquipmentRow {
  mainImage?: FileRow;
  documentCount: number;
  inspectionCount: number;
}

export interface EquipmentRecord extends EquipmentSummary {
  documents: FileRow[];
  inspections: InspectionRecord[];
}

export interface InspectionRecord extends InspectionRow {
  photos: FileRow[];
}

export interface EquipmentWrite {
  deviceNo: string;
  name: string;
  location: string;
  status: string;
  owner?: string | null;
  remark?: string | null;
  mainImageId?: string;
  documentIds?: readonly string[];
}

export interface InspectionWrite {
  equipmentId: number;
  inspectedAt: string;
  inspector: string;
  conclusion: string;
  photoIds?: readonly string[];
}

/**
 * SQLite returns timestamp columns as millisecond-float strings
 * (`1788341400000.0`) or as naive local date strings, depending on how the
 * value was written. `String(value)` on those is not parseable by
 * `new Date(...)` in every case, so the service normalizes every timestamp to
 * an ISO-8601 string on the way out and accepts both forms on the way in.
 */
const NUMERIC_DATE_STRING = /^[+-]?\d+(?:\.\d+)?$/;

const parseDate = (value: Date | string | number): Date => {
  if (value instanceof Date) return value;
  const trimmed = String(value).trim();
  if (NUMERIC_DATE_STRING.test(trimmed)) return new Date(Number(trimmed));
  return new Date(trimmed);
};

const toIsoDateString = (value: Date | string | number): string => {
  const date = parseDate(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
};

const normalizeFileRow = (row: FileRow): FileRow => ({
  ...row,
  createdAt: toIsoDateString(row.createdAt),
  updatedAt: toIsoDateString(row.updatedAt),
});

const normalizeInspectionRow = (row: InspectionRow): InspectionRow => ({
  ...row,
  inspectedAt: toIsoDateString(row.inspectedAt),
  createdAt: toIsoDateString(row.createdAt),
  updatedAt: toIsoDateString(row.updatedAt),
});

const normalizeEquipmentRow = <T extends EquipmentRow>(row: T): T => ({
  ...row,
  createdAt: toIsoDateString(row.createdAt),
  updatedAt: toIsoDateString(row.updatedAt),
});

export interface EquipmentInspectionService {
  listEquipment(): Promise<EquipmentSummary[]>;
  getEquipment(id: number): Promise<EquipmentRecord | undefined>;
  createEquipment(input: EquipmentWrite): Promise<EquipmentRecord>;
  updateEquipment(id: number, input: EquipmentWrite): Promise<EquipmentRecord>;
  deleteEquipment(id: number): Promise<void>;
  getInspection(id: number): Promise<InspectionRecord | undefined>;
  createInspection(input: InspectionWrite): Promise<InspectionRecord>;
  updateInspection(
    id: number,
    input: InspectionWrite,
  ): Promise<InspectionRecord>;
  deleteInspection(id: number): Promise<void>;
}

export const equipmentInspectionServiceToken: ServiceToken<EquipmentInspectionService> =
  createServiceToken<EquipmentInspectionService>('app/equipment-inspection');

export class EquipmentInspectionError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'EquipmentInspectionError';
    this.code = code;
  }
}

export function assertEquipmentStatus(value: string): void {
  if (
    !EQUIPMENT_STATUSES.includes(value as (typeof EQUIPMENT_STATUSES)[number])
  ) {
    throw new EquipmentInspectionError(
      'INVALID_STATUS',
      `Unknown equipment status: ${value}`,
    );
  }
}

export function assertInspectionConclusion(value: string): void {
  if (
    !INSPECTION_CONCLUSIONS.includes(
      value as (typeof INSPECTION_CONCLUSIONS)[number],
    )
  ) {
    throw new EquipmentInspectionError(
      'INVALID_CONCLUSION',
      `Unknown inspection conclusion: ${value}`,
    );
  }
}

export function createEquipmentInspectionService(
  database: DatabaseManager,
): EquipmentInspectionService {
  const query = (): QueryAdapter => database.query();

  const loadEquipmentRecord = async (
    q: QueryAdapter,
    equipmentId: number,
  ): Promise<EquipmentRecord | undefined> => {
    const row = await q
      .selectFrom('equipment')
      .selectAll()
      .where('id', '=', equipmentId)
      .executeTakeFirst<EquipmentRow>();
    if (!row) return undefined;
    return buildEquipmentRecord(q, row);
  };

  const buildEquipmentRecord = async (
    q: QueryAdapter,
    row: EquipmentRow,
  ): Promise<EquipmentRecord> => {
    const [mainImage, documents, inspections] = await Promise.all([
      q
        .selectFrom('equipmentMainImages')
        .selectAll()
        .where('equipmentId', '=', row.id)
        .executeTakeFirst<FileRow>(),
      q
        .selectFrom('equipmentDocuments')
        .selectAll()
        .where('equipmentId', '=', row.id)
        .orderBy('createdAt', 'asc')
        .execute<FileRow>(),
      loadInspections(q, row.id),
    ]);
    return {
      ...normalizeEquipmentRow(row),
      mainImage: mainImage ? normalizeFileRow(mainImage) : undefined,
      documents: documents.map(normalizeFileRow),
      inspections,
      documentCount: documents.length,
      inspectionCount: inspections.length,
    };
  };

  const loadInspections = async (
    q: QueryAdapter,
    equipmentId: number,
  ): Promise<InspectionRecord[]> => {
    const rows = await q
      .selectFrom('inspectionRecords')
      .selectAll()
      .where('equipmentId', '=', equipmentId)
      .orderBy('inspectedAt', 'desc')
      .execute<InspectionRow>();
    const ids = rows.map((row) => row.id);
    if (!ids.length) return [];
    const photos = await q
      .selectFrom('inspectionPhotos')
      .selectAll()
      .where('inspectionRecordId', 'in', ids)
      .execute<FileRow & { inspectionRecordId: number }>();
    const byRecord = new Map<number, FileRow[]>();
    for (const photo of photos) {
      const list = byRecord.get(photo.inspectionRecordId) ?? [];
      list.push(photo);
      byRecord.set(photo.inspectionRecordId, list);
    }
    return rows.map((row) => ({
      ...normalizeInspectionRow(row),
      photos: (byRecord.get(row.id) ?? []).map(normalizeFileRow),
    }));
  };

  const assertDeviceNoAvailable = async (
    q: QueryAdapter,
    deviceNo: string,
    excludedId: number | undefined,
  ): Promise<void> => {
    let existing;
    if (excludedId === undefined) {
      existing = await q
        .selectFrom('equipment')
        .select('id')
        .where('deviceNo', '=', deviceNo)
        .executeTakeFirst();
    } else {
      existing = await q
        .selectFrom('equipment')
        .select('id')
        .where('deviceNo', '=', deviceNo)
        .where('id', '!=', excludedId)
        .executeTakeFirst();
    }
    if (existing) {
      throw new EquipmentInspectionError(
        'DEVICE_NO_TAKEN',
        `Device number ${deviceNo} is already in use.`,
      );
    }
  };

  const linkMainImage = async (
    q: QueryAdapter,
    equipmentId: number,
    selectedId: string | undefined,
  ): Promise<void> => {
    if (selectedId) {
      await q
        .deleteFrom('equipmentMainImages')
        .where('equipmentId', '=', equipmentId)
        .where('id', '!=', selectedId)
        .execute();
      await q
        .updateTable('equipmentMainImages')
        .set({ equipmentId })
        .where('id', '=', selectedId)
        .execute();
    } else {
      await q
        .deleteFrom('equipmentMainImages')
        .where('equipmentId', '=', equipmentId)
        .execute();
    }
  };

  const linkDocuments = async (
    q: QueryAdapter,
    equipmentId: number,
    selectedIds: readonly string[] | undefined,
  ): Promise<void> => {
    const selected = [...new Set(selectedIds ?? [])];
    if (selected.length) {
      await q
        .deleteFrom('equipmentDocuments')
        .where('equipmentId', '=', equipmentId)
        .where('id', 'not in', selected)
        .execute();
      await q
        .updateTable('equipmentDocuments')
        .set({ equipmentId })
        .where('id', 'in', selected)
        .execute();
    } else {
      await q
        .deleteFrom('equipmentDocuments')
        .where('equipmentId', '=', equipmentId)
        .execute();
    }
  };

  const linkPhotos = async (
    q: QueryAdapter,
    inspectionId: number,
    selectedIds: readonly string[] | undefined,
  ): Promise<void> => {
    const selected = [...new Set(selectedIds ?? [])];
    if (selected.length) {
      await q
        .deleteFrom('inspectionPhotos')
        .where('inspectionRecordId', '=', inspectionId)
        .where('id', 'not in', selected)
        .execute();
      await q
        .updateTable('inspectionPhotos')
        .set({ inspectionRecordId: inspectionId })
        .where('id', 'in', selected)
        .execute();
    } else {
      await q
        .deleteFrom('inspectionPhotos')
        .where('inspectionRecordId', '=', inspectionId)
        .execute();
    }
  };

  return {
    async listEquipment(): Promise<EquipmentSummary[]> {
      const rows = await query()
        .selectFrom('equipment')
        .selectAll()
        .orderBy('deviceNo', 'asc')
        .execute<EquipmentRow>();
      const ids = rows.map((row) => row.id);
      if (!ids.length) return [];
      const [images, documentCounts, inspectionCounts] = await Promise.all([
        query()
          .selectFrom('equipmentMainImages')
          .selectAll()
          .where('equipmentId', 'in', ids)
          .execute<FileRow & { equipmentId: number }>(),
        query()
          .selectFrom('equipmentDocuments')
          .select(['equipmentId', 'id'])
          .where('equipmentId', 'in', ids)
          .execute<{ equipmentId: number; id: number }>(),
        query()
          .selectFrom('inspectionRecords')
          .select(['equipmentId', 'id'])
          .where('equipmentId', 'in', ids)
          .execute<{ equipmentId: number; id: number }>(),
      ]);
      const imageByEquipment = new Map<number, FileRow>();
      for (const image of images) {
        if (!imageByEquipment.has(image.equipmentId)) {
          imageByEquipment.set(image.equipmentId, image);
        }
      }
      const documentCount = new Map<number, number>();
      for (const row of documentCounts) {
        documentCount.set(
          row.equipmentId,
          (documentCount.get(row.equipmentId) ?? 0) + 1,
        );
      }
      const inspectionCount = new Map<number, number>();
      for (const row of inspectionCounts) {
        inspectionCount.set(
          row.equipmentId,
          (inspectionCount.get(row.equipmentId) ?? 0) + 1,
        );
      }
      return rows.map((row) => {
        const image = imageByEquipment.get(row.id);
        return {
          ...normalizeEquipmentRow(row),
          mainImage: image ? normalizeFileRow(image) : undefined,
          documentCount: documentCount.get(row.id) ?? 0,
          inspectionCount: inspectionCount.get(row.id) ?? 0,
        };
      });
    },

    async getEquipment(
      equipmentId: number,
    ): Promise<EquipmentRecord | undefined> {
      return loadEquipmentRecord(query(), equipmentId);
    },

    async createEquipment(input: EquipmentWrite): Promise<EquipmentRecord> {
      assertEquipmentStatus(input.status);
      return database.transaction(async (connection) => {
        const q = connection.query;
        await assertDeviceNoAvailable(q, input.deviceNo, undefined);
        const now = new Date();
        const insertion = await q
          .insertInto('equipment')
          .values({
            deviceNo: input.deviceNo,
            name: input.name,
            location: input.location,
            status: input.status,
            owner: input.owner ?? null,
            remark: input.remark ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        const equipmentId = Number(insertion.insertId);
        if (!Number.isSafeInteger(equipmentId) || equipmentId <= 0) {
          throw new EquipmentInspectionError(
            'EQUIPMENT_CREATE_FAILED',
            'Failed to create the equipment record.',
          );
        }
        await linkMainImage(q, equipmentId, input.mainImageId);
        await linkDocuments(q, equipmentId, input.documentIds);
        const record = await loadEquipmentRecord(q, equipmentId);
        if (!record) {
          throw new EquipmentInspectionError(
            'EQUIPMENT_CREATE_FAILED',
            'Failed to reload the created equipment record.',
          );
        }
        return record;
      });
    },

    async updateEquipment(
      equipmentId: number,
      input: EquipmentWrite,
    ): Promise<EquipmentRecord> {
      assertEquipmentStatus(input.status);
      return database.transaction(async (connection) => {
        const q = connection.query;
        const existing = await q
          .selectFrom('equipment')
          .select('id')
          .where('id', '=', equipmentId)
          .executeTakeFirst();
        if (!existing) {
          throw new EquipmentInspectionError(
            'NOT_FOUND',
            'Equipment not found.',
          );
        }
        await assertDeviceNoAvailable(q, input.deviceNo, equipmentId);
        await q
          .updateTable('equipment')
          .set({
            deviceNo: input.deviceNo,
            name: input.name,
            location: input.location,
            status: input.status,
            owner: input.owner ?? null,
            remark: input.remark ?? null,
            updatedAt: new Date(),
          })
          .where('id', '=', equipmentId)
          .execute();
        await linkMainImage(q, equipmentId, input.mainImageId);
        await linkDocuments(q, equipmentId, input.documentIds);
        const record = await loadEquipmentRecord(q, equipmentId);
        if (!record) {
          throw new EquipmentInspectionError(
            'NOT_FOUND',
            'Equipment not found.',
          );
        }
        return record;
      });
    },

    async deleteEquipment(equipmentId: number): Promise<void> {
      await database.transaction(async (connection) => {
        const q = connection.query;
        const existing = await q
          .selectFrom('equipment')
          .select('id')
          .where('id', '=', equipmentId)
          .executeTakeFirst();
        if (!existing) return;
        const inspections = await q
          .selectFrom('inspectionRecords')
          .select('id')
          .where('equipmentId', '=', equipmentId)
          .execute<{ id: number }>();
        const inspectionIds = inspections.map((row) => row.id);
        if (inspectionIds.length) {
          await q
            .deleteFrom('inspectionPhotos')
            .where('inspectionRecordId', 'in', inspectionIds)
            .execute();
        }
        await q
          .deleteFrom('equipmentMainImages')
          .where('equipmentId', '=', equipmentId)
          .execute();
        await q
          .deleteFrom('equipmentDocuments')
          .where('equipmentId', '=', equipmentId)
          .execute();
        await q
          .deleteFrom('inspectionRecords')
          .where('equipmentId', '=', equipmentId)
          .execute();
        await q.deleteFrom('equipment').where('id', '=', equipmentId).execute();
      });
    },

    async getInspection(
      inspectionId: number,
    ): Promise<InspectionRecord | undefined> {
      const rows = await query()
        .selectFrom('inspectionRecords')
        .selectAll()
        .where('id', '=', inspectionId)
        .execute<InspectionRow>();
      const row = rows[0];
      if (!row) return undefined;
      const records = await loadInspections(query(), row.equipmentId);
      return records.find((record) => record.id === inspectionId);
    },

    async createInspection(input: InspectionWrite): Promise<InspectionRecord> {
      assertInspectionConclusion(input.conclusion);
      return database.transaction(async (connection) => {
        const q = connection.query;
        const equipment = await q
          .selectFrom('equipment')
          .select('id')
          .where('id', '=', input.equipmentId)
          .executeTakeFirst();
        if (!equipment) {
          throw new EquipmentInspectionError(
            'NOT_FOUND',
            'Equipment not found.',
          );
        }
        const now = new Date();
        const insertion = await q
          .insertInto('inspectionRecords')
          .values({
            equipmentId: input.equipmentId,
            inspectedAt: parseDate(input.inspectedAt),
            inspector: input.inspector,
            conclusion: input.conclusion,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        const inspectionId = Number(insertion.insertId);
        if (!Number.isSafeInteger(inspectionId) || inspectionId <= 0) {
          throw new EquipmentInspectionError(
            'INSPECTION_CREATE_FAILED',
            'Failed to create the inspection record.',
          );
        }
        await linkPhotos(q, inspectionId, input.photoIds);
        const record = await loadInspectionById(q, inspectionId);
        if (!record) {
          throw new EquipmentInspectionError(
            'INSPECTION_CREATE_FAILED',
            'Failed to reload the created inspection record.',
          );
        }
        return record;
      });
    },

    async updateInspection(
      inspectionId: number,
      input: InspectionWrite,
    ): Promise<InspectionRecord> {
      assertInspectionConclusion(input.conclusion);
      return database.transaction(async (connection) => {
        const q = connection.query;
        const existing = await q
          .selectFrom('inspectionRecords')
          .select('equipmentId')
          .where('id', '=', inspectionId)
          .executeTakeFirst();
        if (!existing) {
          throw new EquipmentInspectionError(
            'NOT_FOUND',
            'Inspection not found.',
          );
        }
        if (input.equipmentId !== Number(existing.equipmentId)) {
          const equipment = await q
            .selectFrom('equipment')
            .select('id')
            .where('id', '=', input.equipmentId)
            .executeTakeFirst();
          if (!equipment) {
            throw new EquipmentInspectionError(
              'NOT_FOUND',
              'Equipment not found.',
            );
          }
        }
        await q
          .updateTable('inspectionRecords')
          .set({
            equipmentId: input.equipmentId,
            inspectedAt: parseDate(input.inspectedAt),
            inspector: input.inspector,
            conclusion: input.conclusion,
            updatedAt: new Date(),
          })
          .where('id', '=', inspectionId)
          .execute();
        await linkPhotos(q, inspectionId, input.photoIds);
        const record = await loadInspectionById(q, inspectionId);
        if (!record) {
          throw new EquipmentInspectionError(
            'NOT_FOUND',
            'Inspection not found.',
          );
        }
        return record;
      });
    },

    async deleteInspection(inspectionId: number): Promise<void> {
      await database.transaction(async (connection) => {
        const q = connection.query;
        const existing = await q
          .selectFrom('inspectionRecords')
          .select('id')
          .where('id', '=', inspectionId)
          .executeTakeFirst();
        if (!existing) return;
        await q
          .deleteFrom('inspectionPhotos')
          .where('inspectionRecordId', '=', inspectionId)
          .execute();
        await q
          .deleteFrom('inspectionRecords')
          .where('id', '=', inspectionId)
          .execute();
      });
    },
  };
}

const loadInspectionById = async (
  q: QueryAdapter,
  inspectionId: number,
): Promise<InspectionRecord | undefined> => {
  const rows = await q
    .selectFrom('inspectionRecords')
    .selectAll()
    .where('id', '=', inspectionId)
    .execute<InspectionRow>();
  const row = rows[0];
  if (!row) return undefined;
  const photos = await q
    .selectFrom('inspectionPhotos')
    .selectAll()
    .where('inspectionRecordId', '=', inspectionId)
    .execute<FileRow>();
  return {
    ...normalizeInspectionRow(row),
    photos: photos.map(normalizeFileRow),
  };
};

export default class EquipmentInspectionProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/equipment-inspection-provider';

  public override register(): void {
    this.app.container.singleton(equipmentInspectionServiceToken, () => {
      const database = this.app.container.resolve(databaseManagerToken);
      return createEquipmentInspectionService(database);
    });
  }
}
