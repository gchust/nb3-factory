import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization';
import type {
  FileRecord,
  ServerFileRepository,
} from '@nocobase/app-plugin-file/server';
import type { DatabaseManager, Row } from '@nocobase/db';

import { compileDatabaseFilter } from './filter.js';

export interface TicketView {
  readonly id: number;
  readonly number: string;
  readonly customerId: string;
  readonly customerName: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly priority: string;
  readonly status: string;
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  readonly createdAt: string | Date;
  readonly updatedAt: string | Date;
  readonly attachmentCount: number;
}

export interface AttachmentView {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly createdAt: string | Date;
  readonly ticketId: number | null;
  readonly uploadedById: string | null;
  readonly uploaderName: string | null;
  readonly uploaderRole: string | null;
}

export interface TicketStats {
  readonly total: number;
  readonly byStatus: readonly {
    readonly key: string;
    readonly count: number;
  }[];
  readonly byPriority: readonly {
    readonly key: string;
    readonly count: number;
  }[];
}

export interface CreateTicketInput {
  readonly title: string;
  readonly description: string | null;
  readonly priority: string;
}

export interface SupportServiceOptions {
  readonly database: DatabaseManager;
  readonly files: ServerFileRepository;
}

const TICKET_FIELDS = [
  'id',
  'number',
  'customerId',
  'title',
  'description',
  'priority',
  'status',
  'assigneeId',
  'createdAt',
  'updatedAt',
] as const;

const ATTACHMENT_FIELDS = [
  'id',
  'filename',
  'mimeType',
  'size',
  'createdAt',
  'ticketId',
  'uploadedById',
  'uploaderRole',
] as const;

/**
 * Domain logic for support tickets. The service never reads an HTTP context and
 * never decides a status code; it receives authorization conditions from the
 * route and applies their record filter inside the SQL query.
 */
export class SupportService {
  private readonly database: DatabaseManager;
  private readonly files: ServerFileRepository;

  constructor(options: SupportServiceOptions) {
    this.database = options.database;
    this.files = options.files;
  }

