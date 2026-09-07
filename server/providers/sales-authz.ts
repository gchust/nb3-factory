import type { AppAuthorization } from '@nocobase/app-plugin-authorization';
import type { DatabaseManager } from '@nocobase/db';

import { ROLES } from './sales-types.js';

/**
 * Registers the sales collections with the database authorizer and creates the
 * role permission sets. Idempotent: existing permission sets are updated in
 * place, and assignments are created only when missing.
 */
export async function setupSalesAuthorization(
  authz: AppAuthorization,
  database: DatabaseManager,
): Promise<void> {
  registerCollections(authz);
  await upsertPermissionSets(authz);
  await grantAdministratorDatabaseAccess(authz, database);
}

/** The business pages each role can open. `home` is already granted to every
 * authenticated user by the `default-pages` permission set. */
const BUSINESS_PAGES = [
  'dashboard',
  'leads',
  'customers',
  'contacts',
  'opportunities',
  'follow-ups',
  'directory',
] as const;

type PermissionGrant = ReturnType<AppAuthorization['database']['grant']>;

function pageGrants(pages: readonly string[]): PermissionGrant[] {
  return pages.map((id) => ({
    resource: { type: 'page', id },
    actions: [{ action: 'access' }],
  }));
}

function registerCollections(authz: AppAuthorization): void {
  authz.database.collections.add({
    name: 'customers',
    title: 'Customers',
    actions: ['read', 'create', 'update', 'delete', 'changeOwner'],
    fields: [
      'id',
      'customerNo',
      'name',
      'industry',
      'size',
      'status',
      'phone',
      'isPublic',
      'ownerId',
      'createdAt',
      'updatedAt',
    ],
    attributes: { identifier: 'id', owner: 'ownerId' },
  });
  authz.database.collections.add({
    name: 'contacts',
    title: 'Contacts',
    actions: ['read', 'create', 'update'],
    fields: [
      'id',
      'name',
      'phone',
      'email',
      'position',
      'customerId',
      'ownerId',
      'createdAt',
      'updatedAt',
    ],
    attributes: { identifier: 'id', owner: 'ownerId' },
  });
  authz.database.collections.add({
    name: 'leads',
    title: 'Leads',
    actions: ['read', 'create', 'update', 'delete', 'assign', 'convert'],
    fields: [
      'id',
      'leadNo',
      'companyName',
      'contactName',
      'phone',
      'email',
      'source',
      'ownerId',
      'status',
      'notes',
      'convertedAt',
      'convertedCustomerId',
      'createdAt',
      'updatedAt',
    ],
    attributes: { identifier: 'id', owner: 'ownerId' },
  });
  authz.database.collections.add({
    name: 'opportunities',
    title: 'Opportunities',
    actions: ['read', 'create', 'update', 'advance', 'win', 'lose', 'archive'],
    fields: [
      'id',
      'opportunityNo',
      'name',
      'customerId',
      'ownerId',
      'stage',
      'expectedAmount',
      'winProbability',
      'weightedAmount',
      'expectedCloseDate',
      'actualAmount',
      'resultReason',
      'approvalStatus',
      'isArchived',
      'createdAt',
      'updatedAt',
    ],
    attributes: { identifier: 'id', owner: 'ownerId' },
  });
  authz.database.collections.add({
    name: 'followUps',
    title: 'Follow-ups',
    actions: ['read', 'create', 'update'],
    fields: [
      'id',
      'subject',
      'method',
      'followUpAt',
      'nextFollowUpAt',
      'content',
      'customerId',
      'opportunityId',
      'contactId',
      'ownerId',
      'createdAt',
      'updatedAt',
    ],
    attributes: { identifier: 'id', owner: 'ownerId' },
  });
}

const CUSTOMER_WRITE_FIELDS = [
  'name',
  'industry',
  'size',
  'status',
  'phone',
  'isPublic',
];
const CONTACT_WRITE_FIELDS = ['name', 'phone', 'email', 'position'];
const LEAD_WRITE_FIELDS = [
  'companyName',
  'contactName',
  'phone',
  'email',
  'source',
  'notes',
];
const OPPORTUNITY_WRITE_FIELDS = [
  'name',
  'expectedAmount',
  'expectedCloseDate',
];
const FOLLOW_UP_WRITE_FIELDS = [
  'subject',
  'method',
  'followUpAt',
  'nextFollowUpAt',
  'content',
];

