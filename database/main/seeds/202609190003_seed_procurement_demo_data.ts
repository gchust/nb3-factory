import {
  defineSeed,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';

/**
 * Deterministic demonstration data for the procurement module: six suppliers,
 * twelve materials, eight orders covering every status and both buyers, and
 * four receipts.
 *
 * Every record is keyed by a stable business identifier (supplier name, material
 * code, order number, receipt number), so a repeat run inserts nothing and never
 * overwrites data a user has edited.
 */
interface SupplierSeed {
  readonly name: string;
  readonly contactName: string;
  readonly phone: string;
  readonly status: string;
  readonly owner: string;
  readonly remark: string;
}

interface MaterialSeed {
  readonly code: string;
  readonly name: string;
  readonly spec: string;
  readonly unit: string;
}

interface OrderItemSeed {
  readonly materialCode: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly expectedDate: string;
  readonly remark?: string;
}

interface OrderSeed {
  readonly orderNo: string;
  readonly supplier: string;
  readonly buyer: string;
  readonly status: 'draft' | 'submitted' | 'approved' | 'rejected';
  readonly remark: string;
  readonly rejectReason?: string;
  readonly items: readonly OrderItemSeed[];
}

interface ReceiptItemSeed {
  readonly materialCode: string;
  readonly quantity: number;
}

interface ReceiptSeed {
  readonly receiptNo: string;
  readonly orderNo: string;
  readonly receivedBy: string;
  readonly receivedAt: string;
  readonly remark: string;
  readonly items: readonly ReceiptItemSeed[];
}

const SUPPLIERS: readonly SupplierSeed[] = [
  {
    name: '华东金属材料有限公司',
    contactName: '张伟',
    phone: '13800000001',
    status: 'active',
    owner: 'buyer1',
    remark: '主营钢板、铝型材',
  },
  {
    name: '南方电子元器件厂',
    contactName: '李娜',
    phone: '13800000002',
    status: 'active',
    owner: 'buyer1',
    remark: '被动元件与电路板',
  },
  {
    name: '北方包装制品有限公司',
    contactName: '王强',
    phone: '13800000003',
    status: 'active',
    owner: 'buyer1',
    remark: '纸箱、气泡膜',
  },
  {
    name: '西部机械配件公司',
    contactName: '赵敏',
    phone: '13800000004',
    status: 'active',
    owner: 'buyer2',
    remark: '轴承、标准件',
  },
  {
    name: '中原化工原料有限公司',
    contactName: '陈杰',
    phone: '13800000005',
    status: 'active',
    owner: 'buyer2',
    remark: '润滑油、溶剂',
  },
  {
    name: '滨海五金供应商',
    contactName: '刘洋',
    phone: '13800000006',
    status: 'inactive',
    owner: 'buyer2',
    remark: '暂停合作',
  },
];

const MATERIALS: readonly MaterialSeed[] = [
  { code: 'M-001', name: '冷轧钢板', spec: 'Q235B 1.5mm', unit: '张' },
  { code: 'M-002', name: '铝型材', spec: '6063-T5', unit: '米' },
  { code: 'M-003', name: '贴片电阻', spec: '1kΩ 1/4W', unit: '个' },
  { code: 'M-004', name: '电解电容', spec: '100μF 25V', unit: '个' },
  { code: 'M-005', name: '双面电路板', spec: 'FR-4 1.6mm', unit: '块' },
  { code: 'M-006', name: '瓦楞纸箱', spec: '五层 500×400×300', unit: '个' },
  { code: 'M-007', name: '气泡膜', spec: '50cm×100m', unit: '卷' },
  { code: 'M-008', name: '深沟球轴承', spec: '6204-2RS', unit: '个' },
  { code: 'M-009', name: '不锈钢螺栓', spec: 'M8×30', unit: '个' },
  { code: 'M-010', name: '抗磨液压油', spec: '46#', unit: '桶' },
  { code: 'M-011', name: '工业乙醇', spec: '99.5%', unit: '桶' },
  { code: 'M-012', name: '透明封箱胶带', spec: '4.5cm×100m', unit: '卷' },
];

const ORDERS: readonly OrderSeed[] = [
  {
    orderNo: 'PO-20260901-0001',
    supplier: '华东金属材料有限公司',
    buyer: 'buyer1',
    status: 'approved',
    remark: '首批生产用料',
    items: [
      {
        materialCode: 'M-001',
        quantity: 100,
        unitPrice: 12.5,
        expectedDate: '2026-09-20',
        remark: '分两批到货',
      },
      {
        materialCode: 'M-009',
        quantity: 500,
        unitPrice: 0.8,
        expectedDate: '2026-09-20',
      },
    ],
  },
  {
    orderNo: 'PO-20260901-0002',
    supplier: '南方电子元器件厂',
    buyer: 'buyer1',
    status: 'submitted',
    remark: '等待经理审核',
    items: [
      {
        materialCode: 'M-003',
        quantity: 1000,
        unitPrice: 0.05,
        expectedDate: '2026-09-28',
      },
      {
        materialCode: 'M-004',
        quantity: 500,
        unitPrice: 0.12,
        expectedDate: '2026-09-28',
      },
    ],
  },
  {
    orderNo: 'PO-20260902-0003',
    supplier: '北方包装制品有限公司',
    buyer: 'buyer1',
    status: 'draft',
    remark: '草稿待完善',
    items: [
      {
        materialCode: 'M-006',
        quantity: 200,
        unitPrice: 3.2,
        expectedDate: '2026-10-05',
      },
      {
        materialCode: 'M-007',
        quantity: 50,
        unitPrice: 8.5,
        expectedDate: '2026-10-05',
      },
    ],
  },
  {
    orderNo: 'PO-20260902-0004',
    supplier: '西部机械配件公司',
    buyer: 'buyer2',
    status: 'approved',
    remark: '设备检修备件',
    items: [
      {
        materialCode: 'M-008',
        quantity: 80,
        unitPrice: 15,
        expectedDate: '2026-09-25',
      },
      {
        materialCode: 'M-009',
        quantity: 300,
        unitPrice: 0.8,
        expectedDate: '2026-09-25',
      },
    ],
  },
  {
    orderNo: 'PO-20260903-0005',
    supplier: '中原化工原料有限公司',
    buyer: 'buyer2',
    status: 'submitted',
    remark: '待审核',
    items: [
      {
        materialCode: 'M-010',
        quantity: 20,
        unitPrice: 85,
        expectedDate: '2026-10-01',
      },
    ],
  },
  {
    orderNo: 'PO-20260903-0006',
    supplier: '西部机械配件公司',
    buyer: 'buyer2',
    status: 'rejected',
    remark: '价格偏高，需重新询价',
    rejectReason: '单价高于上季度采购价，请重新比价后提交',
    items: [
      {
        materialCode: 'M-008',
        quantity: 40,
        unitPrice: 15.5,
        expectedDate: '2026-10-08',
      },
      {
        materialCode: 'M-009',
        quantity: 200,
        unitPrice: 0.82,
        expectedDate: '2026-10-08',
      },
    ],
  },
  {
    orderNo: 'PO-20260904-0007',
    supplier: '华东金属材料有限公司',
    buyer: 'buyer1',
    status: 'approved',
    remark: '已全部到货',
    items: [
      {
        materialCode: 'M-001',
        quantity: 60,
        unitPrice: 12.8,
        expectedDate: '2026-09-15',
      },
      {
        materialCode: 'M-002',
        quantity: 100,
        unitPrice: 22,
        expectedDate: '2026-09-15',
      },
    ],
  },
  {
    orderNo: 'PO-20260904-0008',
    supplier: '中原化工原料有限公司',
    buyer: 'buyer2',
    status: 'draft',
    remark: '尚未提交',
    items: [
      {
        materialCode: 'M-011',
        quantity: 30,
        unitPrice: 45,
        expectedDate: '2026-10-12',
      },
    ],
  },
];

const RECEIPTS: readonly ReceiptSeed[] = [
  {
    receiptNo: 'GR-20260905-0001',
    orderNo: 'PO-20260901-0001',
    receivedBy: 'warehouse1',
    receivedAt: '2026-09-05',
    remark: '第一批到货',
    items: [{ materialCode: 'M-001', quantity: 40 }],
  },
  {
    receiptNo: 'GR-20260906-0002',
    orderNo: 'PO-20260901-0001',
    receivedBy: 'warehouse1',
    receivedAt: '2026-09-06',
    remark: '第二批到货',
    items: [{ materialCode: 'M-001', quantity: 60 }],
  },
  {
    receiptNo: 'GR-20260907-0003',
    orderNo: 'PO-20260902-0004',
    receivedBy: 'warehouse1',
    receivedAt: '2026-09-07',
    remark: '轴承部分到货',
    items: [{ materialCode: 'M-008', quantity: 30 }],
  },
  {
    receiptNo: 'GR-20260908-0004',
    orderNo: 'PO-20260904-0007',
    receivedBy: 'warehouse1',
    receivedAt: '2026-09-08',
    remark: '整单到货',
    items: [
      { materialCode: 'M-001', quantity: 60 },
      { materialCode: 'M-002', quantity: 100 },
    ],
  },
];

const seed: SeedDefinition = defineSeed({
  name: '202609190003_seed_procurement_demo_data',

  async run(context) {
    const { query } = context;
    const now = new Date();

    const userNames = new Map<string, string>();
    for (const username of ['manager1', 'buyer1', 'buyer2', 'warehouse1']) {
      const row = await query
        .selectFrom('user')
        .select('id')
        .where('username', '=', username)
        .executeTakeFirst();
      if (!row) {
        throw new Error(
          `Procurement demo users are missing (${username}); run the roles seed first.`,
        );
      }
      userNames.set(username, String(row.id));
    }

    for (const supplier of SUPPLIERS) {
      const existing = await query
        .selectFrom('suppliers')
        .select('id')
        .where('name', '=', supplier.name)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('suppliers')
        .values({
          name: supplier.name,
          contactName: supplier.contactName,
          phone: supplier.phone,
          status: supplier.status,
          ownerId: requireUser(userNames, supplier.owner),
          remark: supplier.remark,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    for (const material of MATERIALS) {
      const existing = await query
        .selectFrom('materials')
        .select('id')
        .where('code', '=', material.code)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('materials')
        .values({
          code: material.code,
          name: material.name,
          spec: material.spec,
          unit: material.unit,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    for (const order of ORDERS) {
      const existing = await query
        .selectFrom('purchaseOrders')
        .select('id')
        .where('orderNo', '=', order.orderNo)
        .executeTakeFirst();
      if (existing) continue;

      const supplierId = await requireSupplierId(query, order.supplier);
      const items = await Promise.all(
        order.items.map(async (item) => ({
          materialId: await requireMaterialId(query, item.materialCode),
          seed: item,
        })),
      );
      const totalAmount = items.reduce(
        (sum, item) => sum + item.seed.quantity * item.seed.unitPrice,
        0,
      );
      const submitted = order.status !== 'draft';
      const reviewed =
        order.status === 'approved' || order.status === 'rejected';

      await query
        .insertInto('purchaseOrders')
        .values({
          orderNo: order.orderNo,
          supplierId,
          buyerId: requireUser(userNames, order.buyer),
          status: order.status,
          totalAmount,
          remark: order.remark,
          rejectReason: order.rejectReason ?? null,
          submittedAt: submitted ? new Date('2026-09-04T01:00:00.000Z') : null,
          reviewedAt: reviewed ? new Date('2026-09-04T03:00:00.000Z') : null,
          reviewerId: reviewed ? requireUser(userNames, 'manager1') : null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();

      const inserted = await query
        .selectFrom('purchaseOrders')
        .select('id')
        .where('orderNo', '=', order.orderNo)
        .executeTakeFirstOrThrow();

      for (const item of items) {
        await query
          .insertInto('purchaseOrderItems')
          .values({
            orderId: Number(inserted.id),
            materialId: item.materialId,
            quantity: item.seed.quantity,
            unitPrice: item.seed.unitPrice,
            amount: item.seed.quantity * item.seed.unitPrice,
            receivedQuantity: 0,
            expectedDate: new Date(`${item.seed.expectedDate}T00:00:00.000Z`),
            remark: item.seed.remark ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }
    }

    for (const receipt of RECEIPTS) {
      const existing = await query
        .selectFrom('goodsReceipts')
        .select('id')
        .where('receiptNo', '=', receipt.receiptNo)
        .executeTakeFirst();
      if (existing) continue;

      const order = await query
        .selectFrom('purchaseOrders')
        .select('id')
        .where('orderNo', '=', receipt.orderNo)
        .executeTakeFirstOrThrow();
      const orderId = Number(order.id);

      await query
        .insertInto('goodsReceipts')
        .values({
          receiptNo: receipt.receiptNo,
          orderId,
          receivedById: requireUser(userNames, receipt.receivedBy),
          receivedAt: new Date(`${receipt.receivedAt}T02:00:00.000Z`),
          remark: receipt.remark,
          requestId: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();

      const inserted = await query
        .selectFrom('goodsReceipts')
        .select('id')
        .where('receiptNo', '=', receipt.receiptNo)
        .executeTakeFirstOrThrow();

      for (const item of receipt.items) {
        const orderItem = await query
          .selectFrom('purchaseOrderItems as items')
          .innerJoin(
            'materials as materials',
            'materials.id',
            'items.materialId',
          )
          .select([
            'items.id as id',
            'items.receivedQuantity as receivedQuantity',
          ])
          .where('items.orderId', '=', orderId)
          .where('materials.code', '=', item.materialCode)
          .executeTakeFirstOrThrow();
        const orderItemId = Number(orderItem.id);
        await query
          .insertInto('goodsReceiptItems')
          .values({
            receiptId: Number(inserted.id),
            orderItemId,
            quantity: item.quantity,
            createdAt: now,
          })
          .execute();
        await query
          .updateTable('purchaseOrderItems')
          .set({
            receivedQuantity:
              Number(orderItem.receivedQuantity) + item.quantity,
          })
          .where('id', '=', orderItemId)
          .execute();
      }
    }
  },
});

function requireUser(
  users: ReadonlyMap<string, string>,
  username: string,
): string {
  const id = users.get(username);
  if (!id) throw new Error(`Unknown standard user: ${username}`);
  return id;
}

async function requireSupplierId(
  query: SeedContext['query'],
  name: string,
): Promise<number> {
  const row = await query
    .selectFrom('suppliers')
    .select('id')
    .where('name', '=', name)
    .executeTakeFirstOrThrow();
  return Number(row.id);
}

async function requireMaterialId(
  query: SeedContext['query'],
  code: string,
): Promise<number> {
  const row = await query
    .selectFrom('materials')
    .select('id')
    .where('code', '=', code)
    .executeTakeFirstOrThrow();
  return Number(row.id);
}

export default seed;
