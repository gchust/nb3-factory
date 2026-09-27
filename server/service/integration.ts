import {
  databaseManagerToken,
  type DatabaseManager,
  type Row,
} from '@nocobase/db';
import {
  createServiceToken,
  type ServiceResolver,
} from '@nocobase/service-provider';
import {
  ServiceError,
  serviceAccessToken,
  type ServiceIdentity,
} from './access.js';
import { serviceTicketToken, type TicketActionActor } from './tickets.js';
import { textValue } from './text.js';

/**
 * Device platform integration.
 *
 * Callers authenticate with a revocable API key, so the request arrives as an
 * ordinary session and the key's owner's roles apply. Every accepted event is
 * stored under its idempotency key, and a repeat returns the original outcome
 * instead of acting twice.
 */

export const serviceIntegrationToken =
  createServiceToken<ServiceIntegrationService>('service.integration');

export const SUPPORTED_EVENT_TYPES = [
  'device.fault.reported',
  'device.heartbeat',
  'ticket.status.changed',
] as const;

export type IntegrationEventType = (typeof SUPPORTED_EVENT_TYPES)[number];

export interface IntegrationEventInput {
  readonly idempotencyKey: string;
  readonly eventType: string;
  readonly deviceSerial?: string | null;
  readonly ticketSerial?: string | null;
  readonly payload?: Record<string, unknown> | null;
}

export interface IntegrationEventResult {
  readonly replayed: boolean;
  readonly event: Row;
  readonly ticketId?: number | null;
  readonly message: string;
}

