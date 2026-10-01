// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { SERVICE_ROLE_DEFINITIONS } from '../../server/business/permission-config.js';

/**
 * The page resource ids each seeded permission set may open, taken from the
 * declarations the provisioning step writes. A page grant is what the client
 * router and the settings workspace read to decide whether a role sees a page,
 * so it is worth pinning the ones the business requirements call out.
 */
function pageIds(roleKey: string): Set<string> {
  const definition = SERVICE_ROLE_DEFINITIONS.find(
    (candidate) => candidate.key === roleKey,
  );
  if (!definition) throw new Error(`Unknown role ${roleKey}`);
  return new Set(
    definition.grants
      .filter((grant) => grant.resource.type === 'page')
      .map((grant) => grant.resource.id),
  );
}

describe('service permission sets', () => {
  it('gives the business roles the message center page', () => {
    for (const role of [
      'service-supervisor',
      'service-engineer',
      'service-observer',
    ]) {
      expect(pageIds(role)).toContain('service-notifications');
    }
  });

  it('lets the integration account manage its own API keys', () => {
    // Without this the integration account's Settings workspace is empty, so it
    // can never issue the key the external platform calls with.
    expect(pageIds('service-integrator')).toContain('api-keys');
  });

  it('does not offer the admin surfaces to the integration account', () => {
    const integrator = pageIds('service-integrator');
    expect(integrator).not.toContain('service-work-orders');
    expect(integrator).not.toContain('service-notifications');
  });
});
