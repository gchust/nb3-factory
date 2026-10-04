import type { DatabaseManager } from '@nocobase/db';

import type { Customer, Device, Ticket } from './domain.js';
import { ServiceNotFoundError, ServiceValidationError } from './errors.js';
import type { TicketService } from './ticket-service.js';

export interface ExternalTicketEvent {
  readonly eventId?: string | null;
  readonly title?: string | null;
  readonly description?: string | null;
  readonly priority?: string | null;
  readonly deviceNo?: string | null;
  readonly customerCode?: string | null;
  readonly occurredAt?: string | null;
  readonly confidential?: boolean;
}

export interface ExternalTicketActor {
  readonly id: string;
  readonly name?: string;
}

export interface ExternalTicketService {
  ingest(
    input: ExternalTicketEvent,
    actor: ExternalTicketActor,
  ): Promise<{ ticket: Ticket; duplicated: boolean }>;
  lookup(eventId: string): Promise<Ticket>;
}

const PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);

export function createExternalTicketService(
  database: DatabaseManager,
  tickets: TicketService,
): ExternalTicketService {
  const devices = () => database.repository<Device>('devices');
  const customers = () => database.repository<Customer>('customers');
  const allTickets = () => database.repository<Ticket>('tickets');

  return {
    async ingest(input, actor) {
      const eventId = input.eventId?.trim();
      if (!eventId) {
        throw new ServiceValidationError('An external event id is required', {
          eventId: 'required',
        });
      }
      const existing = await allTickets().findOne({
        filter: { externalEventNo: eventId },
      });
      if (existing) return { ticket: existing, duplicated: true };

      let deviceId: number | null = null;
      let customerId: number | null = null;
      if (input.deviceNo) {
        const device = await devices().findOne({
          filter: { deviceNo: input.deviceNo },
        });
        if (device) {
          deviceId = device.id;
          customerId = device.customerId;
        }
      }
      if (customerId == null && input.customerCode) {
        const customer = await customers().findOne({
          filter: { code: input.customerCode },
        });
        if (customer) customerId = customer.id;
      }

      const priority =
        input.priority && PRIORITIES.has(input.priority)
          ? (input.priority as Ticket['priority'])
          : 'high';

      const ticket = await tickets.create(
        {
          title: input.title?.trim() || `外部平台报修 ${eventId}`,
          description: input.description ?? null,
          priority,
          // The confidentiality flag is a supervisor decision, not part of an
          // external platform's report; the ingest boundary never sets it.
          confidential: false,
          customerId,
          deviceId,
          source: 'external',
          externalEventNo: eventId,
        },
        { id: actor.id, roles: new Set(), unrestricted: false },
      );
      return { ticket, duplicated: false };
    },

    async lookup(eventId) {
      const ticket = await allTickets().findOne({
        filter: { externalEventNo: eventId },
      });
      if (!ticket) throw new ServiceNotFoundError('Unknown external event');
      return ticket;
    },
  };
}
