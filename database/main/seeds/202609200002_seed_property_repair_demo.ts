/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion -- The database query adapter returns
   generic rows. Each query in this file names the shape it produces so the DTOs stay explicit; the
   assertions are deliberate and are backed by the tests in tests/logic/repair-service.test.ts. */
import { hashPassword } from 'better-auth/crypto';
import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * Required and demonstration data for the property repair system.
 *
 * Idempotent: every row is guarded by a natural key (username, code, ticket number, settlement number), so a repeat
 * run executes nothing. Timestamps are derived from the run time so the monthly dashboard metrics are populated,
 * while every identifying value is fixed.
 */

const DEMO_PASSWORD = 'Repair@2026';

export interface RepairSampleMetadata {
  readonly id: string;
  readonly key: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
}

/**
 * The sample files a clean installation gets.
 *
 * Declared here instead of importing the server module that holds the bytes: the seed is loaded by a plain ESM
 * loader that cannot resolve a sibling TypeScript module, and the file bytes only ever need to exist for the
 * provider that writes them into the configured disk. `tests/logic/repair-seed.test.ts` asserts this list and the
 * server module stay identical, so the two cannot drift.
 */
export const REPAIR_SAMPLE_FILE_METADATA: readonly RepairSampleMetadata[] = [
  {
    id: '2f7a1c90-5d3e-4c8a-9b11-0a1b2c3d4e01',
    key: 'repair-samples/2f7a1c90-5d3e-4c8a-9b11-0a1b2c3d4e01.png',
    filename: '现场照片-渗水-01.png',
    ext: 'png',
    mimeType: 'image/png',
    size: 752,
  },
  {
    id: '3a8b2da1-6e4f-4d9b-ac22-1b2c3d4e5f02',
    key: 'repair-samples/3a8b2da1-6e4f-4d9b-ac22-1b2c3d4e5f02.png',
    filename: '维修完成照片-02.png',
    ext: 'png',
    mimeType: 'image/png',
    size: 1208,
  },
  {
    id: '4b9c3eb2-7f50-4eac-bd33-2c3d4e5f6a03',
    key: 'repair-samples/4b9c3eb2-7f50-4eac-bd33-2c3d4e5f6a03.pdf',
    filename: '维修检测报告-三页.pdf',
    ext: 'pdf',
    mimeType: 'application/pdf',
    size: 1328,
  },
  {
    id: '5cad4fc3-8a61-4fbd-ce44-3d4e5f6a7b04',
    key: 'repair-samples/5cad4fc3-8a61-4fbd-ce44-3d4e5f6a7b04.txt',
    filename: '设备说明-中文样例.txt',
    ext: 'txt',
    mimeType: 'text/plain',
    size: 335,
  },
  {
    id: '6dbe50d4-9b72-40ce-df55-4e5f6a7b8c05',
    key: 'repair-samples/6dbe50d4-9b72-40ce-df55-4e5f6a7b8c05.csv',
    filename: '材料费用明细.csv',
    ext: 'csv',
    mimeType: 'text/csv',
    size: 188,
  },
  {
    id: '7ecf61e5-ac83-41df-ea66-5f6a7b8c9d06',
    key: 'repair-samples/7ecf61e5-ac83-41df-ea66-5f6a7b8c9d06.zip',
    filename: '历史归档包.zip',
    ext: 'zip',
    mimeType: 'application/zip',
    size: 22,
  },
];

const SAMPLE_FILE_BY_NAME = {
  beforePhoto: REPAIR_SAMPLE_FILE_METADATA[0]!,
  afterPhoto: REPAIR_SAMPLE_FILE_METADATA[1]!,
  report: REPAIR_SAMPLE_FILE_METADATA[2]!,
  text: REPAIR_SAMPLE_FILE_METADATA[3]!,
  csv: REPAIR_SAMPLE_FILE_METADATA[4]!,
  archive: REPAIR_SAMPLE_FILE_METADATA[5]!,
} as const;

interface UserSpec {
  readonly username: string;
  readonly displayName: string;
  readonly email: string;
  readonly role: string;
}

