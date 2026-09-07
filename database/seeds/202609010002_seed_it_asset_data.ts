import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * Required sample data for the IT asset management system: employees, assets
 * across several types and statuses, and both open and returned claim records.
 *
 * The seed is idempotent: it skips entirely when employees already exist, so a
 * repeat run (or a run against a database that already has data) is harmless.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609010002_seed_it_asset_data',

  async run({ query }) {
    const existing = await query
      .selectFrom('itEmployees')
      .select('id')
      .limit(1)
      .executeTakeFirst();
    if (existing) {
      return;
    }

    const now = new Date('2026-09-01T00:00:00.000Z');

    const employees = [
      {
        name: '张伟',
        department: 'IT 部',
        email: 'admin@nocobase.com',
        isAdmin: true,
      },
      { name: '李娜', department: '市场部', email: null, isAdmin: false },
      { name: '王强', department: '研发部', email: null, isAdmin: false },
      { name: '刘洋', department: '财务部', email: null, isAdmin: false },
      { name: '陈静', department: '人事部', email: null, isAdmin: false },
      { name: '赵磊', department: '销售部', email: null, isAdmin: false },
    ];

    for (const employee of employees) {
      await query
        .insertInto('itEmployees')
        .values({ ...employee, createdAt: now })
        .execute();
    }

    const employeeRows = await query
      .selectFrom('itEmployees')
      .select(['id', 'name', 'email'])
      .execute();
    const employeeIdByName = new Map(
      employeeRows.map((row) => [String(row.name), Number(row.id)]),
    );

    const assets = [
      {
        assetNumber: 'ASSET-001',
        name: 'ThinkPad X1 Carbon',
        type: 'computer',
        brandModel: '联想 ThinkPad X1 Carbon Gen 11',
        status: 'available',
        currentEmployeeId: null,
        purchasedAt: new Date('2023-05-10T00:00:00.000Z'),
        remark: '主力办公笔记本',
      },
      {
        assetNumber: 'ASSET-002',
        name: 'U2723QE 显示器',
        type: 'monitor',
        brandModel: '戴尔 U2723QE 27 英寸 4K',
        status: 'inUse',
        currentEmployeeId: employeeIdByName.get('李娜') ?? null,
        purchasedAt: new Date('2023-06-15T00:00:00.000Z'),
        remark: null,
      },
      {
        assetNumber: 'ASSET-003',
        name: 'iPhone 15 Pro',
        type: 'phone',
        brandModel: '苹果 iPhone 15 Pro 256G',
        status: 'inUse',
        currentEmployeeId: employeeIdByName.get('王强') ?? null,
        purchasedAt: new Date('2023-09-01T00:00:00.000Z'),
        remark: '测试机',
      },
      {
        assetNumber: 'ASSET-004',
        name: 'MateBook 14',
        type: 'computer',
        brandModel: '华为 MateBook 14 2022',
        status: 'maintenance',
        currentEmployeeId: null,
        purchasedAt: new Date('2022-11-20T00:00:00.000Z'),
        remark: '键盘故障，送修中',
      },
      {
        assetNumber: 'ASSET-005',
        name: 'MX Master 3S 鼠标',
        type: 'other',
        brandModel: '罗技 MX Master 3S',
        status: 'available',
        currentEmployeeId: null,
        purchasedAt: new Date('2024-01-08T00:00:00.000Z'),
        remark: null,
      },
      {
        assetNumber: 'ASSET-006',
        name: 'MacBook Pro 14',
        type: 'computer',
        brandModel: '苹果 MacBook Pro 14 M3 Pro',
        status: 'inUse',
        currentEmployeeId: employeeIdByName.get('刘洋') ?? null,
        purchasedAt: new Date('2024-02-14T00:00:00.000Z'),
        remark: '设计专用',
      },
      {
        assetNumber: 'ASSET-007',
        name: 'Galaxy S24 Ultra',
        type: 'phone',
        brandModel: '三星 Galaxy S24 Ultra',
        status: 'retired',
        currentEmployeeId: null,
        purchasedAt: new Date('2022-03-30T00:00:00.000Z'),
        remark: '已报废',
      },
      {
        assetNumber: 'ASSET-008',
        name: '27E1N8900 显示器',
        type: 'monitor',
        brandModel: '飞利浦 27E1N8900 OLED',
        status: 'available',
        currentEmployeeId: null,
        purchasedAt: new Date('2024-04-22T00:00:00.000Z'),
        remark: null,
      },
      {
        assetNumber: 'ASSET-009',
        name: '小米 13',
        type: 'phone',
        brandModel: '小米 13 12+256G',
        status: 'inUse',
        currentEmployeeId: employeeIdByName.get('陈静') ?? null,
        purchasedAt: new Date('2023-12-05T00:00:00.000Z'),
        remark: null,
      },
      {
        assetNumber: 'ASSET-010',
        name: 'LaserJet Pro 打印机',
        type: 'other',
        brandModel: '惠普 LaserJet Pro M405dn',
        status: 'available',
        currentEmployeeId: null,
        purchasedAt: new Date('2023-08-18T00:00:00.000Z'),
        remark: '公共打印机',
      },
    ];

    for (const asset of assets) {
      await query
        .insertInto('itAssets')
        .values({ ...asset, createdAt: now })
        .execute();
    }

    const assetRows = await query
      .selectFrom('itAssets')
      .select(['id', 'assetNumber'])
      .execute();
    const assetIdByNumber = new Map(
      assetRows.map((row) => [String(row.assetNumber), Number(row.id)]),
    );

    const records = [
      {
        assetNumber: 'ASSET-002',
        employeeName: '李娜',
        claimedAt: new Date('2024-03-01T00:00:00.000Z'),
        returnedAt: null,
        status: 'claimed',
        remark: null,
      },
      {
        assetNumber: 'ASSET-003',
        employeeName: '王强',
        claimedAt: new Date('2024-05-12T00:00:00.000Z'),
        returnedAt: null,
        status: 'claimed',
        remark: null,
      },
      {
        assetNumber: 'ASSET-006',
        employeeName: '刘洋',
        claimedAt: new Date('2024-06-20T00:00:00.000Z'),
        returnedAt: null,
        status: 'claimed',
        remark: null,
      },
      {
        assetNumber: 'ASSET-009',
        employeeName: '陈静',
        claimedAt: new Date('2024-07-01T00:00:00.000Z'),
        returnedAt: null,
        status: 'claimed',
        remark: null,
      },
      {
        assetNumber: 'ASSET-001',
        employeeName: '赵磊',
        claimedAt: new Date('2024-02-10T00:00:00.000Z'),
        returnedAt: new Date('2024-04-15T00:00:00.000Z'),
        status: 'returned',
        remark: '项目结束归还',
      },
      {
        assetNumber: 'ASSET-004',
        employeeName: '张伟',
        claimedAt: new Date('2023-12-01T00:00:00.000Z'),
        returnedAt: new Date('2024-01-20T00:00:00.000Z'),
        status: 'returned',
        remark: '归还后送修',
      },
      {
        assetNumber: 'ASSET-007',
        employeeName: '李娜',
        claimedAt: new Date('2023-05-01T00:00:00.000Z'),
        returnedAt: new Date('2023-10-30T00:00:00.000Z'),
        status: 'returned',
        remark: null,
      },
      {
        assetNumber: 'ASSET-005',
        employeeName: '王强',
        claimedAt: new Date('2024-03-05T00:00:00.000Z'),
        returnedAt: new Date('2024-05-01T00:00:00.000Z'),
        status: 'returned',
        remark: null,
      },
    ];

    for (const record of records) {
      const assetId = assetIdByNumber.get(record.assetNumber);
      const employeeId = employeeIdByName.get(record.employeeName);
      if (assetId === undefined || employeeId === undefined) {
        throw new Error(
          `Seed record references unknown asset or employee: ${record.assetNumber} / ${record.employeeName}`,
        );
      }
      await query
        .insertInto('itAssetRecords')
        .values({
          assetId,
          employeeId,
          claimedAt: record.claimedAt,
          returnedAt: record.returnedAt,
          status: record.status,
          remark: record.remark,
          createdAt: now,
        })
        .execute();
    }
  },
});

export default seed;
