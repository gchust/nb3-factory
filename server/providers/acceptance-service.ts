import { workflowServiceToken } from '@nocobase/app-plugin-workflow/server';
import type { Logger } from '@nocobase/logging';
import type { ServiceResolver } from '@nocobase/service-provider';
import { serviceTicketServiceToken } from './tokens.js';

/**
 * Entry point for automatic ticket acceptance. The configured Workflow owns
 * the priority branch and the notifications; this adapter triggers it and, if
 * the workflow is absent or disabled, falls back to the same idempotent service
 * method the workflow's last step calls. A failure is never swallowed: the
 * ticket service records it on the ticket, and it is logged here.
 */

export const TICKET_ACCEPTANCE_WORKFLOW = 'ticket-acceptance';

export interface AcceptanceDispatchResult {
  via: 'workflow' | 'service';
  status: 'scheduled' | 'accepted' | 'already_handled' | 'failed';
  error?: string;
}

export class ServiceAcceptanceService {
  public constructor(
    private readonly resolver: ServiceResolver,
    private readonly logger: Logger,
  ) {}

  public async dispatch(ticketId: number): Promise<AcceptanceDispatchResult> {
    if (this.resolver.has(workflowServiceToken)) {
      const workflow = this.resolver.resolve(workflowServiceToken);
      try {
        const receipt = await workflow.trigger(
          TICKET_ACCEPTANCE_WORKFLOW,
          { ticketId: String(ticketId) },
          { eventKey: `ticket-created:${ticketId}` },
        );
        if (receipt.status === 'accepted') {
          return { via: 'workflow', status: 'scheduled' };
        }
        this.logger.info(
          { ticketId, reason: receipt.reason },
          'ticket-acceptance workflow unavailable; using the direct service',
        );
      } catch (error) {
        this.logger.warn(
          { err: error, ticketId },
          'ticket-acceptance workflow trigger failed; using the direct service',
        );
      }
    }

    const service = this.resolver.resolve(serviceTicketServiceToken);
    try {
      const outcome = await service.automaticAccept(ticketId);
      return { via: 'service', status: outcome.status };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        { err: error, ticketId },
        'automatic ticket acceptance failed',
      );
      return { via: 'service', status: 'failed', error: message };
    }
  }
}
