import { defineSeed, type SeedContext } from '@nocobase/db';

import { servicePermissionSets } from '../../seed-data/permission-sets.ts';

/**
 * Persists the service job permission sets declared in
 * `database/seed-data/permission-sets.ts`.
 *
 * The declarations are code; a Permission Set is a row. This seed is the one
 * place that turns the first into the second, once per installation. An
 * administrator may edit the sets afterwards and a repeat run leaves existing
 * rows alone, so a granted or revoked permission survives a deployment.
 *
 * Titles are written as translation keys (`{ key, ns }`), which is the shape the
 * authorization UI resolves through the application locale files.
 */

const TITLES: Readonly<Record<string, string>> = {
  'service.supervisor': 'permissionSets.service.supervisor',
  'service.engineer': 'permissionSets.service.engineer',
  'service.observer': 'permissionSets.service.observer',
  'service.integrator': 'permissionSets.service.integrator',
};

async function ensurePermissionSet(
  context: SeedContext,
  key: string,
): Promise<void> {
  const existing = await context.query
    .selectFrom('authorizationPermissionSets')
    .select('key')
    .where('key', '=', key)
    .executeTakeFirst();
  if (existing) {
    return;
  }
  const definition = servicePermissionSets.find((set) => set.key === key);
  if (!definition) {
    return;
  }
  const titleKey = TITLES[key];
  const now = new Date();
  await context.query
    .insertInto('authorizationPermissionSets')
    .values({
      id: crypto.randomUUID(),
      key,
      title: titleKey ? JSON.stringify({ key: titleKey, ns: 'service' }) : null,
      // Written the way the permission-sets store reads it back; the grants are
      // plain JSON, and the raw insert has no Collection to encode them.
      grants: JSON.stringify(definition.grants),
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

const seed = defineSeed({
  name: '202610090100_service_permission_sets',
  async run(context) {
    for (const set of servicePermissionSets) {
      await ensurePermissionSet(context, set.key);
    }
  },
});

export default seed;