async function upsertPermissionSets(authz: AppAuthorization): Promise<void> {
  const sales = await upsertPermissionSet(authz, {
    key: 'sales-role',
    title: 'Sales role',
    grants: [
      ...pageGrants(BUSINESS_PAGES),
      authz.database.grant('customers', {
        read: { fields: { output: '*' }, recordAccess: ['recordsIOwn'] },
        create: { fields: { input: CUSTOMER_WRITE_FIELDS, output: ['id'] } },
        update: {
          fields: { input: CUSTOMER_WRITE_FIELDS },
          recordAccess: ['recordsIOwn'],
        },
        changeOwner: { recordAccess: ['recordsIOwn'] },
      }),
      authz.database.grant('contacts', {
        read: { fields: { output: '*' }, recordAccess: ['recordsIOwn'] },
        create: {
          fields: {
            input: [...CONTACT_WRITE_FIELDS, 'customerId'],
            output: ['id'],
          },
        },
        update: {
          fields: { input: CONTACT_WRITE_FIELDS },
          recordAccess: ['recordsIOwn'],
        },
      }),
      authz.database.grant('leads', {
        read: { fields: { output: '*' }, recordAccess: ['recordsIOwn'] },
        create: { fields: { input: LEAD_WRITE_FIELDS, output: ['id'] } },
        update: {
          fields: { input: LEAD_WRITE_FIELDS },
          recordAccess: ['recordsIOwn'],
        },
        assign: { recordAccess: ['recordsIOwn'] },
        convert: { recordAccess: ['recordsIOwn'] },
      }),
      authz.database.grant('opportunities', {
        read: { fields: { output: '*' }, recordAccess: ['recordsIOwn'] },
        create: {
          fields: {
            input: [...OPPORTUNITY_WRITE_FIELDS, 'customerId'],
            output: ['id'],
          },
        },
        update: {
          fields: { input: OPPORTUNITY_WRITE_FIELDS },
          recordAccess: ['recordsIOwn'],
        },
        advance: { recordAccess: ['recordsIOwn'] },
        win: { recordAccess: ['recordsIOwn'] },
        lose: { recordAccess: ['recordsIOwn'] },
        archive: { recordAccess: ['recordsIOwn'] },
      }),
      authz.database.grant('followUps', {
        read: { fields: { output: '*' }, recordAccess: ['recordsIOwn'] },
        create: {
          fields: {
            input: [
              ...FOLLOW_UP_WRITE_FIELDS,
              'customerId',
              'opportunityId',
              'contactId',
            ],
            output: ['id'],
          },
        },
        update: {
          fields: { input: FOLLOW_UP_WRITE_FIELDS },
          recordAccess: ['recordsIOwn'],
        },
      }),
    ],
  });
  await assignToRole(authz, sales.key, ROLES.SALES);

  const manager = await upsertPermissionSet(authz, {
    key: 'sales-manager-role',
    title: 'Sales manager role',
    grants: [
      ...pageGrants(BUSINESS_PAGES),
      authz.database.grant('customers', {
        read: { fields: { output: '*' }, recordAccess: ['allRecords'] },
        create: { fields: { input: '*', output: ['id'] } },
        update: { fields: { input: '*' }, recordAccess: ['allRecords'] },
        changeOwner: { recordAccess: ['allRecords'] },
        delete: { recordAccess: ['allRecords'] },
      }),
      authz.database.grant('contacts', {
        read: { fields: { output: '*' }, recordAccess: ['allRecords'] },
        create: { fields: { input: '*', output: ['id'] } },
        update: { fields: { input: '*' }, recordAccess: ['allRecords'] },
      }),
      authz.database.grant('leads', {
        read: { fields: { output: '*' }, recordAccess: ['allRecords'] },
        create: { fields: { input: '*', output: ['id'] } },
        update: { fields: { input: '*' }, recordAccess: ['allRecords'] },
        assign: { recordAccess: ['allRecords'] },
        convert: { recordAccess: ['allRecords'] },
        delete: { recordAccess: ['allRecords'] },
      }),
      authz.database.grant('opportunities', {
        read: { fields: { output: '*' }, recordAccess: ['allRecords'] },
        create: { fields: { input: '*', output: ['id'] } },
        update: { fields: { input: '*' }, recordAccess: ['allRecords'] },
        advance: { recordAccess: ['allRecords'] },
        win: { recordAccess: ['allRecords'] },
        lose: { recordAccess: ['allRecords'] },
        archive: { recordAccess: ['allRecords'] },
      }),
      authz.database.grant('followUps', {
        read: { fields: { output: '*' }, recordAccess: ['allRecords'] },
        create: { fields: { input: '*', output: ['id'] } },
        update: { fields: { input: '*' }, recordAccess: ['allRecords'] },
      }),
    ],
  });
  await assignToRole(authz, manager.key, ROLES.SALES_MANAGER);

  const visitor = await upsertPermissionSet(authz, {
    key: 'visitor-role',
    title: 'Visitor role',
    grants: [
      ...pageGrants(['directory']),
      authz.database.grant('customers', {
        read: {
          fields: { output: ['id', 'name', 'industry', 'size', 'status'] },
          recordAccess: [
            {
              key: 'customFilter',
              params: { filter: { $and: [{ isPublic: { $eq: true } }] } },
            },
          ],
        },
      }),
    ],
  });
  await assignToRole(authz, visitor.key, ROLES.VISITOR);
}

