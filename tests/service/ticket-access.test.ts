import { describe, expect, it } from 'vitest';

import type { Application } from '@nocobase/app-server/application';
import {
  canProcessTickets,
  isAssignableRegion,
  regionScopeOf,
  requireCapability,
  seesEveryRegion,
  ticketAccessible,
  ticketWritable,
  type ServiceCaller,
  type TicketScopeRow,
} from '../../server/services/service-auth.js';
import { ServiceRuleError } from '../../server/services/tickets.js';

function caller(overrides: Partial<ServiceCaller> = {}): ServiceCaller {
  return {
    id: 'user-1',
    name: 'Test User',
    region: 'east',
    capabilities: {},
    ...overrides,
  };
}

function ticket(overrides: Partial<TicketScopeRow> = {}): TicketScopeRow {
  return {
    id: 1,
    region: 'east',
    confidential: false,
    assigneeId: null,
    reporterId: null,
    ...overrides,
  };
}

const NO_SHARES: ReadonlySet<number> = new Set();

describe('ticket record access', () => {
  it('lets a supervisor read any ticket, including confidential ones', async () => {
    const supervisor = caller({
      region: null,
      capabilities: { 'tickets.assign': true },
    });
    await expect(
      ticketAccessible(
        supervisor,
        ticket({ region: 'south', confidential: true }),
        NO_SHARES,
      ),
    ).resolves.toBe(true);
  });

  it('lets an engineer read a non-confidential ticket in their region', async () => {
    await expect(
      ticketAccessible(caller(), ticket({ region: 'east' }), NO_SHARES),
    ).resolves.toBe(true);
  });

  it('hides confidential tickets from everyone but the supervisor', async () => {
    await expect(
      ticketAccessible(caller(), ticket({ confidential: true }), NO_SHARES),
    ).resolves.toBe(false);
  });

  it('hides another region from an engineer with no relationship', async () => {
    await expect(
      ticketAccessible(caller(), ticket({ region: 'south' }), NO_SHARES),
    ).resolves.toBe(false);
  });

  it('lets the assignee and the reporter read their own ticket', async () => {
    await expect(
      ticketAccessible(
        caller({ region: 'north' }),
        ticket({ region: 'south', assigneeId: 'user-1' }),
        NO_SHARES,
      ),
    ).resolves.toBe(true);
    await expect(
      ticketAccessible(
        caller({ region: 'north' }),
        ticket({ region: 'south', reporterId: 'user-1' }),
        NO_SHARES,
      ),
    ).resolves.toBe(true);
  });

  it('lets a cross-region collaborator read only what was shared with them', async () => {
    const collaborator = caller({ id: 'collab', region: null });
    const sharedTicket = ticket({ id: 42, region: 'south' });
    await expect(
      ticketAccessible(collaborator, sharedTicket, new Set([42])),
    ).resolves.toBe(true);
    await expect(
      ticketAccessible(collaborator, sharedTicket, NO_SHARES),
    ).resolves.toBe(false);
  });

  it('keeps a shared confidential ticket hidden from the recipient', async () => {
    const collaborator = caller({ id: 'collab', region: null });
    const sharedConfidential = ticket({
      id: 43,
      region: 'south',
      confidential: true,
    });
    await expect(
      ticketAccessible(collaborator, sharedConfidential, new Set([43])),
    ).resolves.toBe(false);
  });

  it('lets the read-only observer see every non-confidential region', async () => {
    const observer = caller({
      region: 'none',
      capabilities: { 'tickets.view': true, 'records.viewAll': true },
    });
    await expect(
      ticketAccessible(observer, ticket({ region: 'south' }), NO_SHARES),
    ).resolves.toBe(true);
  });

  it('still hides confidential tickets from the read-only observer', async () => {
    const observer = caller({
      region: 'none',
      capabilities: { 'tickets.view': true, 'records.viewAll': true },
    });
    await expect(
      ticketAccessible(
        observer,
        ticket({ region: 'south', confidential: true }),
        NO_SHARES,
      ),
    ).resolves.toBe(false);
  });

  it('does not match a region when the caller has none', async () => {
    await expect(
      ticketAccessible(caller({ region: null }), ticket(), NO_SHARES),
    ).resolves.toBe(false);
  });

  it('lets the integration account read the ticket it reported', async () => {
    await expect(
      ticketAccessible(
        caller({ id: 'integration', region: null }),
        ticket({ reporterId: 'integration', region: 'south' }),
        NO_SHARES,
      ),
    ).resolves.toBe(true);
  });
});

