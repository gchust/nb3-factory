import type { AppAuthorization } from '@nocobase/app-plugin-authorization';

/**
 * Registers the retail database collections with Authorization and provisions the application's
 * fixed Permission Sets.
 *
 * Permission Sets are this application's roles: the Users page exposes them as direct roles. The
 * cashier set is assigned to the `authenticated` subject so every signed-in user is a cashier by
 * default, which is why self-registration is immediately usable. Store manager and viewer remain
 * explicit assignments an administrator makes on the Users page.
 */
type CollectionDefinition = Parameters<
  AppAuthorization['database']['collections']['add']
>[0];
type PermissionGrant = Parameters<
  AppAuthorization['permissionSets']['create']
>[0]['grants'][number];

export const CASHIER_PERMISSION_SET = 'retail-cashier';
export const MANAGER_PERMISSION_SET = 'retail-store-manager';
export const VIEWER_PERMISSION_SET = 'retail-viewer';

const PRODUCT_FIELDS = [
  'id',
  'name',
  'barcode',
  'category',
  'price',
  'cost',
  'stock',
  'status',
  'images',
  'createdAt',
  'updatedAt',
] as const;

const ORDER_FIELDS = [
  'id',
  'orderNumber',
  'storeName',
  'cashierId',
  'cashierName',
  'originalAmount',
  'discountPercent',
  'discountAmount',
  'payableAmount',
  'paymentMethod',
  'status',
  'soldAt',
  'returnedAt',
  'createdAt',
] as const;

const ITEM_FIELDS = [
  'id',
  'orderId',
  'productId',
  'productName',
  'barcode',
  'unitPrice',
  'quantity',
  'subtotal',
] as const;

const PURCHASE_FIELDS = [
  'id',
  'productId',
  'productName',
  'quantity',
  'unitCost',
  'supplier',
  'purchaseDate',
  'createdById',
  'createdByName',
  'createdAt',
] as const;

const PRODUCT_WRITE_INPUT = [
  'name',
  'barcode',
  'category',
  'price',
  'cost',
  'stock',
  'status',
  'images',
] as const;

const PRODUCT_CASHIER_OUTPUT = [
  'id',
  'name',
  'barcode',
  'category',
  'price',
  'stock',
  'status',
  'images',
  'createdAt',
  'updatedAt',
] as const;

const ORDER_CREATE_INPUT = [
  'storeName',
  'paymentMethod',
  'discountPercent',
] as const;

const ORDER_CREATE_OUTPUT = [
  'id',
  'orderNumber',
  'storeName',
  'originalAmount',
  'discountPercent',
  'discountAmount',
  'payableAmount',
  'paymentMethod',
  'status',
  'soldAt',
] as const;

const ITEM_CREATE_INPUT = ['productId', 'quantity'] as const;

const PURCHASE_CREATE_INPUT = [
  'productId',
  'quantity',
  'unitCost',
  'supplier',
  'purchaseDate',
] as const;

const collections: readonly CollectionDefinition[] = [
  {
    name: 'retailProducts',
    title: 'Products',
    actions: ['read', 'create', 'update', 'delete'],
    fields: [...PRODUCT_FIELDS],
    attributes: { identifier: 'id' },
  },
  {
    name: 'retailSalesOrders',
    title: 'Sales orders',
    actions: ['read', 'create', 'update', 'delete'],
    fields: [...ORDER_FIELDS],
    // `recordsIOwn` reads this mapping, which is what restricts a cashier to their own orders.
    attributes: { identifier: 'id', owner: 'cashierId' },
  },
  {
    name: 'retailSalesOrderItems',
    title: 'Sales order items',
    actions: ['read', 'create'],
    fields: [...ITEM_FIELDS],
    attributes: { identifier: 'id' },
  },
  {
    name: 'retailPurchaseOrders',
    title: 'Purchase orders',
    actions: ['read', 'create', 'delete'],
    fields: [...PURCHASE_FIELDS],
    attributes: { identifier: 'id', creator: 'createdById' },
  },
];

export function registerRetailCollections(authz: AppAuthorization): void {
  for (const definition of collections) {
    authz.database.collections.add(definition);
  }
}

function pageGrant(id: string): PermissionGrant {
  return { resource: { type: 'page', id }, actions: [{ action: 'access' }] };
}