const USERS: readonly UserSpec[] = [
  {
    username: 'nocobase',
    displayName: '系统管理员',
    email: 'admin@nocobase.com',
    role: 'admin',
  },
  {
    username: 'dispatcher',
    displayName: '调度员 李敏',
    email: 'dispatcher@example.com',
    role: 'dispatcher',
  },
  {
    username: 'tech.wang',
    displayName: '维修工 王强',
    email: 'tech.wang@example.com',
    role: 'technician',
  },
  {
    username: 'tech.zhao',
    displayName: '维修工 赵磊',
    email: 'tech.zhao@example.com',
    role: 'technician',
  },
  {
    username: 'supervisor',
    displayName: '物业主管 陈静',
    email: 'supervisor@example.com',
    role: 'supervisor',
  },
  {
    username: 'finance',
    displayName: '财务 周敏',
    email: 'finance@example.com',
    role: 'finance',
  },
  {
    username: 'resident.liu',
    displayName: '住户 刘洋',
    email: 'resident.liu@example.com',
    role: 'reporter',
  },
  {
    username: 'resident.sun',
    displayName: '住户 孙倩',
    email: 'resident.sun@example.com',
    role: 'reporter',
  },
];

const BUILDINGS = [
  {
    code: 'A',
    name: 'A 栋 综合办公楼',
    address: '园区 1 号路 8 号',
    floors: 6,
    manager: '陈静',
  },
  {
    code: 'B',
    name: 'B 栋 研发楼',
    address: '园区 1 号路 10 号',
    floors: 8,
    manager: '李敏',
  },
  {
    code: 'C',
    name: 'C 栋 生活配套楼',
    address: '园区 2 号路 3 号',
    floors: 12,
    manager: '周敏',
  },
] as const;

const ROOMS = [
  {
    building: 'A',
    roomNumber: '101',
    floor: 1,
    area: 42,
    occupant: '刘洋',
    phone: '13800000001',
    usageType: 'office',
  },
  {
    building: 'A',
    roomNumber: '102',
    floor: 1,
    area: 38,
    occupant: '孙倩',
    phone: '13800000002',
    usageType: 'office',
  },
  {
    building: 'A',
    roomNumber: '103',
    floor: 1,
    area: 55,
    occupant: '园区物业',
    phone: '13800000003',
    usageType: 'equipment',
  },
  {
    building: 'A',
    roomNumber: '104',
    floor: 1,
    area: 60,
    occupant: '刘洋',
    phone: '13800000001',
    usageType: 'office',
  },
  {
    building: 'B',
    roomNumber: '201',
    floor: 2,
    area: 45,
    occupant: '孙倩',
    phone: '13800000002',
    usageType: 'office',
  },
  {
    building: 'B',
    roomNumber: '202',
    floor: 2,
    area: 45,
    occupant: '研发一组',
    phone: '13800000004',
    usageType: 'office',
  },
  {
    building: 'C',
    roomNumber: '301',
    floor: 3,
    area: 30,
    occupant: '后勤库房',
    phone: '13800000005',
    usageType: 'storage',
  },
  {
    building: 'C',
    roomNumber: '302',
    floor: 3,
    area: 80,
    occupant: '员工餐厅',
    phone: '13800000006',
    usageType: 'public',
  },
] as const;

const EQUIPMENT = [
  {
    code: 'EQ-A-001',
    building: 'A',
    name: '中央空调主机',
    category: 'hvac',
    brand: '格力',
    model: 'GMV-1200',
    roomNumber: '101',
    status: 'normal',
    manual: false,
  },
  {
    code: 'EQ-A-002',
    building: 'A',
    name: '配电箱',
    category: 'electrical',
    brand: '施耐德',
    model: 'NSX-250',
    roomNumber: '102',
    status: 'normal',
    manual: false,
  },
  {
    code: 'EQ-A-003',
    building: 'A',
    name: '排水泵',
    category: 'plumbing',
    brand: '格兰富',
    model: 'KP-350',
    roomNumber: '103',
    status: 'maintenance',
    manual: true,
  },
  {
    code: 'EQ-B-001',
    building: 'B',
    name: '网络交换机',
    category: 'network',
    brand: '华为',
    model: 'S5700',
    roomNumber: '201',
    status: 'normal',
    manual: false,
  },
  {
    code: 'EQ-B-002',
    building: 'B',
    name: '走廊照明回路',
    category: 'lighting',
    brand: '飞利浦',
    model: 'LED-18W',
    roomNumber: '202',
    status: 'normal',
    manual: false,
  },
  {
    code: 'EQ-C-001',
    building: 'C',
    name: '客用电梯',
    category: 'elevator',
    brand: '日立',
    model: 'HGE-1000',
    roomNumber: '301',
    status: 'normal',
    manual: false,
  },
] as const;

