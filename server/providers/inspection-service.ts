import type { DatabaseManager, Row } from '@nocobase/db';

export type DeviceStatus = 'in_use' | 'stopped' | 'repair';
export type PlanCycle = 'daily' | 'weekly' | 'monthly';
export type PlanStatus = 'active' | 'ended';
export type InspectionResult = 'normal' | 'abnormal';

export interface DeviceRow {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly location: string;
  readonly type: string;
  readonly status: string;
}

export interface PlanRow {
  readonly id: number;
  readonly name: string;
  readonly cycle: string;
  readonly team: string;
  readonly startDate: string;
  readonly status: string;
}

export interface RecordRow {
  readonly id: number;
  readonly deviceId: number;
  readonly planId: number | null;
  readonly result: string;
  readonly description: string | null;
  readonly team: string | null;
  readonly createdById: string;
  readonly createdByName: string | null;
  readonly deviceCode?: string | null;
  readonly deviceName?: string | null;
  readonly planName?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PhotoRow {
  readonly fileId: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
}

export interface DeviceStatRow {
  readonly deviceId: number;
  readonly code: string;
  readonly name: string;
  readonly inspections: number;
  readonly abnormals: number;
}

export interface DeviceInput {
  readonly code: string;
  readonly name: string;
  readonly location: string;
  readonly type: string;
  readonly status: string;
}

export interface PlanInput {
  readonly name: string;
  readonly cycle: string;
  readonly team: string;
  readonly startDate: string;
  readonly status: string;
}

export interface RecordInput {
  readonly deviceId: number;
  readonly planId: number | null;
  readonly result: string;
  readonly description: string | null;
  readonly team: string | null;
  readonly createdById: string;
  readonly createdByName: string | null;
  readonly photoIds: readonly string[];
}

export interface RecordQuery {
  readonly deviceId?: number;
  readonly result?: string;
  readonly from?: string;
  readonly to?: string;
  /** Restrict to records created by this user; omitted for a full read scope. */
  readonly createdById?: string;
}

export interface InspectionService {
  listDevices(): Promise<readonly DeviceRow[]>;
  findDevice(id: number): Promise<DeviceRow | undefined>;
  createDevice(input: DeviceInput): Promise<number>;
  updateDevice(id: number, input: DeviceInput): Promise<number>;
  listPlans(): Promise<readonly PlanRow[]>;
  findPlan(id: number): Promise<PlanRow | undefined>;
  createPlan(input: PlanInput): Promise<number>;
  updatePlan(id: number, input: PlanInput): Promise<number>;
  listRecords(query: RecordQuery): Promise<readonly RecordRow[]>;
  getRecord(id: number): Promise<RecordRow | undefined>;
  listPhotos(recordIds: readonly number[]): Promise<readonly PhotoRow[]>;
  fileIdsForRecord(recordId: number): Promise<readonly string[]>;
  existingFileIds(fileIds: readonly string[]): Promise<readonly string[]>;
  createRecord(input: RecordInput): Promise<number>;
  updateRecord(
    id: number,
    input: { result?: string; description?: string | null },
  ): Promise<number>;
  deleteRecordPhoto(recordId: number, fileId: string): Promise<boolean>;
  deviceStats(createdById?: string): Promise<readonly DeviceStatRow[]>;
}

export function createInspectionService(
  database: DatabaseManager,
): InspectionService {
  const query = () => database.query();

  async function findDevice(id: number) {
    const row = await query()
      .selectFrom('inspectionDevices')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row as unknown as DeviceRow | undefined;
  }

  async function findPlan(id: number) {
    const row = await query()
      .selectFrom('inspectionPlans')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row as unknown as PlanRow | undefined;
  }

  function recordQuery(
    filter: RecordQuery,
    selection: readonly string[] | null,
  ) {
    let builder = query().selectFrom('inspectionRecords');
    builder = selection ? builder.select([...selection]) : builder.selectAll();
    if (filter.deviceId !== undefined) {
      builder = builder.where('deviceId', '=', filter.deviceId);
    }
    if (filter.result) {
      builder = builder.where('result', '=', filter.result);
    }
    if (filter.from) {
      // Pass a Date, not an ISO string: the adapter stores datetimes as epoch
      // milliseconds, so only the same encoding compares correctly.
      builder = builder.where('createdAt', '>=', new Date(filter.from));
    }
    if (filter.to) {
      builder = builder.where('createdAt', '<=', new Date(filter.to));
    }
    if (filter.createdById) {
      builder = builder.where('createdById', '=', filter.createdById);
    }
    return builder.orderBy('createdAt', 'desc');
  }

  return {
    listDevices: async () =>
      (await query()
        .selectFrom('inspectionDevices')
        .selectAll()
        .orderBy('code', 'asc')
        .execute()) as unknown as readonly DeviceRow[],
    findDevice,

    async createDevice(input) {
      const now = new Date();
      const result = await query()
        .insertInto('inspectionDevices')
        .values({ ...input, createdAt: now, updatedAt: now })
        .execute();
      return Number(result.insertId);
    },

    async updateDevice(id, input) {
      const result = await query()
        .updateTable('inspectionDevices')
        .set({ ...input, updatedAt: new Date() })
        .where('id', '=', id)
        .execute();
      return result.updatedCount ?? 0;
    },

    listPlans: async () =>
      (await query()
        .selectFrom('inspectionPlans')
        .selectAll()
        .orderBy('id', 'asc')
        .execute()) as unknown as readonly PlanRow[],
    findPlan,

    async createPlan(input) {
      const now = new Date();
      const result = await query()
        .insertInto('inspectionPlans')
        .values({ ...input, createdAt: now, updatedAt: now })
        .execute();
      return Number(result.insertId);
    },

    async updatePlan(id, input) {
      const result = await query()
        .updateTable('inspectionPlans')
        .set({ ...input, updatedAt: new Date() })
        .where('id', '=', id)
        .execute();
      return result.updatedCount ?? 0;
    },

    async listRecords(filter) {
      const rows = (await recordQuery(
        filter,
        null,
      ).execute()) as unknown as readonly RecordRow[];
      if (rows.length === 0) return [];
      const deviceIds = [...new Set(rows.map((row) => row.deviceId))];
      const planIds = [
        ...new Set(
          rows
            .map((row) => row.planId)
            .filter((id): id is number => typeof id === 'number'),
        ),
      ];
      const devices = (await query()
        .selectFrom('inspectionDevices')
        .select(['id', 'code', 'name'])
        .where('id', 'in', deviceIds)
        .execute()) as unknown as readonly {
        id: number;
        code: string;
        name: string;
      }[];
      const plans = planIds.length
        ? ((await query()
            .selectFrom('inspectionPlans')
            .select(['id', 'name'])
            .where('id', 'in', planIds)
            .execute()) as unknown as readonly { id: number; name: string }[])
        : [];
      const deviceById = new Map(devices.map((device) => [device.id, device]));
      const planById = new Map(plans.map((plan) => [plan.id, plan]));
      return rows.map((row) => ({
        ...row,
        deviceCode: deviceById.get(row.deviceId)?.code ?? null,
        deviceName: deviceById.get(row.deviceId)?.name ?? null,
        planName: planById.get(row.planId ?? -1)?.name ?? null,
      }));
    },

    async getRecord(id) {
      const row = (await query()
        .selectFrom('inspectionRecords')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst()) as unknown as RecordRow | undefined;
      if (!row) return undefined;
      const device = await findDevice(row.deviceId);
      const plan =
        typeof row.planId === 'number' ? await findPlan(row.planId) : undefined;
      return {
        ...row,
        deviceCode: device?.code ?? null,
        deviceName: device?.name ?? null,
        planName: plan?.name ?? null,
      };
    },

    async listPhotos(recordIds) {
      if (recordIds.length === 0) return [];
      const links = (await query()
        .selectFrom('inspectionRecordPhotos')
        .select(['fileId', 'recordId'])
        .where('recordId', 'in', [...recordIds])
        .orderBy('id', 'asc')
        .execute()) as unknown as readonly {
        fileId: string;
        recordId: number;
      }[];
      const uniqueIds = [...new Set(links.map((link) => link.fileId))];
      if (uniqueIds.length === 0) return [];
      const files = (await query()
        .selectFrom('inspectionFiles')
        .select(['id', 'filename', 'ext', 'mimeType', 'size'])
        .where('id', 'in', uniqueIds)
        .execute()) as unknown as readonly {
        id: string;
        filename: string;
        ext: string;
        mimeType: string;
        size: number | string;
      }[];
      const fileById = new Map(files.map((file) => [file.id, file]));
      const byRecord = new Map<number, PhotoRow[]>();
      for (const link of links) {
        const file = fileById.get(link.fileId);
        if (!file) continue;
        const list = byRecord.get(link.recordId) ?? [];
        list.push({
          fileId: file.id,
          filename: file.filename,
          ext: file.ext,
          mimeType: file.mimeType,
          size: Number(file.size),
        });
        byRecord.set(link.recordId, list);
      }
      return recordIds.flatMap((recordId) => byRecord.get(recordId) ?? []);
    },

    async fileIdsForRecord(recordId) {
      const rows = (await query()
        .selectFrom('inspectionRecordPhotos')
        .select('fileId')
        .where('recordId', '=', recordId)
        .execute()) as unknown as readonly { fileId: string }[];
      return rows.map((row) => row.fileId);
    },

    async existingFileIds(fileIds) {
      if (fileIds.length === 0) return [];
      const rows = (await query()
        .selectFrom('inspectionFiles')
        .select('id')
        .where('id', 'in', [...fileIds])
        .execute()) as unknown as readonly { id: string }[];
      return rows.map((row) => row.id);
    },

    async createRecord(input) {
      const now = new Date();
      return database.transaction(async (connection) => {
        const values: Row = {
          deviceId: input.deviceId,
          planId: input.planId,
          result: input.result,
          description: input.description,
          team: input.team,
          createdById: input.createdById,
          createdByName: input.createdByName,
          createdAt: now,
          updatedAt: now,
        };
        const inserted = await connection.query
          .insertInto('inspectionRecords')
          .values(values)
          .execute();
        const recordId = Number(inserted.insertId);
        for (const fileId of input.photoIds) {
          await connection.query
            .insertInto('inspectionRecordPhotos')
            .values({ recordId, fileId, createdAt: now })
            .execute();
        }
        return recordId;
      });
    },

    async updateRecord(id, input) {
      const result = await query()
        .updateTable('inspectionRecords')
        .set({ ...input, updatedAt: new Date() })
        .where('id', '=', id)
        .execute();
      return result.updatedCount ?? 0;
    },

    async deleteRecordPhoto(recordId, fileId) {
      const link = (await query()
        .selectFrom('inspectionRecordPhotos')
        .select('id')
        .where('recordId', '=', recordId)
        .where('fileId', '=', fileId)
        .executeTakeFirst()) as unknown as { id: number } | undefined;
      if (!link) return false;
      await database.transaction(async (connection) => {
        await connection.query
          .deleteFrom('inspectionRecordPhotos')
          .where('id', '=', link.id)
          .execute();
        await connection.query
          .deleteFrom('inspectionFiles')
          .where('id', '=', fileId)
          .execute();
      });
      return true;
    },

    async deviceStats(createdById) {
      const devices = (await query()
        .selectFrom('inspectionDevices')
        .select(['id', 'code', 'name'])
        .orderBy('code', 'asc')
        .execute()) as unknown as readonly {
        id: number;
        code: string;
        name: string;
      }[];
      const rows = (await recordQuery(createdById ? { createdById } : {}, [
        'deviceId',
        'result',
      ]).execute()) as unknown as readonly {
        deviceId: number;
        result: string;
      }[];
      const totals = new Map<
        number,
        { inspections: number; abnormals: number }
      >();
      for (const row of rows) {
        const current = totals.get(row.deviceId) ?? {
          inspections: 0,
          abnormals: 0,
        };
        current.inspections += 1;
        if (row.result === 'abnormal') current.abnormals += 1;
        totals.set(row.deviceId, current);
      }
      return devices.map((device) => ({
        deviceId: device.id,
        code: device.code,
        name: device.name,
        inspections: totals.get(device.id)?.inspections ?? 0,
        abnormals: totals.get(device.id)?.abnormals ?? 0,
      }));
    },
  };
}
