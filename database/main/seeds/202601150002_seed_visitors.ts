import { defineSeed, type SeedDefinition } from '@nocobase/db';

interface VisitorSeedRecord {
  name: string;
  phone: string;
  reason: string;
  employeeName: string;
  arrivedAt: string;
  departedAt: string | null;
}

/**
 * A small, deterministic sample register so a fresh installation has
 * something to browse. Installation data only: it runs once, and leaves an
 * already-populated register untouched.
 */
const seed: SeedDefinition = defineSeed({
  name: '202601150002_seed_visitors',
  async run(context) {
    const visitors = context.repository<VisitorSeedRecord>('visitors');
    if ((await visitors.count()) > 0) {
      return;
    }

    const records: readonly VisitorSeedRecord[] = [
      {
        name: '张伟',
        phone: '13800000001',
        reason: '面试',
        employeeName: '王芳',
        arrivedAt: '2026-01-15T01:20:00.000Z',
        departedAt: '2026-01-15T02:05:00.000Z',
      },
      {
        name: '李娜',
        phone: '13800000002',
        reason: '商务洽谈',
        employeeName: 'David Lee',
        arrivedAt: '2026-01-15T02:10:00.000Z',
        departedAt: '2026-01-15T03:40:00.000Z',
      },
      {
        name: '王强',
        phone: '13800000003',
        reason: '设备维修',
        employeeName: '陈静',
        arrivedAt: '2026-01-15T03:05:00.000Z',
        departedAt: null,
      },
      {
        name: 'Emily Carter',
        phone: '13800000004',
        reason: '合作伙伴访问',
        employeeName: '王芳',
        arrivedAt: '2026-01-15T05:30:00.000Z',
        departedAt: null,
      },
      {
        name: '刘洋',
        phone: '13800000005',
        reason: '面试',
        employeeName: 'David Lee',
        arrivedAt: '2026-01-15T06:15:00.000Z',
        departedAt: null,
      },
      {
        name: 'Michael Brown',
        phone: '13800000006',
        reason: '供应商送货',
        employeeName: '陈静',
        arrivedAt: '2026-01-14T00:45:00.000Z',
        departedAt: '2026-01-14T01:30:00.000Z',
      },
      {
        name: '赵敏',
        phone: '13800000007',
        reason: '资料交接',
        employeeName: '王芳',
        arrivedAt: '2026-01-14T07:00:00.000Z',
        departedAt: null,
      },
    ];

    for (const record of records) {
      await visitors.createOne({ values: record });
    }
  },
});

export default seed;
