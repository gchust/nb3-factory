import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { defineSeed, type QueryAdapter } from '@nocobase/db';

/**
 * The initial permission configuration for the internal-materials feature.
 *
 * It creates 资料员 and 阅读者 permission sets, assigns them to the seeded accounts, and writes the confidentiality
 * restriction rule assigned directly to 阅读者乙. Every write is skipped when its row already exists, so a later
 * administrator edit — a changed grant, a removed assignment, a revoked rule — is never overwritten by re-running the
 * seed.
 *
 * The grants are written out here rather than imported from `server/materials/grants.ts`. A seed is a point-in-time
 * snapshot, like a migration: importing live declarations would silently rewrite what an already-applied seed means
 * whenever the feature's code changes. Adjusting the permission model later is a new seed, not an edit to this one.
 */

const MATERIALS_NAMESPACE = 'app';
const MATERIALS_PAGE_ID = 'materials';
const MATERIALS_COLLECTION = 'materials';
const READABLE_RECORD_ACCESS = 'materials.readable';
const CONFIDENTIALITY_RECORD_ACCESS = 'materials.confidentiality';

function title(key: string): { readonly key: string; readonly ns: string } {
  return { key, ns: MATERIALS_NAMESPACE };
}

/** The built-in Record Access that selects the rows a principal owns. */
const RECORDS_I_OWN = 'recordsIOwn';

interface CollectionAction {
  readonly fields?: readonly string[];
  readonly recordAccess?: readonly string[];
}

function collectionGrant(actions: Readonly<Record<string, CollectionAction>>): {
  readonly resource: { readonly type: string; readonly id: string };
  readonly actions: readonly {
    readonly action: string;
    readonly policy: {
      readonly type: string;
      readonly fields?: readonly string[];
      readonly recordAccess?: readonly string[];
    };
  }[];
} {
  return {
    resource: { type: 'database.collection', id: MATERIALS_COLLECTION },
    actions: Object.entries(actions).map(([action, config]) => ({
      action,
      policy: {
        type: 'database',
        ...(config.fields ? { fields: config.fields } : {}),
        ...(config.recordAccess && config.recordAccess.length > 0
          ? { recordAccess: config.recordAccess }
          : {}),
      },
    })),
  };
}

const readFields = [
  'id',
  'title',
  'body',
  'ownerId',
  'published',
  'confidential',
  'createdAt',
  'updatedAt',
] as const;

const materialEditor = {
  key: 'material-editor',
  title: title('permissionSets.materialEditor'),
  grants: [
    {
      resource: { type: 'page', id: MATERIALS_PAGE_ID },
      actions: [{ action: 'access' }],
    },
    collectionGrant({
      read: { fields: readFields, recordAccess: [RECORDS_I_OWN] },
      create: {
        fields: [
          'title',
          'body',
          'published',
          'confidential',
          'ownerId',
          'createdAt',
          'updatedAt',
        ],
        recordAccess: [RECORDS_I_OWN],
      },
      update: {
        fields: ['title', 'body', 'published', 'confidential', 'updatedAt'],
        recordAccess: [RECORDS_I_OWN],
      },
      delete: { recordAccess: [RECORDS_I_OWN] },
    }),
  ],
};

const materialReader = {
  key: 'material-reader',
  title: title('permissionSets.materialReader'),
  grants: [
    {
      resource: { type: 'page', id: MATERIALS_PAGE_ID },
      actions: [{ action: 'access' }],
    },
    collectionGrant({
      read: { fields: readFields, recordAccess: [READABLE_RECORD_ACCESS] },
    }),
  ],
};

/** The seed reads through a raw query builder, so an id comes back untyped; only a string or number is usable. */
function idOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

async function userIdByName(
  query: QueryAdapter,
  username: string,
): Promise<string | undefined> {
  const row = await query
    .selectFrom('user')
    .select('id')
    .where('username', '=', username)
    .limit(1)
    .executeTakeFirst();
  return idOf(row?.id);
}

const seed = defineSeed({
  name: '202610070010_materials_permission_configuration',
  transaction: true,
  async run({ query }) {
    const now = new Date();

    for (const permissionSet of [materialEditor, materialReader]) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('id')
        .where('key', '=', permissionSet.key)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: permissionSet.key,
          key: permissionSet.key,
          title: encodeAuthorizationTitle(permissionSet.title),
          grants: JSON.stringify(permissionSet.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const ownerId = await userIdByName(query, 'material_jia');
    const readerId = await userIdByName(query, 'material_yi');

    const assignments = [
      ...(ownerId
        ? [{ subjectId: ownerId, permissionSetKey: materialEditor.key }]
        : []),
      ...(readerId
        ? [{ subjectId: readerId, permissionSetKey: materialReader.key }]
        : []),
    ];
    for (const assignment of assignments) {
      const id = `user:${assignment.subjectId}:${assignment.permissionSetKey}`;
      const existing = await query
        .selectFrom('authorizationPermissionSetAssignments')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      await query
        .insertInto('authorizationPermissionSetAssignments')
        .values({
          id,
          subjectType: 'user',
          subjectId: assignment.subjectId,
          permissionSetKey: assignment.permissionSetKey,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    if (!readerId) {
      return;
    }
    const ruleKey = 'materials.confidentiality';
    const existingRule = await query
      .selectFrom('authorizationRestrictionRules')
      .select('id')
      .where('key', '=', ruleKey)
      .executeTakeFirst();
    const ruleId = existingRule ? String(existingRule.id) : ruleKey;
    if (!existingRule) {
      await query
        .insertInto('authorizationRestrictionRules')
        .values({
          id: ruleId,
          key: ruleKey,
          title: encodeAuthorizationTitle(
            title('restrictionRules.materialsConfidentiality'),
          ),
          resourceType: 'database.collection',
          resourceId: MATERIALS_COLLECTION,
          actions: JSON.stringify(
            ['read', 'update', 'delete'].map((action) => ({
              action,
              selection: {
                type: 'recordAccess',
                key: CONFIDENTIALITY_RECORD_ACCESS,
              },
            })),
          ),
          reason:
            '保密资料仅负责人可见，即使误授予了共享或全量权限也不会对阅读者开放。',
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const existingAssignment = await query
      .selectFrom('authorizationRestrictionRuleAssignments')
      .select('id')
      .where('restrictionRuleId', '=', ruleId)
      .where('subjectType', '=', 'user')
      .where('subjectId', '=', readerId)
      .executeTakeFirst();
    if (!existingAssignment) {
      await query
        .insertInto('authorizationRestrictionRuleAssignments')
        .values({
          id: crypto.randomUUID(),
          restrictionRuleId: ruleId,
          subjectType: 'user',
          subjectId: readerId,
          createdAt: now,
        })
        .execute();
    }
  },
});

export default seed;