const MATERIALS = [
  {
    code: 'M-001',
    name: 'PPR 管件 φ25',
    category: 'plumbing',
    unit: '根',
    unitPrice: 18.5,
    stock: 40,
    safetyStock: 10,
  },
  {
    code: 'M-002',
    name: '密封圈 DN50',
    category: 'plumbing',
    unit: '个',
    unitPrice: 3.2,
    stock: 120,
    safetyStock: 30,
  },
  {
    code: 'M-003',
    name: 'LED 灯管 18W',
    category: 'lighting',
    unit: '支',
    unitPrice: 12,
    stock: 60,
    safetyStock: 20,
  },
  {
    code: 'M-004',
    name: '网络面板 双口',
    category: 'network',
    unit: '个',
    unitPrice: 45,
    stock: 25,
    safetyStock: 5,
  },
  {
    code: 'M-005',
    name: '水泵密封件',
    category: 'plumbing',
    unit: '套',
    unitPrice: 25,
    stock: 3,
    safetyStock: 5,
  },
] as const;

interface TicketSpec {
  readonly ticketNo: string;
  readonly title: string;
  readonly building: string;
  readonly roomNumber: string;
  readonly equipmentCode?: string;
  readonly faultType: string;
  readonly priority: string;
  readonly description: string;
  readonly contactName: string;
  readonly contactPhone: string;
  readonly status: string;
  readonly reporter: string;
  readonly assignee?: string;
  readonly createdDaysAgo: number;
  readonly dueInDays?: number;
  readonly faultCause?: string;
  readonly repairProcess?: string;
  readonly laborCost?: number;
  readonly acceptanceRemark?: string;
  readonly acceptResult?: string;
  readonly cancelReason?: string;
  readonly reworkCount?: number;
}