export class ServiceIntegrationService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly container: ServiceResolver,
  ) {}

  async ingest(input: {
    readonly identity: ServiceIdentity;
    readonly actor: TicketActionActor;
    readonly event: IntegrationEventInput;
  }): Promise<IntegrationEventResult> {
    const access = this.container.resolve(serviceAccessToken);
    access.requireIntegration(input.identity);

    const idempotencyKey = input.event.idempotencyKey?.trim();
    if (!idempotencyKey) {
      throw new ServiceError(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'An idempotency key is required so retries do not duplicate work.',
      );
    }

    const existing = await this.findByKey(idempotencyKey);
    if (existing) {
      return {
        replayed: true,
        event: existing,
        ticketId:
          existing.ticketId === null || existing.ticketId === undefined
            ? null
            : Number(existing.ticketId),
        message: `Event already processed with status "${String(existing.status)}".`,
      };
    }

    const known = (SUPPORTED_EVENT_TYPES as readonly string[]).includes(
      input.event.eventType,
    );
    if (!known) {
      await this.record({
        identity: input.identity,
        event: input.event,
        idempotencyKey,
        status: 'rejected',
        ticketId: null,
        error: `Unsupported event type "${input.event.eventType}".`,
      });
      throw new ServiceError(
        400,
        'UNSUPPORTED_EVENT_TYPE',
        `Unsupported event type "${input.event.eventType}".`,
      );
    }

    try {
      const outcome = await this.dispatch(input);
      const stored = await this.record({
        identity: input.identity,
        event: input.event,
        idempotencyKey,
        status: 'processed',
        ticketId: outcome.ticketId ?? null,
        error: null,
      });
      return {
        replayed: false,
        event: stored,
        ticketId: outcome.ticketId ?? null,
        message: outcome.message,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.record({
        identity: input.identity,
        event: input.event,
        idempotencyKey,
        status: 'failed',
        ticketId: null,
        error: message,
      });
      throw error;
    }
  }

  async listEvents(identity: ServiceIdentity, limit = 50): Promise<Row[]> {
    const access = this.container.resolve(serviceAccessToken);
    access.requireIntegration(identity);
    return this.database
      .query()
      .selectFrom('service_integration_events')
      .selectAll()
      .orderBy('id', 'desc')
      .limit(Math.min(Math.max(limit, 1), 200))
      .execute<Row>();
  }

  private async dispatch(input: {
    readonly identity: ServiceIdentity;
    readonly actor: TicketActionActor;
    readonly event: IntegrationEventInput;
  }): Promise<{ ticketId?: number; message: string }> {
    switch (input.event.eventType as IntegrationEventType) {
      case 'device.fault.reported':
        return this.reportFault(input);
      case 'device.heartbeat':
        return this.heartbeat(input);
      case 'ticket.status.changed':
        return this.ticketStatusChanged(input);
      default:
        throw new ServiceError(
          400,
          'UNSUPPORTED_EVENT_TYPE',
          'Unsupported event.',
        );
    }
  }

  private async reportFault(input: {
    readonly identity: ServiceIdentity;
    readonly actor: TicketActionActor;
    readonly event: IntegrationEventInput;
  }): Promise<{ ticketId?: number; message: string }> {
    const serial = input.event.deviceSerial?.trim();
    if (!serial) {
      throw new ServiceError(
        400,
        'DEVICE_SERIAL_REQUIRED',
        'A device serial number is required for a reported fault.',
      );
    }
    const device = await this.database
      .query()
      .selectFrom('service_devices')
      .selectAll()
      .where('serialNumber', '=', serial)
      .executeTakeFirst<Row>();
    if (!device) {
      throw new ServiceError(
        404,
        'DEVICE_NOT_FOUND',
        `No device is registered with serial "${serial}".`,
      );
    }
    const tickets = this.container.resolve(serviceTicketToken);
    const payload = input.event.payload ?? {};
    const customer = await this.database
      .query()
      .selectFrom('service_customers')
      .select(['id', 'name'])
      .where('id', '=', Number(device.customerId))
      .executeTakeFirst<Row>();
    const draft = await tickets.create({
      values: {
        title:
          payload.title ??
          `Fault reported by the device platform for ${serial}`,
        description:
          payload.description ??
          'Reported automatically by the device platform integration.',
        type: payload.type ?? 'repair',
        priority: payload.priority ?? 'high',
        customerId: Number(device.customerId),
        customerName: textValue(customer?.name),
        deviceId: Number(device.id),
        deviceSerial: serial,
        region: textValue(device.region, 'east'),
        source: 'integration',
      },
      actor: input.actor,
    });
    const result = await tickets.applyAction({
      ticketId: Number(draft.id),
      action: 'submit',
      payload: {},
      requestKey: `integration:${input.event.idempotencyKey}`,
      actor: input.actor,
      identity: input.identity,
    });
    return {
      ticketId: Number(draft.id),
      message: `Created ticket ${String(result.ticket.serial)}.`,
    };
  }

  private async heartbeat(input: {
    readonly identity: ServiceIdentity;
    readonly event: IntegrationEventInput;
  }): Promise<{ message: string }> {
    const serial = input.event.deviceSerial?.trim();
    if (!serial) {
      throw new ServiceError(
        400,
        'DEVICE_SERIAL_REQUIRED',
        'A device serial number is required for a heartbeat.',
      );
    }
    const now = new Date().toISOString();
    const result = await this.database
      .query()
      .updateTable('service_devices')
      .set({ updatedAt: now })
      .where('serialNumber', '=', serial)
      .execute();
    if (Number(result.updatedCount ?? 0) === 0) {
      throw new ServiceError(
        404,
        'DEVICE_NOT_FOUND',
        `No device is registered with serial "${serial}".`,
      );
    }
    return { message: `Heartbeat recorded for ${serial}.` };
  }

  private async ticketStatusChanged(input: {
    readonly identity: ServiceIdentity;
    readonly actor: TicketActionActor;
    readonly event: IntegrationEventInput;
  }): Promise<{ ticketId?: number; message: string }> {
    const serial = input.event.ticketSerial?.trim();
    if (!serial) {
      throw new ServiceError(
        400,
        'TICKET_SERIAL_REQUIRED',
        'A ticket serial number is required for a status change.',
      );
    }
    const ticket = await this.database
      .query()
      .selectFrom('service_tickets')
      .selectAll()
      .where('serial', '=', serial)
      .executeTakeFirst<Row>();
    if (!ticket) {
      throw new ServiceError(
        404,
        'TICKET_NOT_FOUND',
        `No ticket is registered with serial "${serial}".`,
      );
    }
    const tickets = this.container.resolve(serviceTicketToken);
    await tickets.applyAction({
      ticketId: Number(ticket.id),
      action: 'comment',
      payload: {
        comment: `Device platform reported: ${
          (input.event.payload?.status as string | undefined) ??
          'status changed'
        }.`,
      },
      requestKey: `integration:${input.event.idempotencyKey}`,
      actor: input.actor,
      identity: input.identity,
    });
    return {
      ticketId: Number(ticket.id),
      message: `Status change recorded on ${serial}.`,
    };
  }

  private async findByKey(idempotencyKey: string): Promise<Row | undefined> {
    return this.database
      .query()
      .selectFrom('service_integration_events')
      .selectAll()
      .where('idempotencyKey', '=', idempotencyKey)
      .executeTakeFirst<Row>();
  }

  private async record(input: {
    readonly identity: ServiceIdentity;
    readonly event: IntegrationEventInput;
    readonly idempotencyKey: string;
    readonly status: string;
    readonly ticketId: number | null;
    readonly error: string | null;
  }): Promise<Row> {
    const now = new Date().toISOString();
    const result = await this.database
      .query()
      .insertInto('service_integration_events')
      .values({
        idempotencyKey: input.idempotencyKey,
        eventType: input.event.eventType,
        deviceSerial: input.event.deviceSerial ?? null,
        status: input.status,
        ticketId: input.ticketId,
        payload: input.event.payload ?? null,
        error: input.error,
        callerId: input.identity.userId,
        processedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return this.database
      .query()
      .selectFrom('service_integration_events')
      .selectAll()
      .where('id', '=', Number(result.insertId ?? 0))
      .executeTakeFirstOrThrow<Row>();
  }
}

export function createServiceIntegrationService(
  container: ServiceResolver,
): ServiceIntegrationService {
  return new ServiceIntegrationService(
    container.resolve(databaseManagerToken),
    container,
  );
}
