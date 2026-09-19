import type { DatabaseManager, QueryAdapter, Row } from '@nocobase/db';
import { createServiceToken } from '@nocobase/service-provider';

import {
  isBookingAttachmentKind,
  isVenueAttachmentKind,
  MAX_FILE_BYTES,
  MAX_FILES_PER_UPLOAD,
  type AttachmentKind,
  type AttachmentRecord,
} from './rental-files.js';

/** A venue may only take new bookings while it is `available`. */
export const VENUE_STATUSES = ['available', 'maintenance', 'inactive'] as const;
export type VenueStatus = (typeof VENUE_STATUSES)[number];

/**
 * Booking lifecycle. `pending` and `confirmed` are "awaiting delivery",
 * `delivered` is "awaiting return", `returned` is "awaiting settlement".
 */
export const BOOKING_STATUSES = [
  'pending',
  'confirmed',
  'delivered',
  'returned',
  'settled',
  'cancelled',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** A cancellation releases the slot; every other status keeps it reserved. */
const RESERVED_STATUSES: readonly BookingStatus[] = [
  'pending',
  'confirmed',
  'delivered',
  'returned',
  'settled',
];

export type RentalRole = 'manager' | 'staff';

export interface Actor {
  readonly userId: string;
  readonly role: RentalRole;
}

/** The business record an attachment belongs to. Exactly one id is set. */
export type AttachmentScope =
  { readonly bookingId: number } | { readonly venueId: number };

/** Cover and gallery size for one venue, used by the venue list. */
export interface VenueMediaSummary {
  readonly venueId: number;
  readonly cover: AttachmentRecord | null;
  readonly gallery: number;
}

export interface VenueRecord {
  readonly id: number;
  readonly name: string;
  readonly location: string;
  readonly capacity: number;
  readonly unitPrice: number;
  readonly status: VenueStatus;
  readonly description: string | null;
}

export interface TenantRecord {
  readonly id: number;
  readonly name: string;
  readonly contactName: string;
  readonly contactPhone: string | null;
  readonly contactEmail: string | null;
  readonly note: string | null;
}

export interface BookingRecord {
  readonly id: number;
  readonly reference: string;
  readonly venueId: number;
  readonly venueName: string | null;
  readonly venueLocation: string | null;
  readonly tenantId: number;
  readonly tenantName: string | null;
  readonly ownerId: string;
  readonly ownerName: string | null;
  readonly title: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly fee: number;
  readonly status: BookingStatus;
  readonly note: string | null;
  readonly deliveryCondition: string | null;
  readonly deliveredAt: string | null;
  readonly returnCondition: string | null;
  readonly returnedAt: string | null;
  readonly damageNote: string | null;
  readonly damageFee: number | null;
  readonly confirmedAt: string | null;
  readonly settledAt: string | null;
  readonly cancelReason: string | null;
  readonly cancelledAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OwnerRecord {
  readonly id: string;
  readonly name: string;
  readonly username: string | null;
}

export interface VenueUtilization {
  readonly venueId: number;
  readonly venueName: string;
  readonly bookings: number;
  readonly bookedHours: number;
  readonly revenue: number;
  readonly utilization: number;
}

export interface RentalSummary {
  readonly from: string;
  readonly to: string;
  readonly totals: {
    readonly bookings: number;
    readonly byStatus: Readonly<Record<BookingStatus, number>>;
    readonly revenue: number;
    readonly damageFees: number;
  };
  readonly venues: readonly VenueUtilization[];
}

export interface BookingFilters {
  readonly status?: string;
  readonly venueId?: number;
  readonly ownerId?: string;
  readonly search?: string;
  readonly from?: Date;
  readonly to?: Date;
}

export interface CreateBookingInput {
  readonly venueId: number;
  readonly tenantId: number;
  readonly title: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly fee?: number;
  readonly ownerId?: string;
  readonly note?: string;
}

export interface CancelBookingInput {
  readonly reason?: string;
}

export interface RentalErrorShape {
  readonly code: string;
  readonly message: string;
  readonly status: number;
}

export class RentalError extends Error implements RentalErrorShape {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'RentalError';
  }
}

function invalid(message: string): RentalError {
  return new RentalError('VALIDATION_FAILED', message, 400);
}

function notFound(message: string): RentalError {
  return new RentalError('NOT_FOUND', message, 404);
}

function conflict(code: string, message: string): RentalError {
  return new RentalError(code, message, 409);
}

function forbidden(message: string): RentalError {
  return new RentalError('FORBIDDEN', message, 403);
}

const OPEN_HOURS_PER_DAY = 12;
const MAX_ROW_LIMIT = 500;

/**
 * Domain service for venues, tenants and rental bookings.
 *
 * Every read and write is scoped by the caller's role: staff may only see and
 * change bookings they own, while managers see and act on everything. The
 * service never reads a Hono context; it receives an {@link Actor} built by the
 * route from the authenticated session.
 */
export class RentalService {
  public constructor(private readonly database: DatabaseManager) {}

  public async listVenues(filters: {
    readonly search?: string;
    readonly status?: string;
  }): Promise<readonly VenueRecord[]> {
    let query = this.database
      .query()
      .selectFrom('rentalVenues')
      .selectAll()
      .orderBy('name', 'asc');

    if (filters.status) {
      query = query.where('status', '=', filters.status);
    }
    if (filters.search) {
      query = query.where('name', 'like', `%${filters.search}%`);
    }

    const rows = await query.limit(MAX_ROW_LIMIT).execute();
    return rows.map(mapVenue);
  }

  public async listTenants(filters: {
    readonly search?: string;
  }): Promise<readonly TenantRecord[]> {
    let query = this.database
      .query()
      .selectFrom('rentalTenants')
      .selectAll()
      .orderBy('name', 'asc');

    if (filters.search) {
      query = query.where('name', 'like', `%${filters.search}%`);
    }

    const rows = await query.limit(MAX_ROW_LIMIT).execute();
    return rows.map(mapTenant);
  }

  public async listBookings(
    actor: Actor,
    filters: BookingFilters,
  ): Promise<readonly BookingRecord[]> {
    const rows = await this.bookingQuery(actor, filters)
      .orderBy('rentalBookings.startAt', 'asc')
      .limit(MAX_ROW_LIMIT)
      .execute();
    return rows.map(mapBooking);
  }

  public async getBooking(
    actor: Actor,
    id: number,
  ): Promise<BookingRecord | undefined> {
    const row = await this.bookingQuery(actor, {})
      .where('rentalBookings.id', '=', id)
      .executeTakeFirst();
    return row ? mapBooking(row) : undefined;
  }

  public async createBooking(
    actor: Actor,
    input: CreateBookingInput,
  ): Promise<BookingRecord> {
    const venueId = positiveInteger(input.venueId, 'venueId');
    const tenantId = positiveInteger(input.tenantId, 'tenantId');
    const title = requiredText(input.title, 'title');
    const startAt = parseDate(input.startAt, 'startAt');
    const endAt = parseDate(input.endAt, 'endAt');
    if (endAt.getTime() <= startAt.getTime()) {
      throw invalid('endAt must be after startAt.');
    }
    const fee = optionalAmount(input.fee) ?? 0;
    if (fee < 0) throw invalid('fee must not be negative.');

    // Staff always create for themselves; a manager may assign another owner,
    // but only one who is a real account.
    const ownerId =
      actor.role === 'manager' && input.ownerId
        ? requiredText(input.ownerId, 'ownerId')
        : actor.userId;
    if (ownerId !== actor.userId) {
      await this.assertOwnerExists(ownerId);
    }

    return this.database.transaction(async (connection) => {
      const venue = await connection.query
        .selectFrom('rentalVenues')
        .selectAll()
        .where('id', '=', venueId)
        .executeTakeFirst();
      if (!venue) throw notFound(`Venue ${venueId} does not exist.`);
      if (venue.status !== 'available') {
        throw conflict(
          'VENUE_UNAVAILABLE',
          'The venue is not available for new bookings.',
        );
      }

      const tenant = await connection.query
        .selectFrom('rentalTenants')
        .select('id')
        .where('id', '=', tenantId)
        .executeTakeFirst();
      if (!tenant) throw notFound(`Tenant ${tenantId} does not exist.`);

      const conflictRow = await connection.query
        .selectFrom('rentalBookings')
        .select('id')
        .where('venueId', '=', venueId)
        .where('status', 'in', [...RESERVED_STATUSES])
        // Datetime columns are stored as UTC text; bind ISO strings rather than
        // Date objects so the comparison has the same representation.
        .where('startAt', '<', endAt.toISOString())
        .where('endAt', '>', startAt.toISOString())
        .executeTakeFirst();
      if (conflictRow) {
        throw conflict(
          'TIME_CONFLICT',
          'The venue already has a booking in this time range.',
        );
      }

      const now = new Date();
      const maxId = await connection.query
        .selectFrom('rentalBookings')
        .select((eb) => [eb.fn.max('id').as('maxId')])
        .executeTakeFirst();
      const nextId = Number(maxId?.maxId ?? 0) + 1;
      const reference = `BK-${startAt.getUTCFullYear()}-${String(nextId).padStart(4, '0')}`;

      const result = await connection.query
        .insertInto('rentalBookings')
        .values({
          reference,
          venueId,
          tenantId,
          ownerId,
          title,
          startAt,
          endAt,
          fee,
          status: 'pending',
          note: input.note ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();

      const insertedId = Number(result.insertId ?? nextId);
      const created = await this.bookingQuery(actor, {}, connection.query)
        .where('rentalBookings.id', '=', insertedId)
        .executeTakeFirstOrThrow();
      return mapBooking(created);
    });
  }

  public async confirmBooking(
    actor: Actor,
    id: number,
  ): Promise<BookingRecord> {
    requireManager(actor);
    return this.transition(actor, id, {
      from: ['pending'],
      to: 'confirmed',
      apply: (now) => ({ status: 'confirmed', confirmedAt: now }),
    });
  }

  public async deliverBooking(
    actor: Actor,
    id: number,
    payload: { readonly condition?: string },
  ): Promise<BookingRecord> {
    const condition = requiredText(payload.condition, 'condition');
    return this.transition(actor, id, {
      from: ['confirmed'],
      to: 'delivered',
      apply: (now) => ({
        status: 'delivered',
        deliveryCondition: condition,
        deliveredAt: now,
      }),
    });
  }

  public async returnBooking(
    actor: Actor,
    id: number,
    payload: {
      readonly condition?: string;
      readonly damageNote?: string;
      readonly damageFee?: number;
    },
  ): Promise<BookingRecord> {
    const condition = requiredText(payload.condition, 'condition');
    const damageFee = optionalAmount(payload.damageFee);
    if (damageFee !== undefined && damageFee < 0) {
      throw invalid('damageFee must not be negative.');
    }
    const damageNote = payload.damageNote?.trim() || null;

    return this.transition(actor, id, {
      from: ['delivered'],
      to: 'returned',
      apply: (now) => ({
        status: 'returned',
        returnCondition: condition,
        returnedAt: now,
        damageNote,
        damageFee: damageNote ? (damageFee ?? 0) : (damageFee ?? null),
      }),
    });
  }

  public async settleBooking(actor: Actor, id: number): Promise<BookingRecord> {
    requireManager(actor);
    return this.transition(actor, id, {
      from: ['returned'],
      to: 'settled',
      apply: (now) => ({ status: 'settled', settledAt: now }),
    });
  }

  public async cancelBooking(
    actor: Actor,
    id: number,
    payload: CancelBookingInput,
  ): Promise<BookingRecord> {
    return this.transition(actor, id, {
      from: ['pending', 'confirmed'],
      to: 'cancelled',
      apply: (now) => ({
        status: 'cancelled',
        cancelReason: payload.reason?.trim() || null,
        cancelledAt: now,
      }),
    });
  }

  /** Managers may hand a booking to another staff member. */
  public async reassignOwner(
    actor: Actor,
    id: number,
    ownerId: string,
  ): Promise<BookingRecord> {
    requireManager(actor);
    const nextOwner = requiredText(ownerId, 'ownerId');
    await this.assertOwnerExists(nextOwner);

    return this.database.transaction(async (connection) => {
      const existing = await connection.query
        .selectFrom('rentalBookings')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!existing) throw notFound(`Booking ${id} does not exist.`);
      const status = String(existing.status) as BookingStatus;
      if (status === 'settled' || status === 'cancelled') {
        throw conflict(
          'INVALID_STATUS',
          `A ${status} booking cannot be reassigned.`,
        );
      }

      await connection.query
        .updateTable('rentalBookings')
        .set({ ownerId: nextOwner, updatedAt: new Date() })
        .where('id', '=', id)
        .execute();

      const updated = await this.bookingQuery(actor, {}, connection.query)
        .where('rentalBookings.id', '=', id)
        .executeTakeFirstOrThrow();
      return mapBooking(updated);
    });
  }

  public async listOwners(): Promise<readonly OwnerRecord[]> {
    const rows = await this.database
      .query()
      .selectFrom('user')
      .select(['id', 'name', 'username'])
      .orderBy('name', 'asc')
      .limit(MAX_ROW_LIMIT)
      .execute();
    return rows.map((row) => ({
      id: asText(row.id),
      name: asText(row.name ?? row.username ?? row.id),
      username: row.username === null ? null : asText(row.username ?? ''),
    }));
  }

  // --- Attachments ---------------------------------------------------------

  /**
   * Attachments a booking owns, grouped implicitly by `kind` on the client.
   * Staff may only read their own booking; a booking they cannot read is
   * reported as missing so the two cases are indistinguishable.
   */
  public async listBookingAttachments(
    actor: Actor,
    bookingId: number,
  ): Promise<readonly AttachmentRecord[]> {
    await this.requireBookingRead(actor, bookingId);
    return this.listAttachments({ bookingId });
  }

  public async addBookingAttachments(
    actor: Actor,
    bookingId: number,
    kind: unknown,
    fileIds: unknown,
  ): Promise<readonly AttachmentRecord[]> {
    await this.requireBookingWrite(actor, bookingId);
    if (typeof kind !== 'string' || !isBookingAttachmentKind(kind)) {
      throw invalid('Unknown booking attachment kind.');
    }
    await this.linkAttachments({ bookingId }, kind, fileIds);
    return this.listAttachments({ bookingId });
  }

  public async removeBookingAttachment(
    actor: Actor,
    bookingId: number,
    attachmentId: number,
  ): Promise<readonly AttachmentRecord[]> {
    await this.requireBookingWrite(actor, bookingId);
    await this.unlinkAttachment({ bookingId }, attachmentId);
    return this.listAttachments({ bookingId });
  }

  /** Venue media is readable by every signed-in account. */
  public async listVenueAttachments(
    _actor: Actor,
    venueId: number,
  ): Promise<readonly AttachmentRecord[]> {
    await this.requireVenueRead(venueId);
    return this.listAttachments({ venueId });
  }

  /** Only a manager maintains the venue catalogue's media. */
  public async addVenueAttachments(
    actor: Actor,
    venueId: number,
    kind: unknown,
    fileIds: unknown,
  ): Promise<readonly AttachmentRecord[]> {
    await this.requireVenueWrite(actor, venueId);
    if (typeof kind !== 'string' || !isVenueAttachmentKind(kind)) {
      throw invalid('Unknown venue attachment kind.');
    }
    await this.linkAttachments({ venueId }, kind, fileIds);
    return this.listAttachments({ venueId });
  }

  /** Every venue's cover and gallery size, for the venue list. */
  public async listVenueMedia(): Promise<readonly VenueMediaSummary[]> {
    const rows = await this.attachmentQueryForAllVenues().execute();
    const byVenue = new Map<number, VenueMediaSummary>();
    for (const row of rows) {
      const venueId = Number(row.venueId);
      const record = mapAttachment(row);
      const summary = byVenue.get(venueId) ?? {
        venueId,
        cover: null,
        gallery: 0,
      };
      if (record.kind === 'cover') {
        byVenue.set(venueId, { ...summary, cover: record });
      } else {
        byVenue.set(venueId, { ...summary, gallery: summary.gallery + 1 });
      }
    }
    return [...byVenue.values()];
  }

  public async removeVenueAttachment(
    actor: Actor,
    venueId: number,
    attachmentId: number,
  ): Promise<readonly AttachmentRecord[]> {
    await this.requireVenueWrite(actor, venueId);
    await this.unlinkAttachment({ venueId }, attachmentId);
    return this.listAttachments({ venueId });
  }

  /**
   * Whether the caller may read the bytes of a stored file: the file must be
   * linked to a business record they can read. An unlinked upload is private.
   */
  public async canReadFile(actor: Actor, fileId: string): Promise<boolean> {
    const attachment = await this.database
      .query()
      .selectFrom('rentalAttachments')
      .select(['bookingId', 'venueId'])
      .where('fileId', '=', fileId)
      .executeTakeFirst();
    if (!attachment) return false;

    const venueId = attachment.venueId;
    if (venueId !== null && venueId !== undefined) {
      const venue = await this.database
        .query()
        .selectFrom('rentalVenues')
        .select('id')
        .where('id', '=', Number(venueId))
        .executeTakeFirst();
      return Boolean(venue);
    }

    const bookingId = attachment.bookingId;
    if (bookingId === null || bookingId === undefined) return false;
    const booking = await this.database
      .query()
      .selectFrom('rentalBookings')
      .select('ownerId')
      .where('id', '=', Number(bookingId))
      .executeTakeFirst();
    if (!booking) return false;
    return actor.role === 'manager' || asText(booking.ownerId) === actor.userId;
  }

  private async listAttachments(
    scope: AttachmentScope,
  ): Promise<readonly AttachmentRecord[]> {
    const rows = await this.attachmentQuery(scope).execute();
    return rows.map(mapAttachment);
  }

  private attachmentQueryForAllVenues(
    query: QueryAdapter = this.database.query(),
  ) {
    return query
      .selectFrom('rentalAttachments')
      .innerJoin('rentalFiles', 'rentalFiles.id', 'rentalAttachments.fileId')
      .select([
        'rentalAttachments.id as id',
        'rentalAttachments.kind as kind',
        'rentalAttachments.fileId as fileId',
        'rentalAttachments.sort as sort',
        'rentalAttachments.createdAt as createdAt',
        'rentalAttachments.venueId as venueId',
        'rentalFiles.filename as filename',
        'rentalFiles.ext as ext',
        'rentalFiles.mimeType as mimeType',
        'rentalFiles.size as size',
      ])
      .where('rentalAttachments.venueId', '>', 0)
      .orderBy('rentalAttachments.sort', 'asc')
      .orderBy('rentalAttachments.id', 'asc');
  }

  private attachmentQuery(
    scope: AttachmentScope,
    query: QueryAdapter = this.database.query(),
  ) {
    let sql = query
      .selectFrom('rentalAttachments')
      .innerJoin('rentalFiles', 'rentalFiles.id', 'rentalAttachments.fileId')
      .select([
        'rentalAttachments.id as id',
        'rentalAttachments.kind as kind',
        'rentalAttachments.fileId as fileId',
        'rentalAttachments.sort as sort',
        'rentalAttachments.createdAt as createdAt',
        'rentalFiles.filename as filename',
        'rentalFiles.ext as ext',
        'rentalFiles.mimeType as mimeType',
        'rentalFiles.size as size',
      ])
      .orderBy('rentalAttachments.sort', 'asc')
      .orderBy('rentalAttachments.id', 'asc');

    if ('bookingId' in scope) {
      sql = sql.where('rentalAttachments.bookingId', '=', scope.bookingId);
    } else {
      sql = sql.where('rentalAttachments.venueId', '=', scope.venueId);
    }
    return sql;
  }

  /**
   * Links already-uploaded files to a business record. Upload and link are
   * separate commits, so the file ids must exist before they are linked and a
   * file already linked elsewhere is left untouched. A cover replaces the
   * previous one, removing both its link and its metadata.
   */
  private async linkAttachments(
    scope: AttachmentScope,
    kind: AttachmentKind,
    fileIds: unknown,
  ): Promise<void> {
    const ids = normalizeFileIds(fileIds);
    if (kind === 'cover' && ids.length !== 1) {
      throw invalid('A venue cover holds exactly one file.');
    }

    await this.database.transaction(async (connection) => {
      const files = await connection.query
        .selectFrom('rentalFiles')
        .select(['id', 'size'])
        .where('id', 'in', ids)
        .execute();
      if (files.length !== ids.length) {
        throw invalid('One or more files do not exist.');
      }
      for (const file of files) {
        const size = Number(file.size);
        if (size <= 0) {
          throw invalid('A file is empty.');
        }
        if (size > MAX_FILE_BYTES) {
          throw invalid('A file exceeds the maximum size.');
        }
      }

      const linked = await connection.query
        .selectFrom('rentalAttachments')
        .select('fileId')
        .where('fileId', 'in', ids)
        .execute();
      const alreadyLinked = new Set(linked.map((row) => asText(row.fileId)));
      const pending = ids.filter((id) => !alreadyLinked.has(id));
      if (!pending.length) return;

      if (kind === 'cover' && 'venueId' in scope) {
        const existing = await connection.query
          .selectFrom('rentalAttachments')
          .select(['id', 'fileId'])
          .where('venueId', '=', scope.venueId)
          .where('kind', '=', 'cover')
          .execute();
        if (existing.length) {
          await connection.query
            .deleteFrom('rentalAttachments')
            .where(
              'id',
              'in',
              existing.map((row) => Number(row.id)),
            )
            .execute();
          await connection.query
            .deleteFrom('rentalFiles')
            .where(
              'id',
              'in',
              existing.map((row) => asText(row.fileId)),
            )
            .execute();
        }
      }

      let maxQuery = connection.query
        .selectFrom('rentalAttachments')
        .select((eb) => [eb.fn.max('sort').as('maxSort')])
        .where('kind', '=', kind);
      maxQuery =
        'bookingId' in scope
          ? maxQuery.where('bookingId', '=', scope.bookingId)
          : maxQuery.where('venueId', '=', scope.venueId);
      const maxRow = await maxQuery.executeTakeFirst();

      const now = new Date();
      let sort = Number(maxRow?.maxSort ?? 0);
      for (const fileId of pending) {
        sort += 1;
        const owner =
          'bookingId' in scope
            ? { bookingId: scope.bookingId, venueId: null }
            : { bookingId: null, venueId: scope.venueId };
        await connection.query
          .insertInto('rentalAttachments')
          .values({
            ...owner,
            kind,
            fileId,
            sort,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }
    });
  }

  /** Removes a link and the file metadata it points at. */
  private async unlinkAttachment(
    scope: AttachmentScope,
    attachmentId: number,
  ): Promise<void> {
    await this.database.transaction(async (connection) => {
      let query = connection.query
        .selectFrom('rentalAttachments')
        .select(['id', 'fileId'])
        .where('id', '=', attachmentId);
      query =
        'bookingId' in scope
          ? query.where('bookingId', '=', scope.bookingId)
          : query.where('venueId', '=', scope.venueId);
      const row = await query.executeTakeFirst();
      if (!row) throw notFound(`Attachment ${attachmentId} does not exist.`);

      await connection.query
        .deleteFrom('rentalAttachments')
        .where('id', '=', attachmentId)
        .execute();
      await connection.query
        .deleteFrom('rentalFiles')
        .where('id', '=', asText(row.fileId))
        .execute();
    });
  }

  private async requireBookingRead(actor: Actor, id: number): Promise<Row> {
    const booking = await this.database
      .query()
      .selectFrom('rentalBookings')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!booking) throw notFound(`Booking ${id} does not exist.`);
    if (actor.role === 'staff' && asText(booking.ownerId) !== actor.userId) {
      throw notFound(`Booking ${id} does not exist.`);
    }
    return booking;
  }

  private async requireBookingWrite(actor: Actor, id: number): Promise<Row> {
    const booking = await this.requireBookingRead(actor, id);
    if (asText(booking.status) === 'settled') {
      throw conflict(
        'READ_ONLY',
        'A settled rental keeps its handover records read-only.',
      );
    }
    return booking;
  }

  private async requireVenueRead(venueId: number): Promise<Row> {
    const venue = await this.database
      .query()
      .selectFrom('rentalVenues')
      .selectAll()
      .where('id', '=', venueId)
      .executeTakeFirst();
    if (!venue) throw notFound(`Venue ${venueId} does not exist.`);
    return venue;
  }

  private async requireVenueWrite(actor: Actor, venueId: number): Promise<Row> {
    requireManager(actor);
    return this.requireVenueRead(venueId);
  }

  /** Booking volume, revenue and venue utilization for a time window. */
  public async summary(
    actor: Actor,
    from: Date,
    to: Date,
  ): Promise<RentalSummary> {
    if (to.getTime() <= from.getTime()) {
      throw invalid('to must be after from.');
    }
    const bookings = await this.listBookings(actor, {});
    const byStatus = Object.fromEntries(
      BOOKING_STATUSES.map((status) => [status, 0]),
    ) as Record<BookingStatus, number>;

    let revenue = 0;
    let damageFees = 0;
    const venues = new Map<
      number,
      { name: string; minutes: number; count: number; revenue: number }
    >();

    for (const booking of bookings) {
      byStatus[booking.status] += 1;
      if (booking.status !== 'cancelled') {
        revenue += booking.fee;
        damageFees += booking.damageFee ?? 0;
      }

      const start = new Date(booking.startAt).getTime();
      const end = new Date(booking.endAt).getTime();
      const overlapStart = Math.max(start, from.getTime());
      const overlapEnd = Math.min(end, to.getTime());
      if (booking.status === 'cancelled' || overlapEnd <= overlapStart)
        continue;

      const entry = venues.get(booking.venueId) ?? {
        name: booking.venueName ?? `#${booking.venueId}`,
        minutes: 0,
        count: 0,
        revenue: 0,
      };
      entry.minutes += (overlapEnd - overlapStart) / 60000;
      entry.count += 1;
      entry.revenue += booking.fee;
      venues.set(booking.venueId, entry);
    }

    const windowDays = (to.getTime() - from.getTime()) / 86400000;
    const capacityMinutes = Math.max(windowDays, 0) * OPEN_HOURS_PER_DAY * 60;
    const utilizationRows: VenueUtilization[] = [];
    for (const [venueId, entry] of venues) {
      utilizationRows.push({
        venueId,
        venueName: entry.name,
        bookings: entry.count,
        bookedHours: round(entry.minutes / 60),
        revenue: round(entry.revenue),
        utilization:
          capacityMinutes > 0
            ? round(Math.min(entry.minutes / capacityMinutes, 1))
            : 0,
      });
    }
    utilizationRows.sort((a, b) => b.utilization - a.utilization);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      totals: {
        bookings: bookings.length,
        byStatus,
        revenue: round(revenue),
        damageFees: round(damageFees),
      },
      venues: utilizationRows,
    };
  }

  private bookingQuery(
    actor: Actor,
    filters: BookingFilters,
    query: QueryAdapter = this.database.query(),
  ) {
    let sql = query
      .selectFrom('rentalBookings')
      .leftJoin('rentalVenues as venue', 'venue.id', 'rentalBookings.venueId')
      .leftJoin(
        'rentalTenants as tenant',
        'tenant.id',
        'rentalBookings.tenantId',
      )
      .leftJoin('user as owner', 'owner.id', 'rentalBookings.ownerId')
      .select([
        'rentalBookings.id as id',
        'rentalBookings.reference as reference',
        'rentalBookings.venueId as venueId',
        'venue.name as venueName',
        'venue.location as venueLocation',
        'rentalBookings.tenantId as tenantId',
        'tenant.name as tenantName',
        'rentalBookings.ownerId as ownerId',
        'owner.name as ownerName',
        'rentalBookings.title as title',
        'rentalBookings.startAt as startAt',
        'rentalBookings.endAt as endAt',
        'rentalBookings.fee as fee',
        'rentalBookings.status as status',
        'rentalBookings.note as note',
        'rentalBookings.deliveryCondition as deliveryCondition',
        'rentalBookings.deliveredAt as deliveredAt',
        'rentalBookings.returnCondition as returnCondition',
        'rentalBookings.returnedAt as returnedAt',
        'rentalBookings.damageNote as damageNote',
        'rentalBookings.damageFee as damageFee',
        'rentalBookings.confirmedAt as confirmedAt',
        'rentalBookings.settledAt as settledAt',
        'rentalBookings.cancelReason as cancelReason',
        'rentalBookings.cancelledAt as cancelledAt',
        'rentalBookings.createdAt as createdAt',
        'rentalBookings.updatedAt as updatedAt',
      ]);

    if (actor.role === 'staff') {
      sql = sql.where('rentalBookings.ownerId', '=', actor.userId);
    } else if (filters.ownerId) {
      sql = sql.where('rentalBookings.ownerId', '=', filters.ownerId);
    }
    if (filters.status) {
      sql = sql.where('rentalBookings.status', '=', filters.status);
    }
    if (filters.venueId !== undefined) {
      sql = sql.where('rentalBookings.venueId', '=', filters.venueId);
    }
    if (filters.from) {
      sql = sql.where('rentalBookings.endAt', '>', filters.from.toISOString());
    }
    if (filters.to) {
      sql = sql.where('rentalBookings.startAt', '<', filters.to.toISOString());
    }
    if (filters.search) {
      const term = `%${filters.search}%`;
      sql = sql.where((eb) =>
        eb.or([
          eb('rentalBookings.title', 'like', term),
          eb('rentalBookings.reference', 'like', term),
          eb('venue.name', 'like', term),
          eb('tenant.name', 'like', term),
        ]),
      );
    }
    return sql;
  }

  private async transition(
    actor: Actor,
    id: number,
    options: {
      readonly from: readonly BookingStatus[];
      readonly to: BookingStatus;
      readonly apply: (now: Date) => Row;
    },
  ): Promise<BookingRecord> {
    return this.database.transaction(async (connection) => {
      let query = connection.query
        .selectFrom('rentalBookings')
        .selectAll()
        .where('id', '=', id);
      if (actor.role === 'staff') {
        query = query.where('ownerId', '=', actor.userId);
      }
      const existing = await query.executeTakeFirst();
      if (!existing) {
        // Distinguish "does not exist" from "not yours" without leaking the
        // other staff member's booking through a 404/403 difference.
        const any = await connection.query
          .selectFrom('rentalBookings')
          .select('id')
          .where('id', '=', id)
          .executeTakeFirst();
        if (any && actor.role === 'staff') {
          throw forbidden('You may only act on bookings assigned to you.');
        }
        throw notFound(`Booking ${id} does not exist.`);
      }

      const status = String(existing.status) as BookingStatus;
      if (!options.from.includes(status)) {
        throw conflict(
          'INVALID_STATUS',
          `A ${status} booking cannot move to ${options.to}.`,
        );
      }

      const now = new Date();
      const result = await connection.query
        .updateTable('rentalBookings')
        .set({ ...options.apply(now), updatedAt: now })
        .where('id', '=', id)
        .where('status', '=', status)
        .execute();
      if ((result.updatedCount ?? 0) === 0) {
        throw conflict(
          'INVALID_STATUS',
          'The booking was changed by someone else; reload and try again.',
        );
      }

      const updated = await this.bookingQuery(actor, {}, connection.query)
        .where('rentalBookings.id', '=', id)
        .executeTakeFirstOrThrow();
      return mapBooking(updated);
    });
  }

  private async assertOwnerExists(ownerId: string): Promise<void> {
    const owner = await this.database
      .query()
      .selectFrom('user')
      .select('id')
      .where('id', '=', ownerId)
      .executeTakeFirst();
    if (!owner) throw invalid(`Owner ${ownerId} does not exist.`);
  }
}

export const rentalServiceToken =
  createServiceToken<RentalService>('app/rental-service');

function requireManager(actor: Actor): void {
  if (actor.role !== 'manager') {
    throw forbidden('Only a manager may perform this action.');
  }
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw invalid(`${field} must be a positive integer.`);
  }
  return parsed;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw invalid(`${field} is required.`);
  }
  return value.trim();
}