  async createTicket(
    input: CreateTicketInput,
    customerId: string,
  ): Promise<TicketView> {
    const id = await this.database.transaction(async (connection) => {
      const now = new Date();
      const inserted = await connection.query
        .insertInto('support_tickets')
        .values({
          // A unique placeholder keeps the column non-null until the readable
          // number derived from the generated id replaces it below.
          number: `pending-${crypto.randomUUID()}`,
          customerId,
          title: input.title,
          description: input.description,
          priority: input.priority,
          status: 'new',
          assigneeId: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      const ticketId = Number(inserted.insertId);
      await connection.query
        .updateTable('support_tickets')
        .set({ number: formatTicketNumber(ticketId) })
        .where('id', '=', ticketId)
        .execute();
      return ticketId;
    });
    const ticket = await this.findTicketById(id);
    if (!ticket) {
      throw new Error('Ticket disappeared immediately after creation.');
    }
    return ticket;
  }

  async listTickets(
    conditions: DatabaseAuthorizationConditions,
  ): Promise<readonly TicketView[]> {
    const rows = await this.database
      .query()
      .selectFrom('support_tickets')
      .select([...TICKET_FIELDS])
      .where((eb) => compileDatabaseFilter(eb, conditions.filter))
      .orderBy('createdAt', 'desc')
      .limit(200)
      .execute();
    return this.decorateTickets(rows);
  }

  async findTicket(
    id: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<TicketView | null> {
    const row = await this.database
      .query()
      .selectFrom('support_tickets')
      .select([...TICKET_FIELDS])
      .where('id', '=', id)
      .where((eb) => compileDatabaseFilter(eb, conditions.filter))
      .executeTakeFirst();
    if (!row) return null;
    const [ticket] = await this.decorateTickets([row]);
    return ticket ?? null;
  }

  async updateTicketStatus(
    id: number,
    values: { readonly status: string; readonly assigneeId?: string },
    conditions: DatabaseAuthorizationConditions,
  ): Promise<number> {
    const result = await this.database
      .query()
      .updateTable('support_tickets')
      .set({ ...values, updatedAt: new Date() })
      .where('id', '=', id)
      .where((eb) => compileDatabaseFilter(eb, conditions.filter))
      .execute();
    return result.updatedCount ?? 0;
  }

  async listAttachments(
    ticketId: number,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<readonly AttachmentView[]> {
    const rows = await this.database
      .query()
      .selectFrom('support_attachments')
      .select([...ATTACHMENT_FIELDS])
      .where('ticketId', '=', ticketId)
      .where((eb) => compileDatabaseFilter(eb, conditions.filter))
      .orderBy('createdAt', 'asc')
      .execute();
    return this.decorateAttachments(rows);
  }

  async uploadAttachments(input: {
    readonly files: readonly File[];
    readonly ticketId: number;
    readonly customerId: string;
    readonly uploadedById: string;
    readonly uploaderRole: string;
  }): Promise<readonly AttachmentView[]> {
    const created: AttachmentView[] = [];
    for (const file of input.files) {
      const { record } = await this.files.uploadOne({ file });
      await this.database
        .query()
        .updateTable('support_attachments')
        .set({
          ticketId: input.ticketId,
          customerId: input.customerId,
          uploadedById: input.uploadedById,
          uploaderRole: input.uploaderRole,
          updatedAt: new Date(),
        })
        .where('id', '=', record.id)
        .execute();
      const [view] = await this.decorateAttachments([
        {
          ...record,
          ticketId: input.ticketId,
          uploadedById: input.uploadedById,
          uploaderRole: input.uploaderRole,
        },
      ]);
      if (view) created.push(view);
    }
    return created;
  }

  async findAttachment(
    id: string,
    conditions: DatabaseAuthorizationConditions,
  ): Promise<FileRecord | null> {
    const row = await this.database
      .query()
      .selectFrom('support_attachments')
      .select([
        'id',
        'disk',
        'key',
        'filename',
        'ext',
        'mimeType',
        'size',
        'createdAt',
      ])
      .where('id', '=', id)
      .where((eb) => compileDatabaseFilter(eb, conditions.filter))
      .executeTakeFirst();
    return (row as FileRecord | undefined) ?? null;
  }

  async stats(): Promise<TicketStats> {
    const rows = await this.database
      .query()
      .selectFrom('support_tickets')
      .select(['status', 'priority'])
      .execute();
    return {
      total: rows.length,
      byStatus: groupCounts(rows, 'status'),
      byPriority: groupCounts(rows, 'priority'),
    };
  }

  private async findTicketById(id: number): Promise<TicketView | null> {
    const row = await this.database
      .query()
      .selectFrom('support_tickets')
      .select([...TICKET_FIELDS])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) return null;
    const [ticket] = await this.decorateTickets([row]);
    return ticket ?? null;
  }

  private async decorateTickets(rows: readonly Row[]): Promise<TicketView[]> {
    const userIds = new Set<string>();
    for (const row of rows) {
      const customerId = asString(row.customerId);
      const assigneeId = asString(row.assigneeId);
      if (customerId) userIds.add(customerId);
      if (assigneeId) userIds.add(assigneeId);
    }
    const names = await this.userNames([...userIds]);
    const counts = await this.attachmentCounts(
      rows.map((row) => Number(row.id)),
    );

    return rows.map((row) => {
      const id = Number(row.id);
      const customerId = asString(row.customerId) ?? '';
      const assigneeId = asString(row.assigneeId);
      return {
        id,
        number: asString(row.number) ?? '',
        customerId,
        customerName: names.get(customerId) ?? null,
        title: asString(row.title) ?? '',
        description: asString(row.description),
        priority: asString(row.priority) ?? '',
        status: asString(row.status) ?? '',
        assigneeId: assigneeId ?? null,
        assigneeName: assigneeId ? (names.get(assigneeId) ?? null) : null,
        createdAt: row.createdAt as string | Date,
        updatedAt: row.updatedAt as string | Date,
        attachmentCount: counts.get(id) ?? 0,
      };
    });
  }

  private async decorateAttachments(
    rows: readonly Row[],
  ): Promise<AttachmentView[]> {
    const userIds = new Set<string>();
    for (const row of rows) {
      const uploadedById = asString(row.uploadedById);
      if (uploadedById) userIds.add(uploadedById);
    }
    const names = await this.userNames([...userIds]);
    return rows.map((row) => {
      const uploadedById = asString(row.uploadedById);
      return {
        id: asString(row.id) ?? '',
        filename: asString(row.filename) ?? '',
        mimeType: asString(row.mimeType) ?? 'application/octet-stream',
        size: Number(row.size ?? 0),
        createdAt: row.createdAt as string | Date,
        ticketId:
          row.ticketId === null || row.ticketId === undefined
            ? null
            : Number(row.ticketId),
        uploadedById: uploadedById ?? null,
        uploaderName: uploadedById ? (names.get(uploadedById) ?? null) : null,
        uploaderRole: asString(row.uploaderRole),
      };
    });
  }

  private async attachmentCounts(
    ticketIds: readonly number[],
  ): Promise<Map<number, number>> {
    const counts = new Map<number, number>();
    if (ticketIds.length === 0) return counts;
    const rows = await this.database
      .query()
      .selectFrom('support_attachments')
      .select(['ticketId'])
      .where('ticketId', 'in', [...ticketIds])
      .execute();
    for (const row of rows) {
      const ticketId = Number(row.ticketId);
      counts.set(ticketId, (counts.get(ticketId) ?? 0) + 1);
    }
    return counts;
  }

  private async userNames(
    ids: readonly string[],
  ): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    if (ids.length === 0) return names;
    const rows = await this.database
      .query()
      .selectFrom('user')
      .select(['id', 'name', 'username', 'email'])
      .where('id', 'in', [...ids])
      .execute();
    for (const row of rows) {
      const id = asString(row.id);
      if (!id) continue;
      names.set(
        id,
        asString(row.name) ??
          asString(row.username) ??
          asString(row.email) ??
          id,
      );
    }
    return names;
  }
}

export function formatTicketNumber(id: number): string {
  return `ST-${String(id).padStart(6, '0')}`;
}

function groupCounts(
  rows: readonly Row[],
  field: string,
): readonly { readonly key: string; readonly count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = asString(row[field]);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  return null;
}
