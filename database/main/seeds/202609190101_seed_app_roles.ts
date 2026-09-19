import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * Application roles, expressed as Authorization Permission Sets so they can be
 * assigned to users from the built-in Users page. Each role also needs a page
 * grant, otherwise the client route guard hides the page before it loads.
 */
interface RoleSeed {
  readonly key: string;
  readonly title: string;
  readonly pageIds: readonly string[];
}

const ROLES: readonly RoleSeed[] = [
  {
    key: 'equipment-manager',
    title: '设备管理员',
    pageIds: [
      'home',
      'equipment',
      'templates',
      'inspections',
      'repairs',
      'review',
    ],
  },
  {
    key: 'inspector',
    title: '巡检员',
    pageIds: ['home', 'equipment', 'inspections'],
  },
  {
    key: 'repairer',
    title: '维修员',
    pageIds: ['home', 'equipment', 'repairs'],
  },
];

const seed: SeedDefinition = defineSeed({
  name: '202609190101_seed_app_roles',

  async run({ query }) {
    const now = new Date();
    for (const role of ROLES) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('key')
        .where('key', '=', role.key)
        .executeTakeFirst();
      if (existing) continue;

      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: crypto.randomUUID(),
          key: role.key,
          title: role.title,
          grants: JSON.stringify(grantsFor(role)),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

function grantsFor(role: RoleSeed): readonly unknown[] {
  return role.pageIds.map((id) => ({
    resource: { type: 'page', id },
    actions: [{ action: 'access' }],
  }));
}

export default seed;