function parseDate(value: unknown, field: string): Date {
  if (typeof value !== 'string' && !(value instanceof Date)) {
    throw invalid(`${field} must be a date.`);
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw invalid(`${field} must be a valid date.`);
  }
  return date;
}

function optionalAmount(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw invalid('Amount must be a number.');
  return round(parsed);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    // Datetime columns come back as UTC text without a timezone suffix; treat
    // them as UTC rather than the server's local zone.
    const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
      ? value
      : `${value}Z`;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }
  return new Date(0).toISOString();
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? round(parsed) : null;
}

function textOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : asText(value);
}

/** Converts a database value to text without ever stringifying an object. */
function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function mapVenue(row: Row): VenueRecord {
  return {
    id: Number(row.id),
    name: asText(row.name),
    location: asText(row.location),
    capacity: Number(row.capacity),
    unitPrice: Number(row.unitPrice ?? 0),
    status: asText(row.status) as VenueStatus,
    description: textOrNull(row.description),
  };
}

function mapTenant(row: Row): TenantRecord {
  return {
    id: Number(row.id),
    name: asText(row.name),
    contactName: asText(row.contactName ?? ''),
    contactPhone: textOrNull(row.contactPhone),
    contactEmail: textOrNull(row.contactEmail),
    note: textOrNull(row.note),
  };
}

