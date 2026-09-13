import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * A small, fixed demonstration set so a fresh installation is not an empty shell.
 *
 * It runs only while the asset ledger is empty, which makes a repeat run a no-op and guarantees the
 * seed can never overwrite or fight with records a user created. All identifiers are fixed strings,
 * never timestamps or random values.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609130010_it_sample_data',

  async run({ query }) {
    const existing = await query
      .selectFrom('itAssets')
      .select('id')
      .limit(1)
      .executeTakeFirst();
    if (existing) return;

    const now = new Date();
    await query
      .insertInto('itAssets')
      .values([
        {
          assetCode: 'IT-2024-0001',
          name: 'MacBook Pro 14',
          category: 'computer',
          brandModel: 'Apple MacBook Pro 14 M3',
          purchaseDate: new Date('2024-03-12T00:00:00.000Z'),
          purchaseAmount: 18999,
          status: 'in_use',
          currentHolder: '张伟',
          createdAt: now,
          updatedAt: now,
        },
        {
          assetCode: 'IT-2024-0002',
          name: 'Dell UltraSharp 27 显示器',
          category: 'monitor',
          brandModel: 'Dell U2723QE',
          purchaseDate: new Date('2024-05-08T00:00:00.000Z'),
          purchaseAmount: 3299,
          status: 'idle',
          currentHolder: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          assetCode: 'IT-2024-0003',
          name: 'Cisco 24 口交换机',
          category: 'network',
          brandModel: 'Cisco Catalyst 1000-24T',
          purchaseDate: new Date('2024-01-20T00:00:00.000Z'),
          purchaseAmount: 5699,
          status: 'repairing',
          currentHolder: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          assetCode: 'IT-2024-0004',
          name: 'HP 激光打印机',
          category: 'office',
          brandModel: 'HP LaserJet Pro M404dn',
          purchaseDate: new Date('2023-11-02T00:00:00.000Z'),
          purchaseAmount: 2199,
          status: 'scrapped',
          currentHolder: null,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .execute();

    const assetRows = await query
      .selectFrom('itAssets')
      .select(['id', 'assetCode'])
      .execute();
    const assetIdByCode = new Map(
      assetRows.map((row) => [String(row.assetCode), row.id]),
    );
    const laptopId = assetIdByCode.get('IT-2024-0001');
    const monitorId = assetIdByCode.get('IT-2024-0002');

    await query
      .insertInto('itAssetAssignments')
      .values({
        assetId: laptopId,
        employeeName: '张伟',
        assignedAt: new Date('2024-03-15T02:00:00.000Z'),
        returnedAt: null,
        note: '入职领用',
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    await query
      .insertInto('itWorkOrders')
      .values([
        {
          orderNo: 'WO-2024-0001',
          reporterName: '张伟',
          reporterId: 'seed-reporter-zhangwei',
          assetId: laptopId,
          location: null,
          description: '笔记本电池续航异常，需要检测。',
          priority: 'high',
          status: 'in_progress',
          assignee: '李工',
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          orderNo: 'WO-2024-0002',
          reporterName: '王芳',
          reporterId: 'seed-reporter-wangfang',
          assetId: monitorId,
          location: null,
          description: '显示器出现闪烁，已更换线材。',
          priority: 'medium',
          status: 'completed',
          assignee: '李工',
          completedAt: new Date('2024-06-02T09:30:00.000Z'),
          createdAt: new Date('2024-06-01T01:00:00.000Z'),
          updatedAt: new Date('2024-06-02T09:30:00.000Z'),
        },
      ])
      .execute();

    const orderRows = await query
      .selectFrom('itWorkOrders')
      .select(['id', 'orderNo'])
      .execute();
    const orderIdByNo = new Map(
      orderRows.map((row) => [String(row.orderNo), row.id]),
    );
    const firstOrderId = orderIdByNo.get('WO-2024-0001');
    const secondOrderId = orderIdByNo.get('WO-2024-0002');

    await query
      .insertInto('itWorkOrderLogs')
      .values([
        {
          workOrderId: firstOrderId,
          content: '已受理，安排检测电池健康度。',
          authorName: '李工',
          createdAt: new Date('2024-06-01T03:00:00.000Z'),
        },
        {
          workOrderId: secondOrderId,
          content: '更换 DisplayPort 线材后恢复正常。',
          authorName: '李工',
          createdAt: new Date('2024-06-02T09:25:00.000Z'),
        },
      ])
      .execute();
  },
});

export default seed;
