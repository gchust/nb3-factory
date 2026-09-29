import { defineSeed, type SeedDefinition } from '@nocobase/db';

interface SampleContact {
  readonly name: string;
  readonly department: string;
  readonly phone: string | null;
  readonly notes: string | null;
}

/**
 * Five sample contacts covering all three departments.
 *
 * The seed is idempotent by refusing to touch a non-empty table: a repeated run
 * is a no-op, and contacts a user added or edited are never overwritten. The
 * department codes match the contacts service and the client locale keys.
 */
const SAMPLE_CONTACTS: readonly SampleContact[] = [
  {
    name: '陈晨',
    department: 'rd',
    phone: '13800138001',
    notes: '后端开发，负责数据接口。',
  },
  {
    name: '李娜',
    department: 'sales',
    phone: '13800138002',
    notes: '华东区客户对接。',
  },
  {
    name: '王强',
    department: 'admin',
    phone: '13800138003',
    notes: null,
  },
  {
    name: '张敏',
    department: 'rd',
    phone: null,
    notes: '前端开发。',
  },
  {
    name: '刘洋',
    department: 'sales',
    phone: '13800138005',
    notes: '华南区客户对接。',
  },
];

const seed: SeedDefinition = defineSeed({
  name: '202609020002_sample_contacts',
  async run(context) {
    const contacts = context.repository<SampleContact>('contacts');
    if ((await contacts.count()) > 0) return;
    for (const contact of SAMPLE_CONTACTS) {
      await contacts.createOne({ values: contact });
    }
  },
});

export default seed;