function cashierGrants(authz: AppAuthorization): PermissionGrant[] {
  return [
    pageGrant('home'),
    pageGrant('pos'),
    pageGrant('sales'),
    authz.database.grant('retailProducts', {
      read: {
        fields: { output: [...PRODUCT_CASHIER_OUTPUT] },
        recordAccess: ['allRecords'],
      },
    }),
    authz.database.grant('retailSalesOrders', {
      create: {
        fields: {
          input: [...ORDER_CREATE_INPUT],
          output: [...ORDER_CREATE_OUTPUT],
        },
      },
      read: {
        fields: { output: [...ORDER_FIELDS] },
        recordAccess: ['recordsIOwn'],
      },
    }),
    authz.database.grant('retailSalesOrderItems', {
      create: {
        fields: { input: [...ITEM_CREATE_INPUT], output: ['id'] },
      },
    }),
  ];
}

function managerGrants(authz: AppAuthorization): PermissionGrant[] {
  return [
    pageGrant('home'),
    pageGrant('pos'),
    pageGrant('sales'),
    pageGrant('products'),
    pageGrant('purchases'),
    pageGrant('reports'),
    authz.database.grant('retailProducts', {
      read: {
        fields: { output: [...PRODUCT_FIELDS] },
        recordAccess: ['allRecords'],
      },
      create: {
        fields: {
          input: [...PRODUCT_WRITE_INPUT],
          output: ['id'],
        },
      },
      update: {
        fields: {
          input: [...PRODUCT_WRITE_INPUT],
          output: ['id'],
        },
        recordAccess: ['allRecords'],
      },
      delete: { recordAccess: ['allRecords'] },
    }),
    authz.database.grant('retailSalesOrders', {
      read: {
        fields: { output: [...ORDER_FIELDS] },
        recordAccess: ['allRecords'],
      },
      create: {
        fields: {
          input: [...ORDER_CREATE_INPUT],
          output: [...ORDER_CREATE_OUTPUT],
        },
      },
      update: {
        fields: {
          input: ['status', 'returnedAt'],
          output: ['id', 'status', 'returnedAt'],
        },
        recordAccess: ['allRecords'],
      },
    }),
    authz.database.grant('retailSalesOrderItems', {
      read: {
        fields: { output: [...ITEM_FIELDS] },
        recordAccess: ['allRecords'],
      },
      create: {
        fields: { input: [...ITEM_CREATE_INPUT], output: ['id'] },
      },
    }),
    authz.database.grant('retailPurchaseOrders', {
      read: {
        fields: { output: [...PURCHASE_FIELDS] },
        recordAccess: ['allRecords'],
      },
      create: {
        fields: {
          input: [...PURCHASE_CREATE_INPUT],
          output: ['id'],
        },
      },
      delete: { recordAccess: ['allRecords'] },
    }),
  ];
}

function viewerGrants(authz: AppAuthorization): PermissionGrant[] {
  return [
    pageGrant('home'),
    pageGrant('reports'),
    authz.database.grant('retailProducts', {
      read: {
        fields: { output: [...PRODUCT_FIELDS] },
        recordAccess: ['allRecords'],
      },
    }),
    authz.database.grant('retailSalesOrders', {
      read: {
        fields: { output: [...ORDER_FIELDS] },
        recordAccess: ['allRecords'],
      },
    }),
    authz.database.grant('retailSalesOrderItems', {
      read: {
        fields: { output: [...ITEM_FIELDS] },
        recordAccess: ['allRecords'],
      },
    }),
  ];
}

