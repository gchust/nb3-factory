import {
  defineSeed,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';

/**
 * Reproducible example data so the procurement pages and statistics are not
 * empty on a fresh install. Every record is keyed on a fixed business value and
 * skipped when already present, so running the seed twice changes nothing.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609130102_seed_procurement_examples',

  async run({ query }) {
    const now = new Date();
    const admin = await query
      .selectFrom('user')
      .select(['id', 'name'])
      .where('username', '=', 'nocobase')
      .limit(1)
      .executeTakeFirst();
    if (!admin) return;
    const applicantId = String(admin.id);

    const suppliers = [
      {
        credit: '91310000MA1K000001',
        name: '华东物资供应有限公司',
        contactName: '张伟',
        contactPhone: '13800000001',
        category: 'material',
        status: 'active',
      },
      {
        credit: '91310000MA1K000002',
        name: '中远工程服务有限公司',
        contactName: '李娜',
        contactPhone: '13800000002',
        category: 'engineering',
        status: 'active',
      },
      {
        credit: '91310000MA1K000003',
        name: '蓝图信息服务有限公司',
        contactName: '王强',
        contactPhone: '13800000003',
        category: 'service',
        status: 'disabled',
      },
    ];
    for (const supplier of suppliers) {
      const existing = await query
        .selectFrom('procurementSuppliers')
        .select('id')
        .where('unifiedSocialCreditCode', '=', supplier.credit)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('procurementSuppliers')
        .values({
          name: supplier.name,
          unifiedSocialCreditCode: supplier.credit,
          contactName: supplier.contactName,
          contactPhone: supplier.contactPhone,
          category: supplier.category,
          status: supplier.status,
          createdById: applicantId,
          createdByName: 'nocobase',
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    await seedExampleOrder(query, applicantId, now);
  },
});

const SEED_DESCRIPTION = '示例采购：办公耗材';

async function seedExampleOrder(
  query: SeedContext['query'],
  applicantId: string,
  now: Date,
): Promise<void> {
  const existingOrder = await query
    .selectFrom('procurementOrders')
    .select('id')
    .where('orderNumber', '=', 'PO-SEED-0001')
    .executeTakeFirst();
  if (existingOrder) return;

  const supplier = await query
    .selectFrom('procurementSuppliers')
    .select(['id', 'name'])
    .where('unifiedSocialCreditCode', '=', '91310000MA1K000001')
    .executeTakeFirst();
  if (!supplier) return;
  const supplierId = Number(supplier.id);

  const items = [
    {
      materialName: 'A4 复印纸',
      specification: '70g 500张/包',
      quantity: 100,
      unitPrice: 12.5,
    },
    {
      materialName: '激光硒鼓',
      specification: 'CF218A',
      quantity: 10,
      unitPrice: 220,
    },
  ];
  const totalAmount = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );

  await query
    .insertInto('procurementRequests')
    .values({
      applicantId,
      applicantName: 'nocobase',
      department: '采购部',
      description: SEED_DESCRIPTION,
      expectedDate: '2026-10-01',
      status: 'approved',
      rejectReason: null,
      totalAmount,
      submittedAt: now,
      approvedAt: now,
      approvedById: applicantId,
      createdAt: now,
      updatedAt: now,
    })
    .execute();

  const request = await query
    .selectFrom('procurementRequests')
    .select('id')
    .where('description', '=', SEED_DESCRIPTION)
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst();
  if (!request) return;
  const requestId = Number(request.id);

  for (const item of items) {
    await query
      .insertInto('procurementRequestItems')
      .values({
        requestId,
        materialName: item.materialName,
        specification: item.specification,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        amount: item.quantity * item.unitPrice,
      })
      .execute();
  }

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const receivedQuantity = 60;

  await query
    .insertInto('procurementOrders')
    .values({
      orderNumber: 'PO-SEED-0001',
      requestId,
      supplierId,
      supplierName: String(supplier.name),
      amount: totalAmount,
      totalQuantity,
      receivedQuantity,
      orderDate: '2026-09-05',
      status: 'partial',
      createdById: applicantId,
      createdByName: 'nocobase',
      createdAt: now,
      updatedAt: now,
    })
    .execute();

  const order = await query
    .selectFrom('procurementOrders')
    .select('id')
    .where('orderNumber', '=', 'PO-SEED-0001')
    .executeTakeFirst();
  if (!order) return;

  await query
    .insertInto('procurementReceipts')
    .values({
      orderId: Number(order.id),
      quantity: receivedQuantity,
      receivedDate: '2026-09-10',
      createdById: applicantId,
      createdAt: now,
    })
    .execute();
}

export default seed;
