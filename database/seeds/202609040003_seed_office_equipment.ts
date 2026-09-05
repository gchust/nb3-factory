import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * Sample office equipment ledger plus borrowing examples, required for a fresh
 * install to be navigable and demoable. Every insert is guarded by a presence
 * check so the seed is idempotent: rerunning it never duplicates rows and
 * never overwrites edits made after the first run.
 *
 * The seed reads the authentication plugin's admin user for the borrower
 * snapshot, but writes only to this application's own tables.
 */
const seed: SeedDefinition = defineSeed({
  name: '202609040003_seed_office_equipment',
  async run({ query }) {
    const now = new Date().toISOString();

    const equipmentSeedRows: ReadonlyArray<{
      name: string;
      assetNumber: string;
      category: string;
      status: 'available' | 'borrowed' | 'repairing';
      description: string;
    }> = [
      {
        name: 'MacBook Pro 14"',
        assetNumber: 'M1-LT-001',
        category: '笔记本电脑',
        status: 'borrowed',
        description: 'M3 Pro / 18GB / 512GB, 项目组公共笔记本',
      },
      {
        name: 'Dell U2723QE 显示器',
        assetNumber: 'M1-MN-002',
        category: '显示器',
        status: 'available',
        description: '27 英寸 4K, 带 USB-C 供电',
      },
      {
        name: '爱普生 CB-X06 投影仪',
        assetNumber: 'M1-PJ-003',
        category: '投影仪',
        status: 'repairing',
        description: '灯泡亮度不足, 送修中',
      },
      {
        name: 'HP LaserJet M405dn 打印机',
        assetNumber: 'M1-PR-004',
        category: '打印机',
        status: 'available',
        description: '双面打印, 支持网络共享',
      },
      {
        name: '人体工学办公椅',
        assetNumber: 'M1-CH-005',
        category: '办公家具',
        status: 'available',
        description: '可调腰托与扶手',
      },
      {
        name: '机械键盘 (茶轴)',
        assetNumber: 'M1-KB-006',
        category: '外设',
        status: 'available',
        description: '87 键有线, 办公室试用',
      },
      {
        name: '无线鼠标',
        assetNumber: 'M1-MS-007',
        category: '外设',
        status: 'available',
        description: '蓝牙 + 2.4G 双模',
      },
      {
        name: '白板 90×150cm',
        assetNumber: 'M1-WB-008',
        category: '办公用品',
        status: 'available',
        description: '会议室移动白板',
      },
    ];

    for (const row of equipmentSeedRows) {
      const existing = await query
        .selectFrom('equipment')
        .select(['id'])
        .where('assetNumber', '=', row.assetNumber)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      await query
        .insertInto('equipment')
        .values({
          name: row.name,
          assetNumber: row.assetNumber,
          category: row.category,
          status: row.status,
          description: row.description,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const admin = await query
      .selectFrom('user')
      .select(['id', 'name', 'email'])
      .where('email', '=', 'admin@nocobase.com')
      .executeTakeFirst();
    const borrowerId = admin ? String(admin.id) : '1';
    const borrowerName =
      admin && typeof admin.name === 'string' && admin.name.length > 0
        ? admin.name
        : 'Administrator';

    const borrowedAt = new Date(
      Date.now() - 5 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const pastBorrowedAt = new Date(
      Date.now() - 32 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const pastReturnedAt = new Date(
      Date.now() - 20 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const borrowRecordSeeds: ReadonlyArray<{
      equipmentAssetNumber: string;
      borrowedAt: string;
      returnedAt: string | null;
      note: string;
    }> = [
      {
        equipmentAssetNumber: 'M1-LT-001',
        borrowedAt,
        returnedAt: null,
        note: '项目演示周临时借用',
      },
      {
        equipmentAssetNumber: 'M1-KB-006',
        borrowedAt: pastBorrowedAt,
        returnedAt: pastReturnedAt,
        note: '机械键盘试用, 已归还',
      },
    ];

    for (const record of borrowRecordSeeds) {
      const equipment = await query
        .selectFrom('equipment')
        .select(['id'])
        .where('assetNumber', '=', record.equipmentAssetNumber)
        .executeTakeFirst();
      if (!equipment) {
        continue;
      }
      const existing = await query
        .selectFrom('equipmentBorrowRecord')
        .select(['id'])
        .where('equipmentId', '=', equipment.id)
        .where('borrowerId', '=', borrowerId)
        .where('borrowedAt', '=', record.borrowedAt)
        .executeTakeFirst();
      if (existing) {
        continue;
      }
      await query
        .insertInto('equipmentBorrowRecord')
        .values({
          equipmentId: equipment.id,
          borrowerId,
          borrowerName,
          borrowedAt: record.borrowedAt,
          returnedAt: record.returnedAt,
          note: record.note,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