function administratorGrants(authz: AppAuthorization): PermissionGrant[] {
  return [
    authz.database.grant('retailProducts', {
      read: {
        fields: { output: [...PRODUCT_FIELDS] },
        recordAccess: ['allRecords'],
      },
      create: {
        fields: { input: [...PRODUCT_WRITE_INPUT], output: ['id'] },
      },
      update: {
        fields: { input: [...PRODUCT_WRITE_INPUT], output: ['id'] },
        recordAccess: ['allRecords'],
      },
      delete: { recordAccess: ['allRecords'] },
    }),
    authz.database.grant('retailSalesOrders', {
      read: {
        fields: { output: [...ORDER_FIELDS] },
        recordAccess: ['allRecords'],
      },
      create: {
        fields: {
          input: [...ORDER_CREATE_INPUT],
          output: [...ORDER_CREATE_OUTPUT],
        },
      },
      update: {
        fields: {
          input: ['status', 'returnedAt'],
          output: ['id', 'status', 'returnedAt'],
        },
        recordAccess: ['allRecords'],
      },
      delete: { recordAccess: ['allRecords'] },
    }),
    authz.database.grant('retailSalesOrderItems', {
      read: {
        fields: { output: [...ITEM_FIELDS] },
        recordAccess: ['allRecords'],
      },
      create: {
        fields: { input: [...ITEM_CREATE_INPUT], output: ['id'] },
      },
    }),
    authz.database.grant('retailPurchaseOrders', {
      read: {
        fields: { output: [...PURCHASE_FIELDS] },
        recordAccess: ['allRecords'],
      },
      create: {
        fields: { input: [...PURCHASE_CREATE_INPUT], output: ['id'] },
      },
      delete: { recordAccess: ['allRecords'] },
    }),
  ];
}

/**
 * Creates the application's Permission Sets when absent and makes sure every signed-in user
 * inherits the cashier set.
 *
 * Sets are created only when missing: an administrator editing a role on the Users or
 * Authorization settings page is not overwritten on the next restart.
 */
export async function provisionRetailAuthorization(
  authz: AppAuthorization,
): Promise<void> {
  registerRetailCollections(authz);

  await ensurePermissionSet(authz, {
    key: CASHIER_PERMISSION_SET,
    title: 'Cashier 收银员',
    grants: cashierGrants(authz),
  });
  await ensurePermissionSet(authz, {
    key: MANAGER_PERMISSION_SET,
    title: 'Store manager 店长',
    grants: managerGrants(authz),
  });
  await ensurePermissionSet(authz, {
    key: VIEWER_PERMISSION_SET,
    title: 'Viewer 查看者',
    grants: viewerGrants(authz),
  });

  await mergeSystemAdministratorGrants(authz);
  await assignAuthenticatedDefault(authz, CASHIER_PERMISSION_SET);
}

async function ensurePermissionSet(
  authz: AppAuthorization,
  input: { key: string; title: string; grants: readonly PermissionGrant[] },
): Promise<void> {
  const existing = await authz.permissionSets.get(input.key);
  if (existing) return;
  await authz.permissionSets.create(input);
}

async function assignAuthenticatedDefault(
  authz: AppAuthorization,
  permissionSet: string,
): Promise<void> {
  const assignments = await authz.permissionSets.listAssignments(permissionSet);
  const exists = assignments.some(
    (assignment) =>
      assignment.subject.type === 'authenticated' &&
      assignment.subject.id === '*',
  );
  if (exists) return;
  await authz.permissionSets.assign({
    subject: { type: 'authenticated', id: '*' },
    permissionSet,
  });
}

/**
 * Adds the retail database grants to the protected system-administrator set, preserving the
 * existing page and authorization-settings grants the plugin installed.
 */
async function mergeSystemAdministratorGrants(
  authz: AppAuthorization,
): Promise<void> {
  const key = 'system-administrator';
  const current = await authz.permissionSets.get(key);
  if (!current) return;

  const desired = administratorGrants(authz);
  const merged = mergeGrants(current.grants, desired);
  if (grantsEqual(current.grants, merged)) return;

  await authz.permissionSets.update(key, {
    key,
    ...(current.title !== undefined ? { title: current.title } : {}),
    grants: merged,
  });
}

interface MutableGrant {
  resource: PermissionGrant['resource'];
  actions: PermissionGrant['actions'][number][];
}

function mergeGrants(
  existing: readonly PermissionGrant[],
  desired: readonly PermissionGrant[],
): PermissionGrant[] {
  const result: MutableGrant[] = existing.map((grant) => ({
    resource: grant.resource,
    actions: [...grant.actions],
  }));

  for (const grant of desired) {
    const match = result.find(
      (candidate) =>
        candidate.resource.type === grant.resource.type &&
        candidate.resource.id === grant.resource.id,
    );
    if (!match) {
      result.push({
        resource: grant.resource,
        actions: [...grant.actions],
      });
      continue;
    }
    for (const action of grant.actions) {
      if (!match.actions.some((item) => item.action === action.action)) {
        match.actions.push(action);
      }
    }
  }

  return result;
}

function grantsEqual(
  left: readonly PermissionGrant[],
  right: readonly PermissionGrant[],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
