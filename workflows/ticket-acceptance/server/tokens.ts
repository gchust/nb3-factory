import type { ServiceToken } from '@nocobase/service-provider';

/**
 * A workflow run module is loaded from a content-addressed snapshot of this
 * package, not from the application's compiled tree. The loader's containment
 * rule forbids it from importing application code, so it cannot import the
 * application's `ticketServiceToken` object either; and service tokens are
 * container keys compared by identity, so a plain module-level token created
 * here would be a different key from the one the application registered.
 *
 * `Symbol.for` names one key in the process-global registry, so the
 * application and this snapshot receive the same symbol. The application
 * derives the same symbol independently from the string below
 * (`server/service/ticket-service.ts`); the two names are one contract.
 */
const TICKET_SERVICE_TOKEN_KEY = 'equipment-service/service.ticket';

/**
 * The part of the application's ticket service the acceptance workflow uses.
 * Keeping the port here rather than importing the class means the snapshot
 * needs no import that crosses its own package boundary.
 */
export interface AcceptanceTicketService {
  getTicket(ticketId: number): Promise<{
    readonly status: string;
    readonly ticketNo: string;
    readonly ownerId: string | null;
  }>;
  applyAcceptance(
    ticketId: number,
    actor: { id: string; name?: string },
    input: {
      ownerId: string | null;
      priority?: string;
      acceptedAt: string;
      note?: string;
    },
  ): Promise<{
    readonly ticketNo: string;
    readonly ownerId: string | null;
    readonly status: string;
  }>;
  rejectTicket(
    ticketId: number,
    actor: { id: string; name?: string },
    reason: string,
  ): Promise<{ readonly ticketNo: string; readonly status: string }>;
  recordStep(entry: {
    ticketId: number;
    step: string;
    status: 'success' | 'failed' | 'running';
    message?: string | null;
    retryable?: boolean;
    eventKey?: string | null;
  }): Promise<void>;
}

export const ticketServiceToken = Symbol.for(
  TICKET_SERVICE_TOKEN_KEY,
) as unknown as ServiceToken<AcceptanceTicketService>;
