// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { sharedServiceToken } from '../../server/services/service-token.js';
import {
  accessServiceToken as workflowAccessServiceToken,
  ticketServiceToken as workflowTicketServiceToken,
} from '../../server/workflows/ticket-acceptance/server/service-tokens.js';

/**
 * A Workflow run script executes from a copied Artifact directory, a separate
 * module instance from the application. The two token lookups below stand for
 * those two instances; they must return the same object or the container's
 * identity-keyed bindings would never be found by a run node.
 */
describe('workflow service-token registry', () => {
  it('returns the application token by name from the workflow copy', () => {
    expect(workflowAccessServiceToken).toBe(
      sharedServiceToken('service.application.access'),
    );
    expect(workflowTicketServiceToken).toBe(
      sharedServiceToken('service.application.tickets'),
    );
  });

  it('returns the same token on repeated lookups', () => {
    expect(sharedServiceToken('service.application.tickets')).toBe(
      sharedServiceToken('service.application.tickets'),
    );
  });
});
