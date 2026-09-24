import { defineSeed } from '@nocobase/db';
import { serviceRequestDefaultAccess } from '../../seed-data/service-request-permissions.ts';

/**
 * Persists the initial default-access rule for the service request collection.
 *
 * A database grant says who may perform an action; a default-access rule says
 * which rows that action starts from, and a collection with neither a rule nor a
 * named Record Access scope resolves to no rows at all. This is installation
 * configuration a business administrator may edit afterwards, so the seed only
 * creates the rule when the resource has none and never overwrites a rule that
 * already exists.
 */
const seed = defineSeed({
  name: '202610100005_service_request_default_access',
  transaction: true,
  async run({ query }) {
    const { resource, actions } = serviceRequestDefaultAccess;

    const existing = await query
      .selectFrom('authorizationDefaultAccessRules')
      .select('id')
      .where('resourceType', '=', resource.type)
      .where('resourceId', '=', resource.id)
      .executeTakeFirst();
    if (existing) return;

    const now = new Date();
    await query
      .insertInto('authorizationDefaultAccessRules')
      .values({
        id: `default-access:${resource.type}:${resource.id}`,
        resourceType: resource.type,
        resourceId: resource.id,
        actions: JSON.stringify(actions),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  },
});

export default seed;