const TICKETS: readonly TicketSpec[] = [
  {
    ticketNo: 'RP-0001',
    title: 'A 栋 101 办公室水管渗水',
    building: 'A',
    roomNumber: '101',
    equipmentCode: 'EQ-A-001',
    faultType: 'plumbing',
    priority: 'high',
    description: '洗手池下方持续渗水，地面有积水。',
    contactName: '刘洋',
    contactPhone: '13800000001',
    status: 'pending_dispatch',
    reporter: 'resident.liu',
    createdDaysAgo: 1,
  },
  {
    ticketNo: 'RP-0002',
    title: 'B 栋 201 会议室照明不亮',
    building: 'B',
    roomNumber: '201',
    equipmentCode: 'EQ-B-002',
    faultType: 'lighting',
    priority: 'normal',
    description: '会议室靠窗一侧三盏灯不亮。',
    contactName: '孙倩',
    contactPhone: '13800000002',
    status: 'pending_dispatch',
    reporter: 'resident.sun',
    createdDaysAgo: 2,
  },
  {
    ticketNo: 'RP-0003',
    title: 'C 栋 301 门禁无法刷卡',
    building: 'C',
    roomNumber: '301',
    faultType: 'door_window',
    priority: 'normal',
    description: '门禁读卡器无响应，无法正常进出。',
    contactName: '刘洋',
    contactPhone: '13800000001',
    status: 'pending_dispatch',
    reporter: 'resident.liu',
    createdDaysAgo: 3,
  },
  {
    ticketNo: 'RP-0004',
    title: 'A 栋 102 空调不制冷',
    building: 'A',
    roomNumber: '102',
    equipmentCode: 'EQ-A-001',
    faultType: 'hvac',
    priority: 'urgent',
    description: '空调运行但出风不凉，室内温度偏高。',
    contactName: '孙倩',
    contactPhone: '13800000002',
    status: 'assigned',
    reporter: 'resident.sun',
    assignee: 'tech.wang',
    createdDaysAgo: 4,
    dueInDays: -2,
  },
  {
    ticketNo: 'RP-0005',
    title: 'B 栋 202 插座无电',
    building: 'B',
    roomNumber: '202',
    equipmentCode: 'EQ-B-001',
    faultType: 'electrical',
    priority: 'high',
    description: '靠墙四个插座全部断电。',
    contactName: '研发一组',
    contactPhone: '13800000004',
    status: 'assigned',
    reporter: 'resident.liu',
    assignee: 'tech.zhao',
    createdDaysAgo: 2,
    dueInDays: 3,
  },
  {
    ticketNo: 'RP-0006',
    title: 'C 栋 302 餐厅水管漏水',
    building: 'C',
    roomNumber: '302',
    faultType: 'plumbing',
    priority: 'urgent',
    description: '后厨主管道接口漏水，已临时关闭阀门。',
    contactName: '员工餐厅',
    contactPhone: '13800000006',
    status: 'in_progress',
    reporter: 'resident.sun',
    assignee: 'tech.wang',
    createdDaysAgo: 5,
    dueInDays: 2,
    repairProcess: '已关闭支路阀门，准备更换管件。',
  },
  {
    ticketNo: 'RP-0007',
    title: 'A 栋 103 排水泵异响',
    building: 'A',
    roomNumber: '103',
    equipmentCode: 'EQ-A-003',
    faultType: 'plumbing',
    priority: 'high',
    description: '排水泵运行时持续异响并伴随震动。',
    contactName: '园区物业',
    contactPhone: '13800000003',
    status: 'in_progress',
    reporter: 'resident.liu',
    assignee: 'tech.zhao',
    createdDaysAgo: 6,
    dueInDays: -1,
    repairProcess: '待停机检查叶轮。',
  },
  {
    ticketNo: 'RP-0008',
    title: 'B 栋 203 灯具闪烁',
    building: 'B',
    roomNumber: '202',
    equipmentCode: 'EQ-B-002',
    faultType: 'lighting',
    priority: 'normal',
    description: '走廊灯管频繁闪烁。',
    contactName: '研发一组',
    contactPhone: '13800000004',
    status: 'rework',
    reporter: 'resident.sun',
    assignee: 'tech.wang',
    createdDaysAgo: 8,
    dueInDays: 1,
    faultCause: '镇流器老化',
    repairProcess: '已更换灯管',
    laborCost: 30,
    reworkCount: 1,
    acceptResult: 'rejected',
    acceptanceRemark: '更换后仍有闪烁，请检查镇流器。',
  },
  {
    ticketNo: 'RP-0009',
    title: 'C 栋 301 电梯门异响',
    building: 'C',
    roomNumber: '301',
    equipmentCode: 'EQ-C-001',
    faultType: 'elevator',
    priority: 'urgent',
    description: '电梯开关门时有金属摩擦声。',
    contactName: '后勤库房',
    contactPhone: '13800000005',
    status: 'pending_acceptance',
    reporter: 'resident.liu',
    assignee: 'tech.zhao',
    createdDaysAgo: 4,
    dueInDays: 3,
    faultCause: '门滑轨缺少润滑并有轻微变形',
    repairProcess: '清洁滑轨、补充润滑脂并调整门刀间隙。',
    laborCost: 120,
  },
  {
    ticketNo: 'RP-0010',
    title: 'A 栋 104 空调滴水',
    building: 'A',
    roomNumber: '104',
    equipmentCode: 'EQ-A-001',
    faultType: 'hvac',
    priority: 'normal',
    description: '空调出风口滴水。',
    contactName: '刘洋',
    contactPhone: '13800000001',
    status: 'completed',
    reporter: 'resident.liu',
    assignee: 'tech.wang',
    createdDaysAgo: 12,
    dueInDays: -8,
    faultCause: '冷凝水排水管堵塞',
    repairProcess: '疏通排水管并清洗接水盘。',
    laborCost: 80,
    acceptResult: 'passed',
    acceptanceRemark: '现场确认不再滴水。',
  },
  {
    ticketNo: 'RP-0011',
    title: 'B 栋 201 网络面板损坏',
    building: 'B',
    roomNumber: '201',
    equipmentCode: 'EQ-B-001',
    faultType: 'network',
    priority: 'normal',
    description: '墙面网络面板松动无法联网。',
    contactName: '孙倩',
    contactPhone: '13800000002',
    status: 'completed',
    reporter: 'resident.sun',
    assignee: 'tech.zhao',
    createdDaysAgo: 15,
    dueInDays: -12,
    faultCause: '面板卡扣断裂',
    repairProcess: '更换双口网络面板并重新打线测试。',
    laborCost: 60,
    acceptResult: 'passed',
    acceptanceRemark: '网络恢复正常。',
  },
  {
    ticketNo: 'RP-0012',
    title: 'C 栋 302 墙面渗水',
    building: 'C',
    roomNumber: '302',
    faultType: 'other',
    priority: 'low',
    description: '墙面出现水渍，疑似外墙渗漏。',
    contactName: '员工餐厅',
    contactPhone: '13800000006',
    status: 'cancelled',
    reporter: 'resident.sun',
    createdDaysAgo: 7,
    cancelReason: '经核实为楼上装修渗水，由装修单位处理。',
  },
];