describe('ticket write access', () => {
  it('refuses a write to a ticket that was only shared with the caller', () => {
    const collaborator = caller({ id: 'collab', region: null });
    const sharedTicket = ticket({ id: 42, region: 'south' });
    expect(ticketWritable(collaborator, sharedTicket)).toBe(false);
  });

  it('refuses a write outside the caller region', () => {
    expect(ticketWritable(caller(), ticket({ region: 'south' }))).toBe(false);
  });

  it('allows the assignee and a same-region engineer to write', () => {
    expect(
      ticketWritable(
        caller({ region: 'north' }),
        ticket({ region: 'south', assigneeId: 'user-1' }),
      ),
    ).toBe(true);
    expect(ticketWritable(caller(), ticket({ region: 'east' }))).toBe(true);
  });

  it('refuses a write to a confidential ticket by a same-region engineer', () => {
    expect(
      ticketWritable(caller(), ticket({ region: 'east', confidential: true })),
    ).toBe(false);
  });

  it('lets a supervisor write any ticket', () => {
    const supervisor = caller({
      region: null,
      capabilities: { 'tickets.assign': true },
    });
    expect(
      ticketWritable(
        supervisor,
        ticket({ region: 'south', confidential: true }),
      ),
    ).toBe(true);
  });
});

describe('region scope', () => {
  it('leaves a regional engineer confined to their own region', () => {
    const engineer = caller({ region: 'east' });
    expect(seesEveryRegion(engineer)).toBe(false);
    expect(regionScopeOf(engineer)).toBe('east');
  });

  it('unscopes a supervisor through the assign capability', () => {
    const supervisor = caller({
      region: 'east',
      capabilities: { 'tickets.assign': true },
    });
    expect(seesEveryRegion(supervisor)).toBe(true);
    expect(regionScopeOf(supervisor)).toBeNull();
  });

  it('unscopes the read-only observer through the record grant', () => {
    const observer = caller({
      region: 'none',
      capabilities: { 'records.viewAll': true },
    });
    expect(seesEveryRegion(observer)).toBe(true);
    expect(regionScopeOf(observer)).toBeNull();
  });

  it('keeps a cross-region collaborator scoped to shared records', () => {
    const collaborator = caller({ region: 'none' });
    expect(regionScopeOf(collaborator)).toBe('none');
  });
});

describe('requireCapability', () => {
  it('rejects a caller who was not granted the action', async () => {
    await expect(requireCapability(caller(), 'tickets.assign')).rejects.toThrow(
      'Forbidden: tickets.assign',
    );
  });

  it('resolves for a caller who holds the capability', async () => {
    await expect(
      requireCapability(
        caller({ capabilities: { 'tickets.assign': true } }),
        'tickets.assign',
      ),
    ).resolves.toBeUndefined();
  });
});

describe('assignee eligibility', () => {
  it('only treats the four field service regions as dispatchable', () => {
    for (const region of ['east', 'south', 'north', 'west']) {
      expect(isAssignableRegion(region)).toBe(true);
    }
    for (const region of [null, undefined, '', 'none', 'unknown', 'east ']) {
      expect(isAssignableRegion(region)).toBe(false);
    }
  });

  it('asks authorization whether the target holds tickets.process', async () => {
    const seen: unknown[] = [];
    const authorization = {
      subjects: {
        resolveFor: async () => [{ type: 'team', id: 'team-east' }],
      },
      for: (identity: unknown) => ({
        can: async (request: unknown) => {
          seen.push({ identity, request });
          return true;
        },
      }),
    };
    const app = {
      container: { resolve: () => authorization },
    } as unknown as Application;

    await expect(canProcessTickets(app, 'engineer-1')).resolves.toBe(true);
    expect(seen).toEqual([
      {
        identity: {
          principal: { type: 'user', id: 'engineer-1' },
          subjects: [{ type: 'team', id: 'team-east' }],
        },
        request: {
          resource: { type: 'resource', id: 'service.tickets' },
          action: 'process',
        },
      },
    ]);
  });

  it('rejects an empty target without resolving authorization', async () => {
    const app = {
      container: {
        resolve: () => {
          throw new Error('authorization should not be resolved');
        },
      },
    } as unknown as Application;
    await expect(canProcessTickets(app, '')).resolves.toBe(false);
  });
});

describe('ServiceRuleError', () => {
  it('defaults to a 400 status', () => {
    expect(new ServiceRuleError('bad input').status).toBe(400);
    expect(new ServiceRuleError('bad input').name).toBe('ServiceRuleError');
  });

  it('carries the explicit status it was raised with', () => {
    expect(new ServiceRuleError('missing', 404).status).toBe(404);
    expect(new ServiceRuleError('forbidden', 403).status).toBe(403);
    expect(new ServiceRuleError('conflict', 409).status).toBe(409);
  });
});