async function upsertPermissionSet(
  authz: AppAuthorization,
  input: {
    key: string;
    title: string;
    grants: ReturnType<AppAuthorization['database']['grant']>[];
  },
): Promise<{ key: string }> {
  const existing = await authz.permissionSets.get(input.key);
  if (existing) {
    await authz.permissionSets.update(input.key, {
      key: input.key,
      title: input.title,
      grants: input.grants,
    });
    return { key: input.key };
  }
  return authz.permissionSets.create({
    key: input.key,
    title: input.title,
    grants: input.grants,
  });
}

const ADMIN_USERNAME = 'nocobase';

/**
 * The system administrator (user `nocobase`) has `page *` access but no
 * database grants, so the sales data APIs would deny it. Grant the admin full
 * database access on the sales collections through a dedicated permission set.
 */
async function grantAdministratorDatabaseAccess(
  authz: AppAuthorization,
  database: DatabaseManager,
): Promise<void> {
  const user = await database
    .query()
    .selectFrom('user')
    .select('id')
    .where('username', '=', ADMIN_USERNAME)
    .limit(1)
    .executeTakeFirst();
  if (!user) return;

  const admin = await upsertPermissionSet(authz, {
    key: 'sales-admin',
    title: 'Sales administrator',
    grants: [
      authz.database.grant('customers', {
        read: { fields: { output: '*' }, recordAccess: ['allRecords'] },
        create: { fields: { input: '*', output: ['id'] } },
        update: { fields: { input: '*' }, recordAccess: ['allRecords'] },
        changeOwner: { recordAccess: ['allRecords'] },
        delete: { recordAccess: ['allRecords'] },
      }),
      authz.database.grant('contacts', {
        read: { fields: { output: '*' }, recordAccess: ['allRecords'] },
        create: { fields: { input: '*', output: ['id'] } },
        update: { fields: { input: '*' }, recordAccess: ['allRecords'] },
      }),
      authz.database.grant('leads', {
        read: { fields: { output: '*' }, recordAccess: ['allRecords'] },
        create: { fields: { input: '*', output: ['id'] } },
        update: { fields: { input: '*' }, recordAccess: ['allRecords'] },
        assign: { recordAccess: ['allRecords'] },
        convert: { recordAccess: ['allRecords'] },
        delete: { recordAccess: ['allRecords'] },
      }),
      authz.database.grant('opportunities', {
        read: { fields: { output: '*' }, recordAccess: ['allRecords'] },
        create: { fields: { input: '*', output: ['id'] } },
        update: { fields: { input: '*' }, recordAccess: ['allRecords'] },
        advance: { recordAccess: ['allRecords'] },
        win: { recordAccess: ['allRecords'] },
        lose: { recordAccess: ['allRecords'] },
        archive: { recordAccess: ['allRecords'] },
      }),
      authz.database.grant('followUps', {
        read: { fields: { output: '*' }, recordAccess: ['allRecords'] },
        create: { fields: { input: '*', output: ['id'] } },
        update: { fields: { input: '*' }, recordAccess: ['allRecords'] },
      }),
    ],
  });

  const userId = String(user.id);
  const assignments = await authz.permissionSets.listAssignments(admin.key);
  const already = assignments.some(
    (assignment) =>
      assignment.subject.type === 'user' && assignment.subject.id === userId,
  );
  if (!already) {
    await authz.permissionSets.assign({
      subject: { type: 'user', id: userId },
      permissionSet: admin.key,
    });
  }
}

async function assignToRole(
  authz: AppAuthorization,
  permissionSet: string,
  roleKey: string,
): Promise<void> {
  const assignments = await authz.permissionSets.listAssignments(permissionSet);
  const already = assignments.some(
    (assignment) =>
      assignment.subject.type === 'role' && assignment.subject.id === roleKey,
  );
  if (!already) {
    await authz.permissionSets.assign({
      subject: { type: 'role', id: roleKey },
      permissionSet,
    });
  }
}