const ATTACHMENTS: readonly {
  readonly ticketNo: string;
  readonly sample: keyof typeof SAMPLE_FILE_BY_NAME;
  readonly category: string;
  readonly note?: string;
}[] = [
  {
    ticketNo: 'RP-0001',
    sample: 'beforePhoto',
    category: 'fault',
    note: '报修时拍摄的现场照片',
  },
  {
    ticketNo: 'RP-0002',
    sample: 'afterPhoto',
    category: 'fault',
    note: '现场照片（另一角度）',
  },
  {
    ticketNo: 'RP-0007',
    sample: 'archive',
    category: 'report',
    note: '历史归档包（浏览器不支持在线预览）',
  },
  {
    ticketNo: 'RP-0009',
    sample: 'beforePhoto',
    category: 'before',
    note: '维修前：门滑轨',
  },
  {
    ticketNo: 'RP-0009',
    sample: 'afterPhoto',
    category: 'after',
    note: '维修后：门滑轨',
  },
  {
    ticketNo: 'RP-0009',
    sample: 'report',
    category: 'report',
    note: '三页检测报告',
  },
  {
    ticketNo: 'RP-0009',
    sample: 'text',
    category: 'report',
    note: '设备说明样例（中文 TXT）',
  },
  {
    ticketNo: 'RP-0010',
    sample: 'beforePhoto',
    category: 'before',
    note: '维修前：出风口滴水',
  },
  {
    ticketNo: 'RP-0010',
    sample: 'afterPhoto',
    category: 'after',
    note: '维修后：出风口',
  },
  {
    ticketNo: 'RP-0010',
    sample: 'report',
    category: 'report',
    note: '维修检测报告',
  },
  {
    ticketNo: 'RP-0011',
    sample: 'csv',
    category: 'receipt',
    note: '材料费用明细',
  },
  {
    ticketNo: 'RP-0011',
    sample: 'report',
    category: 'report',
    note: '维修检测报告',
  },
];

const USAGES: readonly {
  readonly ticketNo: string;
  readonly materialCode: string;
  readonly quantity: number;
  readonly status: 'consumed' | 'returned';
  readonly remark?: string;
}[] = [
  {
    ticketNo: 'RP-0006',
    materialCode: 'M-001',
    quantity: 4,
    status: 'consumed',
    remark: '更换漏水主管段',
  },
  {
    ticketNo: 'RP-0007',
    materialCode: 'M-005',
    quantity: 1,
    status: 'consumed',
    remark: '更换水泵密封件',
  },
  {
    ticketNo: 'RP-0009',
    materialCode: 'M-002',
    quantity: 2,
    status: 'consumed',
    remark: '门机密封',
  },
  {
    ticketNo: 'RP-0009',
    materialCode: 'M-002',
    quantity: 1,
    status: 'returned',
    remark: '多领用，已退库',
  },
  {
    ticketNo: 'RP-0010',
    materialCode: 'M-003',
    quantity: 3,
    status: 'consumed',
    remark: '更换照明灯管',
  },
  {
    ticketNo: 'RP-0011',
    materialCode: 'M-004',
    quantity: 2,
    status: 'consumed',
    remark: '更换网络面板',
  },
];

const SETTLED_TICKET = 'RP-0011';

export const REPAIR_DEMO_ACCOUNTS: readonly {
  readonly username: string;
  readonly role: string;
}[] = USERS.map((user) => ({
  username: user.username,
  role: user.role,
}));