function mapBooking(row: Row): BookingRecord {
  return {
    id: Number(row.id),
    reference: asText(row.reference),
    venueId: Number(row.venueId),
    venueName: textOrNull(row.venueName),
    venueLocation: textOrNull(row.venueLocation),
    tenantId: Number(row.tenantId),
    tenantName: textOrNull(row.tenantName),
    ownerId: asText(row.ownerId ?? ''),
    ownerName: textOrNull(row.ownerName),
    title: asText(row.title),
    startAt: toIso(row.startAt),
    endAt: toIso(row.endAt),
    fee: Number(row.fee ?? 0),
    status: asText(row.status) as BookingStatus,
    note: textOrNull(row.note),
    deliveryCondition: textOrNull(row.deliveryCondition),
    deliveredAt: row.deliveredAt == null ? null : toIso(row.deliveredAt),
    returnCondition: textOrNull(row.returnCondition),
    returnedAt: row.returnedAt == null ? null : toIso(row.returnedAt),
    damageNote: textOrNull(row.damageNote),
    damageFee: numberOrNull(row.damageFee),
    confirmedAt: row.confirmedAt == null ? null : toIso(row.confirmedAt),
    settledAt: row.settledAt == null ? null : toIso(row.settledAt),
    cancelReason: textOrNull(row.cancelReason),
    cancelledAt: row.cancelledAt == null ? null : toIso(row.cancelledAt),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function mapAttachment(row: Row): AttachmentRecord {
  return {
    id: Number(row.id),
    kind: asText(row.kind) as AttachmentKind,
    fileId: asText(row.fileId),
    filename: asText(row.filename),
    ext: asText(row.ext),
    mimeType: asText(row.mimeType),
    size: Number(row.size ?? 0),
    sort: Number(row.sort ?? 0),
    createdAt: toIso(row.createdAt),
  };
}

/** Validates, de-duplicates and bounds the file ids of one link request. */
function normalizeFileIds(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    throw invalid('fileIds must be an array.');
  }
  const ids = [
    ...new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  ];
  if (!ids.length) throw invalid('At least one file is required.');
  if (ids.length > MAX_FILES_PER_UPLOAD) {
    throw invalid(
      `At most ${MAX_FILES_PER_UPLOAD} files may be attached at once.`,
    );
  }
  return ids;
}