const seed: SeedDefinition = defineSeed({
  name: '202609200002_seed_property_repair_demo',

  async run({ query }) {
    const now = new Date();
    const at = (days: number, hour = 9): Date => {
      const date = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      date.setUTCHours(hour, 0, 0, 0);
      return date;
    };

    // ---- Accounts ------------------------------------------------------
    const userIds = new Map<string, string>();
    for (const user of USERS) {
      const existing = (await query
        .selectFrom('user')
        .select(['id'])
        .where('username', '=', user.username)
        .executeTakeFirst()) as { id: string } | undefined;
      let userId: string;
      if (existing) {
        userId = existing.id;
      } else {
        userId = crypto.randomUUID();
        await query
          .insertInto('user')
          .values({
            id: userId,
            name: user.displayName,
            username: user.username,
            email: user.email,
            emailVerified: true,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        await query
          .insertInto('account')
          .values({
            id: crypto.randomUUID(),
            issuer: 'local:credential',
            accountId: userId,
            providerId: 'credential',
            userId,
            password: await hashPassword(DEMO_PASSWORD),
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }
      userIds.set(user.username, userId);
      const membership = (await query
        .selectFrom('repairMembers')
        .select(['id'])
        .where('userId', '=', userId)
        .executeTakeFirst()) as { id: number } | undefined;
      if (!membership) {
        await query
          .insertInto('repairMembers')
          .values({
            userId,
            role: user.role,
            displayName: user.displayName,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      } else {
        await query
          .updateTable('repairMembers')
          .set({
            role: user.role,
            displayName: user.displayName,
            updatedAt: now,
          })
          .where('id', '=', membership.id)
          .execute();
      }
    }

    // ---- Buildings, rooms, equipment ----------------------------------
    const displayNameOf = new Map(
      USERS.map((user) => [user.username, user.displayName]),
    );
    const ticketAssignee = new Map(
      TICKETS.map((ticket) => [ticket.ticketNo, ticket.assignee]),
    );
    const buildingIds = new Map<string, number>();
    for (const building of BUILDINGS) {
      const existing = (await query
        .selectFrom('buildings')
        .select(['id'])
        .where('code', '=', building.code)
        .executeTakeFirst()) as { id: number } | undefined;
      if (existing) {
        buildingIds.set(building.code, existing.id);
        continue;
      }
      const inserted = await query
        .insertInto('buildings')
        .values({ ...building, remark: null, createdAt: now, updatedAt: now })
        .execute();
      buildingIds.set(building.code, Number(inserted.insertId));
    }

    const roomIds = new Map<string, number>();
    for (const room of ROOMS) {
      const buildingId = buildingIds.get(room.building);
      if (!buildingId) continue;
      const existing = (await query
        .selectFrom('rooms')
        .select(['id'])
        .where('buildingId', '=', buildingId)
        .where('roomNumber', '=', room.roomNumber)
        .executeTakeFirst()) as { id: number } | undefined;
      if (existing) {
        roomIds.set(`${room.building}:${room.roomNumber}`, existing.id);
        continue;
      }
      const inserted = await query
        .insertInto('rooms')
        .values({
          buildingId,
          roomNumber: room.roomNumber,
          floor: room.floor,
          area: room.area,
          occupant: room.occupant,
          phone: room.phone,
          usageType: room.usageType,
          remark: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      roomIds.set(
        `${room.building}:${room.roomNumber}`,
        Number(inserted.insertId),
      );
    }

    const equipmentIds = new Map<string, number>();
    for (const equipment of EQUIPMENT) {
      const buildingId = buildingIds.get(equipment.building) ?? null;
      const roomId =
        roomIds.get(`${equipment.building}:${equipment.roomNumber}`) ?? null;
      const existing = (await query
        .selectFrom('equipment')
        .select(['id'])
        .where('code', '=', equipment.code)
        .executeTakeFirst()) as { id: number } | undefined;
      const manualFileId = equipment.manual
        ? SAMPLE_FILE_BY_NAME.report.id
        : null;
      if (existing) {
        equipmentIds.set(equipment.code, existing.id);
        continue;
      }
      const inserted = await query
        .insertInto('equipment')
        .values({
          buildingId,
          roomId,
          code: equipment.code,
          name: equipment.name,
          category: equipment.category,
          brand: equipment.brand,
          model: equipment.model,
          serialNumber: `${equipment.code}-SN`,
          installedAt: at(-400),
          status: equipment.status,
          manualNote: manualFileId ? '随设备附带的说明书与检测报告' : null,
          manualFileId,
          remark: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      equipmentIds.set(equipment.code, Number(inserted.insertId));
    }

    // ---- Materials -----------------------------------------------------
    const materialIds = new Map<string, number>();
    const materialStock = new Map<string, number>();
    for (const material of MATERIALS) {
      const existing = (await query
        .selectFrom('materials')
        .select(['id'])
        .where('code', '=', material.code)
        .executeTakeFirst()) as { id: number } | undefined;
      if (existing) {
        materialIds.set(material.code, existing.id);
      } else {
        const inserted = await query
          .insertInto('materials')
          .values({ ...material, remark: null, createdAt: now, updatedAt: now })
          .execute();
        materialIds.set(material.code, Number(inserted.insertId));
      }
      materialStock.set(material.code, material.stock);
    }

    // ---- Sample file records (the provider writes the bytes) ------------
    for (const file of REPAIR_SAMPLE_FILE_METADATA) {
      const existing = (await query
        .selectFrom('repairFiles')
        .select(['id'])
        .where('id', '=', file.id)
        .executeTakeFirst()) as { id: string } | undefined;
      if (existing) continue;
      await query
        .insertInto('repairFiles')
        .values({
          id: file.id,
          disk: 'local',
          key: file.key,
          filename: file.filename,
          ext: file.ext,
          mimeType: file.mimeType,
          size: file.size,
          uploadedById: userIds.get('supervisor') ?? null,
          uploadedByName: '物业主管 陈静',
          note: '演示样例文件',
          createdAt: at(-30),
          updatedAt: at(-30),
        })
        .execute();
    }

    // ---- Tickets -------------------------------------------------------
    const ticketIds = new Map<string, number>();
    for (const ticket of TICKETS) {
      const existing = (await query
        .selectFrom('repairTickets')
        .select(['id'])
        .where('ticketNo', '=', ticket.ticketNo)
        .executeTakeFirst()) as { id: number } | undefined;
      let ticketId: number;
      if (existing) {
        ticketId = existing.id;
      } else {
        const building = BUILDINGS.find(
          (item) => item.code === ticket.building,
        );
        const buildingId = buildingIds.get(ticket.building);
        if (!buildingId) continue;
        const roomId =
          roomIds.get(`${ticket.building}:${ticket.roomNumber}`) ?? null;
        const equipmentId = ticket.equipmentCode
          ? (equipmentIds.get(ticket.equipmentCode) ?? null)
          : null;
        const reporterId = userIds.get(ticket.reporter);
        const assigneeId = ticket.assignee
          ? userIds.get(ticket.assignee)
          : undefined;
        const createdAt = at(-ticket.createdDaysAgo);
        const status = ticket.status;
        const assigned =
          status !== 'pending_dispatch' && status !== 'cancelled';
        const started = [
          'in_progress',
          'pending_acceptance',
          'completed',
          'rework',
        ].includes(status);
        const finished = ['pending_acceptance', 'completed'].includes(status);
        const accepted = status === 'completed';
        const completedAt = accepted
          ? at(-Math.max(1, ticket.createdDaysAgo - 2))
          : null;
        const inserted = await query
          .insertInto('repairTickets')
          .values({
            ticketNo: ticket.ticketNo,
            title: ticket.title,
            buildingId,
            roomId,
            equipmentId,
            location: `${building?.name ?? ticket.building} ${ticket.roomNumber}`,
            faultType: ticket.faultType,
            priority: ticket.priority,
            description: ticket.description,
            contactName: ticket.contactName,
            contactPhone: ticket.contactPhone,
            status,
            reporterId: reporterId ?? '',
            reporterName: displayNameOf.get(ticket.reporter) ?? null,
            assigneeId: assigned ? (assigneeId ?? null) : null,
            assigneeName: assigned
              ? ticket.assignee
                ? (displayNameOf.get(ticket.assignee) ?? null)
                : null
              : null,
            assignedAt: assigned ? at(-ticket.createdDaysAgo + 2, 10) : null,
            dueAt:
              ticket.dueInDays === undefined ? null : at(ticket.dueInDays, 18),
            startedAt: started ? at(-ticket.createdDaysAgo + 3, 9) : null,
            finishedAt: finished ? at(-ticket.createdDaysAgo + 4, 16) : null,
            faultCause: ticket.faultCause ?? null,
            repairProcess: ticket.repairProcess ?? null,
            laborCost: ticket.laborCost ?? 0,
            reworkCount: ticket.reworkCount ?? 0,
            cancelReason: ticket.cancelReason ?? null,
            acceptanceResult: ticket.acceptResult ?? null,
            acceptanceRemark: ticket.acceptanceRemark ?? null,
            acceptedAt: accepted ? completedAt : null,
            completedAt,
            settledAt: null,
            createdAt,
            updatedAt: now,
          })
          .execute();
        ticketId = Number(inserted.insertId);
        await query
          .insertInto('repairTicketEvents')
          .values({
            ticketId,
            type: 'created',
            fromStatus: null,
            toStatus: 'pending_dispatch',
            remark: null,
            operatorId: reporterId ?? null,
            operatorName: displayNameOf.get(ticket.reporter) ?? null,
            createdAt,
          })
          .execute();
      }
      ticketIds.set(ticket.ticketNo, ticketId);
    }

    // ---- Attachments ---------------------------------------------------
    for (const attachment of ATTACHMENTS) {
      const ticketId = ticketIds.get(attachment.ticketNo);
      if (!ticketId) continue;
      const file = SAMPLE_FILE_BY_NAME[attachment.sample];
      const existing = (await query
        .selectFrom('repairTicketFiles')
        .select(['id'])
        .where('ticketId', '=', ticketId)
        .where('fileId', '=', file.id)
        .executeTakeFirst()) as { id: number } | undefined;
      if (existing) continue;
      await query
        .insertInto('repairTicketFiles')
        .values({
          ticketId,
          fileId: file.id,
          category: attachment.category,
          note: attachment.note ?? null,
          createdById: userIds.get('supervisor') ?? null,
          createdByName: '物业主管 陈静',
          createdAt: at(-8),
        })
        .execute();
    }

    // ---- Material consumption and the stock ledger ---------------------
    for (const usage of USAGES) {
      const ticketId = ticketIds.get(usage.ticketNo);
      const materialId = materialIds.get(usage.materialCode);
      if (!ticketId || !materialId) continue;
      const existing = (await query
        .selectFrom('repairTicketMaterials')
        .select(['id'])
        .where('ticketId', '=', ticketId)
        .where('materialId', '=', materialId)
        .where('status', '=', usage.status)
        .executeTakeFirst()) as { id: number } | undefined;
      if (existing) continue;
      const material = MATERIALS.find(
        (item) => item.code === usage.materialCode,
      );
      if (!material) continue;
      const previous = materialStock.get(material.code) ?? material.stock;
      const nextStock =
        usage.status === 'consumed' ? previous - usage.quantity : previous;
      materialStock.set(material.code, nextStock);
      if (usage.status === 'consumed') {
        await query
          .updateTable('materials')
          .set({ stock: nextStock, updatedAt: now })
          .where('id', '=', materialId)
          .execute();
      }
      const inserted = await query
        .insertInto('repairTicketMaterials')
        .values({
          ticketId,
          materialId,
          quantity: usage.quantity,
          unitPrice: material.unitPrice,
          cost: Math.round(usage.quantity * material.unitPrice * 100) / 100,
          status: usage.status,
          requestedByName:
            displayNameOf.get(ticketAssignee.get(usage.ticketNo) ?? '') ?? null,
          remark: usage.remark ?? null,
          returnedAt: usage.status === 'returned' ? at(-2) : null,
          createdAt: at(-6),
          updatedAt: now,
        })
        .execute();
      await query
        .insertInto('repairMaterialTransactions')
        .values({
          materialId,
          type: usage.status === 'returned' ? 'return' : 'out',
          quantity: usage.quantity,
          stockAfter: nextStock,
          ticketId,
          ticketMaterialId: Number(inserted.insertId),
          operatorName:
            displayNameOf.get(ticketAssignee.get(usage.ticketNo) ?? '') ?? null,
          remark: usage.remark ?? null,
          createdAt: at(-6),
        })
        .execute();
    }

    // ---- Settlement ----------------------------------------------------
    const settledTicketId = ticketIds.get(SETTLED_TICKET);
    if (settledTicketId) {
      const existing = (await query
        .selectFrom('repairSettlements')
        .select(['id'])
        .where('ticketId', '=', settledTicketId)
        .executeTakeFirst()) as { id: number } | undefined;
      if (!existing) {
        const ticket = (await query
          .selectFrom('repairTickets')
          .select(['ticketNo', 'laborCost'])
          .where('id', '=', settledTicketId)
          .executeTakeFirst()) as
          { ticketNo: string; laborCost: unknown } | undefined;
        const usages = (await query
          .selectFrom('repairTicketMaterials')
          .select(['cost', 'status'])
          .where('ticketId', '=', settledTicketId)
          .execute()) as { cost: unknown; status: string }[];
        const materialCost =
          Math.round(
            usages
              .filter((row) => row.status !== 'returned')
              .reduce((total, row) => total + Number(row.cost ?? 0), 0) * 100,
          ) / 100;
        const laborCost = Number(ticket?.laborCost ?? 0);
        const settledAt = at(-3);
        await query
          .insertInto('repairSettlements')
          .values({
            settlementNo: `ST-${ticket?.ticketNo ?? SETTLED_TICKET}`,
            ticketId: settledTicketId,
            materialCost,
            laborCost,
            totalAmount: Math.round((materialCost + laborCost) * 100) / 100,
            status: 'settled',
            settledById: userIds.get('finance') ?? 0,
            settledByName: '财务 周敏',
            remark: '已核对材料明细，付款完成。',
            settledAt,
            createdAt: settledAt,
            updatedAt: settledAt,
          })
          .execute();
        await query
          .updateTable('repairTickets')
          .set({ settledAt, updatedAt: now })
          .where('id', '=', settledTicketId)
          .execute();
        await query
          .insertInto('repairTicketEvents')
          .values({
            ticketId: settledTicketId,
            type: 'settled',
            fromStatus: 'completed',
            toStatus: 'completed',
            remark: '已核对材料明细，付款完成。',
            operatorId: userIds.get('finance') ?? null,
            operatorName: '财务 周敏',
            createdAt: settledAt,
          })
          .execute();
      }
    }
  },
});

export default seed;
