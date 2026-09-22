import {
  defineSeed,
  type QueryAdapter,
  type Row,
  type SeedDefinition,
} from '@nocobase/db';
import { hashPassword } from 'better-auth/crypto';

/**
 * Sample business data and per-role logins for the equipment after-sales
 * service module.
 *
 * The seed is idempotent: every row is inserted only when its unique business
 * key is absent, and identifying values (ticket numbers, codes, dates) are
 * fixed so a rerun on any machine produces the same records. Passwords are
 * hashed with the same `better-auth` helper the sign-in flow verifies against.
 */

const PASSWORD = 'Service@2026';
const BASE = new Date('2026-09-01T01:00:00.000Z');

function at(dayOffset: number, hourOffset = 0): Date {
  return new Date(BASE.getTime() + dayOffset * 86400000 + hourOffset * 3600000);
}

interface SeedUser {
  id: string;
  username: string;
  name: string;
  email: string;
  region: string;
  teamName?: string;
  permissionSet: string;
}

const USERS: readonly SeedUser[] = [
  {
    id: 'svc-admin',
    username: 'svc-admin',
    name: '王莉 / Wang Li',
    email: 'svc.admin@example.com',
    region: 'none',
    permissionSet: 'root',
  },
  {
    id: 'svc-manager',
    username: 'svc-manager',
    name: '陈刚 / Chen Gang',
    email: 'svc.manager@example.com',
    region: 'none',
    permissionSet: 'service-manager',
  },
  {
    id: 'svc-east',
    username: 'svc-east',
    name: '李明 / Li Ming',
    email: 'svc.east@example.com',
    region: 'east',
    teamName: '华东服务组',
    permissionSet: 'service-engineer',
  },
  {
    id: 'svc-east2',
    username: 'svc-east2',
    name: '周洁 / Zhou Jie',
    email: 'svc.east2@example.com',
    region: 'east',
    teamName: '华东服务组',
    permissionSet: 'service-engineer',
  },
  {
    id: 'svc-south',
    username: 'svc-south',
    name: '张伟 / Zhang Wei',
    email: 'svc.south@example.com',
    region: 'south',
    teamName: '华南服务组',
    permissionSet: 'service-engineer',
  },
  {
    id: 'svc-south2',
    username: 'svc-south2',
    name: '刘洋 / Liu Yang',
    email: 'svc.south2@example.com',
    region: 'south',
    teamName: '华南服务组',
    permissionSet: 'service-engineer',
  },
  {
    id: 'svc-collab',
    username: 'svc-collab',
    name: '赵鹏 / Zhao Peng',
    email: 'svc.collab@example.com',
    region: 'none',
    teamName: '跨区域协作组',
    permissionSet: 'service-collaborator',
  },
  {
    id: 'svc-observer',
    username: 'svc-observer',
    name: '孙敏 / Sun Min',
    email: 'svc.observer@example.com',
    region: 'none',
    teamName: '运营观察',
    permissionSet: 'service-observer',
  },
  {
    id: 'svc-integration',
    username: 'svc-integration',
    name: '设备平台集成账号 / Device Platform',
    email: 'svc.integration@example.com',
    region: 'none',
    teamName: '外部系统',
    permissionSet: 'service-integration',
  },
];

interface SeedCustomer {
  name: string;
  contactName: string;
  contactPhone: string;
  region: string;
  address: string;
}

const CUSTOMERS: readonly SeedCustomer[] = [
  {
    name: '上海精工机械制造有限公司',
    contactName: '徐工',
    contactPhone: '021-58880001',
    region: 'east',
    address: '上海市浦东新区金桥路 168 号',
  },
  {
    name: '杭州恒力电子科技有限公司',
    contactName: '王主任',
    contactPhone: '0571-86660002',
    region: 'east',
    address: '杭州市滨江区江陵路 88 号',
  },
  {
    name: '苏州东越自动化设备有限公司',
    contactName: '李经理',
    contactPhone: '0512-68880003',
    region: 'east',
    address: '苏州市工业园区星湖街 328 号',
  },
  {
    name: '广州南方智造装备有限公司',
    contactName: '陈厂长',
    contactPhone: '020-38880004',
    region: 'south',
    address: '广州市黄埔区科学大道 99 号',
  },
  {
    name: '深圳前海精密仪器有限公司',
    contactName: '林工',
    contactPhone: '0755-88880005',
    region: 'south',
    address: '深圳市南山区前海路 66 号',
  },
  {
    name: '东莞华南电子装备有限公司',
    contactName: '吴主管',
    contactPhone: '0769-88880006',
    region: 'south',
    address: '东莞市松山湖园区工业大道 12 号',
  },
];

interface SeedDevice {
  code: string;
  name: string;
  customerName: string;
  region: string;
  category: string;
  model: string;
  serialNumber: string;
  ownerId: string;
}

const DEVICES: readonly SeedDevice[] = [
  {
    code: 'CN-0001',
    name: '数控加工中心',
    customerName: CUSTOMERS[0].name,
    region: 'east',
    category: '数控机床',
    model: 'VMC-850',
    serialNumber: 'SN-2024-000101',
    ownerId: 'svc-east',
  },
  {
    code: 'CN-0002',
    name: '注塑成型机',
    customerName: CUSTOMERS[0].name,
    region: 'east',
    category: '注塑机',
    model: 'IMM-260',
    serialNumber: 'SN-2024-000102',
    ownerId: 'svc-east',
  },
  {
    code: 'CN-0003',
    name: '光纤激光切割机',
    customerName: CUSTOMERS[1].name,
    region: 'east',
    category: '激光切割机',
    model: 'LC-3015',
    serialNumber: 'SN-2024-000103',
    ownerId: 'svc-east2',
  },
  {
    code: 'CN-0004',
    name: '焊接机器人',
    customerName: CUSTOMERS[1].name,
    region: 'east',
    category: '焊接机器人',
    model: 'WR-2000',
    serialNumber: 'SN-2024-000104',
    ownerId: 'svc-east2',
  },
  {
    code: 'CN-0005',
    name: '三坐标测量仪',
    customerName: CUSTOMERS[2].name,
    region: 'east',
    category: '三坐标检测仪',
    model: 'CMM-500',
    serialNumber: 'SN-2024-000105',
    ownerId: 'svc-east',
  },
  {
    code: 'CN-0006',
    name: '螺杆式空压机',
    customerName: CUSTOMERS[2].name,
    region: 'east',
    category: '空压机',
    model: 'AC-75',
    serialNumber: 'SN-2024-000106',
    ownerId: 'svc-east2',
  },
  {
    code: 'CN-0007',
    name: '数控车床',
    customerName: CUSTOMERS[3].name,
    region: 'south',
    category: '数控机床',
    model: 'CK-6150',
    serialNumber: 'SN-2024-000107',
    ownerId: 'svc-south',
  },
  {
    code: 'CN-0008',
    name: '伺服注塑机',
    customerName: CUSTOMERS[3].name,
    region: 'south',
    category: '注塑机',
    model: 'IMM-320',
    serialNumber: 'SN-2024-000108',
    ownerId: 'svc-south',
  },
  {
    code: 'CN-0009',
    name: '激光打标机',
    customerName: CUSTOMERS[4].name,
    region: 'south',
    category: '激光切割机',
    model: 'LM-20',
    serialNumber: 'SN-2024-000109',
    ownerId: 'svc-south2',
  },
  {
    code: 'CN-0010',
    name: '六轴焊接机器人',
    customerName: CUSTOMERS[4].name,
    region: 'south',
    category: '焊接机器人',
    model: 'WR-3000',
    serialNumber: 'SN-2024-000110',
    ownerId: 'svc-south2',
  },
  {
    code: 'CN-0011',
    name: '影像测量仪',
    customerName: CUSTOMERS[5].name,
    region: 'south',
    category: '三坐标检测仪',
    model: 'VMM-300',
    serialNumber: 'SN-2024-000111',
    ownerId: 'svc-south',
  },
  {
    code: 'CN-0012',
    name: '无油空压机',
    customerName: CUSTOMERS[5].name,
    region: 'south',
    category: '空压机',
    model: 'OAC-55',
    serialNumber: 'SN-2024-000112',
    ownerId: 'svc-south2',
  },
];

interface SeedTicket {
  seq: number;
  deviceCode: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  assigneeId?: string;
  confidential?: boolean;
  reporterId: string;
  reporterName: string;
  source?: string;
  externalEventId?: string;
  processNotes?: string;
  resolution?: string;
  laborHours?: number;
  day: number;
}

const TICKETS: readonly SeedTicket[] = [
  {
    seq: 1,
    deviceCode: 'CN-0001',
    title: '数控加工中心主轴异响',
    description: '加工过程中主轴出现周期性异响，转速 8000rpm 以上明显。',
    priority: 'high',
    status: 'in_progress',
    assigneeId: 'svc-east',
    reporterId: 'svc-manager',
    reporterName: '陈刚 / Chen Gang',
    processNotes: '已更换主轴前轴承，待运行 4 小时观察温升。',
    laborHours: 3.5,
    day: 12,
  },
  {
    seq: 2,
    deviceCode: 'CN-0002',
    title: '注塑机液压油温过高',
    description: '连续生产 2 小时后油温超过 65℃，触发报警。',
    priority: 'normal',
    status: 'pending_dispatch',
    reporterId: 'svc-manager',
    reporterName: '陈刚 / Chen Gang',
    day: 13,
  },
  {
    seq: 3,
    deviceCode: 'CN-0003',
    title: '激光切割机切割精度下降',
    description: '切割 5mm 碳钢板时边缘出现挂渣，尺寸偏差 0.15mm。',
    priority: 'high',
    status: 'pending_confirmation',
    assigneeId: 'svc-east2',
    reporterId: 'svc-east',
    reporterName: '李明 / Li Ming',
    processNotes: '更换保护镜片并重新标定焦点，试切合格。',
    laborHours: 3,
    day: 10,
  },
  {
    seq: 4,
    deviceCode: 'CN-0004',
    title: '焊接机器人送丝不稳',
    description: '焊接过程中送丝速度波动，焊缝出现气孔。',
    priority: 'normal',
    status: 'closed',
    assigneeId: 'svc-east',
    reporterId: 'svc-east2',
    reporterName: '周洁 / Zhou Jie',
    resolution: '更换送丝软管与导电嘴，焊接参数复检合格。',
    laborHours: 2,
    day: 6,
  },
  {
    seq: 5,
    deviceCode: 'CN-0005',
    title: '三坐标测量仪测头校准异常',
    description: '标准球校准结果超出公差，重复性差。',
    priority: 'normal',
    status: 'draft',
    reporterId: 'svc-east2',
    reporterName: '周洁 / Zhou Jie',
    day: 14,
  },
  {
    seq: 6,
    deviceCode: 'CN-0006',
    title: '空压机频繁跳停',
    description: '加载运行约 5 分钟后过载保护跳停。',
    priority: 'low',
    status: 'cancelled',
    reporterId: 'svc-manager',
    reporterName: '陈刚 / Chen Gang',
    day: 8,
  },
  {
    seq: 7,
    deviceCode: 'CN-0007',
    title: '数控车床刀塔换刀卡滞',
    description: '换刀时刀塔定位缓慢，偶发报警 2021。',
    priority: 'high',
    status: 'in_progress',
    assigneeId: 'svc-south',
    reporterId: 'svc-manager',
    reporterName: '陈刚 / Chen Gang',
    processNotes: '清理刀塔定位销并调整液压压力至 4.5MPa。',
    laborHours: 2.5,
    day: 11,
  },
  {
    seq: 8,
    deviceCode: 'CN-0008',
    title: '伺服注塑机产品飞边严重',
    description: '锁模力不足导致制品边缘飞边，良率下降。',
    priority: 'high',
    status: 'pending_dispatch',
    reporterId: 'svc-manager',
    reporterName: '陈刚 / Chen Gang',
    day: 13,
  },
  {
    seq: 9,
    deviceCode: 'CN-0009',
    title: '激光打标机打标深浅不一',
    description: '同一批次工件打标颜色深浅差异明显。',
    priority: 'normal',
    status: 'pending_confirmation',
    assigneeId: 'svc-south2',
    reporterId: 'svc-south',
    reporterName: '张伟 / Zhang Wei',
    processNotes: '清洁场镜并重新标定功率曲线。',
    laborHours: 1.5,
    day: 9,
  },
  {
    seq: 10,
    deviceCode: 'CN-0010',
    title: '六轴焊接机器人关节异响',
    description: 'J3 关节在高速运动时出现金属摩擦声。',
    priority: 'high',
    status: 'closed',
    assigneeId: 'svc-south2',
    reporterId: 'svc-south',
    reporterName: '张伟 / Zhang Wei',
    resolution: '补充减速机润滑脂并更换密封圈，异响消除。',
    laborHours: 4,
    day: 5,
  },
  {
    seq: 11,
    deviceCode: 'CN-0011',
    title: '影像测量仪光源亮度不足',
    description: '同轴光源亮度衰减，图像边缘识别不稳定。',
    priority: 'normal',
    status: 'in_progress',
    assigneeId: 'svc-south',
    reporterId: 'svc-observer',
    reporterName: '孙敏 / Sun Min',
    processNotes: '已订购同轴光源模组，预计两日内更换。',
    laborHours: 1,
    day: 12,
  },
  {
    seq: 12,
    deviceCode: 'CN-0012',
    title: '无油空压机排气压力不足',
    description: '额定排气压力只能达到 0.6MPa。',
    priority: 'normal',
    status: 'draft',
    reporterId: 'svc-south2',
    reporterName: '刘洋 / Liu Yang',
    day: 15,
  },
  {
    seq: 13,
    deviceCode: 'CN-0001',
    title: '设备联网数据采集中断',
    description: '设备平台连续 30 分钟未上报运行数据，需现场核查网关。',
    priority: 'urgent',
    status: 'in_progress',
    assigneeId: 'svc-east',
    confidential: true,
    reporterId: 'svc-integration',
    reporterName: '王莉 / Wang Li',
    source: 'integration',
    externalEventId: 'EXT-20260910-0001',
    processNotes: '网关供电正常，正在检查工业交换机端口。',
    day: 13,
  },
  {
    seq: 14,
    deviceCode: 'CN-0003',
    title: '变频器报警 F0022',
    description: '切割机变频器报过流故障，复位后仍会复现。',
    priority: 'urgent',
    status: 'pending_dispatch',
    reporterId: 'svc-east',
    reporterName: '李明 / Li Ming',
    day: 14,
  },
  {
    seq: 15,
    deviceCode: 'CN-0008',
    title: '冷却水回路堵塞',
    description: '模具冷却水流量下降，成型周期变长。',
    priority: 'normal',
    status: 'pending_confirmation',
    assigneeId: 'svc-south',
    reporterId: 'svc-manager',
    reporterName: '陈刚 / Chen Gang',
    processNotes: '反向冲洗冷却水路并更换过滤器滤芯。',
    laborHours: 2.5,
    day: 10,
  },
  {
    seq: 16,
    deviceCode: 'CN-0012',
    title: '电机轴承磨损',
    description: '空压机电机运行噪声增大，振动值超标。',
    priority: 'normal',
    status: 'closed',
    assigneeId: 'svc-south2',
    reporterId: 'svc-south',
    reporterName: '张伟 / Zhang Wei',
    resolution: '更换电机前后轴承，振动值恢复至 2.1mm/s。',
    laborHours: 3,
    day: 4,
  },
  {
    seq: 17,
    deviceCode: 'CN-0005',
    title: '控制柜散热风扇故障',
    description: '控制柜内温度偏高，散热风扇不转。',
    priority: 'normal',
    status: 'in_progress',
    assigneeId: 'svc-collab',
    reporterId: 'svc-east',
    reporterName: '李明 / Li Ming',
    processNotes: '跨区域协作处理，已更换风扇并测试风道。',
    laborHours: 1.5,
    day: 11,
  },
  {
    seq: 18,
    deviceCode: 'CN-0009',
    title: '伺服驱动器通讯超时',
    description: '打标机运行中偶发通讯超时报警，需排查通讯线缆。',
    priority: 'high',
    status: 'pending_dispatch',
    reporterId: 'svc-manager',
    reporterName: '陈刚 / Chen Gang',
    day: 15,
  },
];

const KNOWLEDGE: readonly {
  title: string;
  category: string;
  summary: string;
  body: string;
  authorId: string;
}[] = [
  {
    title: '数控机床主轴异响诊断与处理',
    category: '数控机床',
    summary: '从轴承、皮带、联轴器三个方向定位主轴异响，并给出更换标准。',
    body:
      '一、先区分异响随转速变化还是随进给变化。\n' +
      '二、随转速变化优先检查主轴前后轴承游隙与润滑脂状态。\n' +
      '三、拆检时记录轴承型号与预紧力，回装后做 4 小时温升观察。\n' +
      '四、温升稳定在 35℃ 以内、振动值低于 1.8mm/s 视为合格。',
    authorId: 'svc-east',
  },
  {
    title: '注塑机液压系统温度异常排查',
    category: '注塑机',
    summary: '液压油温过高的常见原因、冷却器检查方法与油品更换周期。',
    body:
      '一、检查冷却水进出水温差，正常应大于 5℃。\n' +
      '二、清洗板式冷却器，检查是否结垢堵塞。\n' +
      '三、检测溢流阀设定压力，避免长期高压溢流发热。\n' +
      '四、油温持续超过 65℃ 时更换 46# 抗磨液压油并检查油质。',
    authorId: 'svc-manager',
  },
  {
    title: '激光切割机切割质量调整',
    category: '激光切割机',
    summary: '针对挂渣、毛刺、尺寸偏差的焦点、功率与气压调整步骤。',
    body:
      '一、检查保护镜片是否污染，污染时先更换再调试。\n' +
      '二、焦点位置按板材厚度重新标定，碳钢常用负焦点。\n' +
      '三、切割气压不足会造成挂渣，按材料厚度匹配气压。\n' +
      '四、试切后测量尺寸，偏差超过 0.1mm 时检查导轨精度。',
    authorId: 'svc-east2',
  },
  {
    title: '焊接机器人送丝机构维护',
    category: '焊接机器人',
    summary: '送丝不稳的排查顺序：软管、导电嘴、送丝轮压力。',
    body:
      '一、检查送丝软管是否压扁或磨损，必要时更换。\n' +
      '二、导电嘴孔径磨损应更换同规格配件。\n' +
      '三、送丝轮压力过大会压扁焊丝，过小会打滑。\n' +
      '四、维护后空走焊丝，确认速度波动小于 3%。',
    authorId: 'svc-east',
  },
  {
    title: '三坐标测量仪测头校准流程',
    category: '三坐标检测仪',
    summary: '标准球校准、探针标定与重复性验证的标准操作。',
    body:
      '一、清洁标准球与探针，确认无油污与毛刺。\n' +
      '二、在软件中执行探针标定，每个探针至少采 5 点。\n' +
      '三、标准球校准偏差应小于 0.002mm。\n' +
      '四、重复测量同一点 10 次，重复性应小于 0.003mm。',
    authorId: 'svc-east2',
  },
  {
    title: '螺杆空压机压力异常处理',
    category: '空压机',
    summary: '排气压力不足与频繁跳停的原因判断及处理。',
    body:
      '一、检查空气滤芯与油分芯是否堵塞。\n' +
      '二、检查进气阀与最小压力阀动作是否正常。\n' +
      '三、频繁跳停时检查电机电流、接触器与过载保护设定。\n' +
      '四、维修后运行 30 分钟，确认压力稳定在额定值 ±0.05MPa。',
    authorId: 'svc-south',
  },
];

const INSPECTION_DATES = ['2026-09-21', '2026-09-22'] as const;

async function ensure(
  query: QueryAdapter,
  table: string,
  match: Record<string, unknown>,
  values: Record<string, unknown>,
): Promise<Row> {
  let existingQuery = query.selectFrom(table).selectAll();
  for (const [key, value] of Object.entries(match)) {
    existingQuery =
      value === null
        ? existingQuery.where(key, 'is', null)
        : existingQuery.where(key, '=', value as never);
  }
  const existing = await existingQuery.executeTakeFirst();
  if (existing) return existing;
  await query.insertInto(table).values(values).execute();
  let createdQuery = query.selectFrom(table).selectAll();
  for (const [key, value] of Object.entries(match)) {
    createdQuery =
      value === null
        ? createdQuery.where(key, 'is', null)
        : createdQuery.where(key, '=', value as never);
  }
  const created = await createdQuery.executeTakeFirst();
  if (!created) throw new Error(`Seed could not read back ${table}`);
  return created;
}

const seed: SeedDefinition = defineSeed({
  name: '202609220202_seed_service_sample_data',

  async run({ query }) {
    const now = new Date();
    const password = await hashPassword(PASSWORD);

    // Accounts and role assignments -----------------------------------------
    for (const user of USERS) {
      await ensure(
        query,
        'user',
        { id: user.id },
        {
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        },
      );
      await ensure(
        query,
        'account',
        { userId: user.id, providerId: 'credential' },
        {
          id: crypto.randomUUID(),
          issuer: 'local:credential',
          accountId: user.id,
          providerId: 'credential',
          userId: user.id,
          password,
          createdAt: now,
          updatedAt: now,
        },
      );
      const assignmentId = `user:${user.id}:${user.permissionSet}`;
      await ensure(
        query,
        'authorizationPermissionSetAssignments',
        { id: assignmentId },
        {
          id: assignmentId,
          subjectType: 'user',
          subjectId: user.id,
          permissionSetKey: user.permissionSet,
          createdAt: now,
          updatedAt: now,
        },
      );
      await ensure(
        query,
        'serviceMembers',
        { userId: user.id },
        {
          userId: user.id,
          region: user.region,
          teamName: user.teamName ?? null,
          createdAt: now,
          updatedAt: now,
        },
      );
    }

    // Customers -------------------------------------------------------------
    for (const customer of CUSTOMERS) {
      await ensure(
        query,
        'serviceCustomers',
        { name: customer.name },
        {
          name: customer.name,
          contactName: customer.contactName,
          contactPhone: customer.contactPhone,
          region: customer.region,
          address: customer.address,
          status: 'active',
          createdAt: at(0),
          updatedAt: at(0),
        },
      );
    }

    // Devices ---------------------------------------------------------------
    for (const device of DEVICES) {
      const customer = await ensure(
        query,
        'serviceCustomers',
        { name: device.customerName },
        {
          name: device.customerName,
          region: device.region,
          status: 'active',
          createdAt: at(0),
          updatedAt: at(0),
        },
      );
      await ensure(
        query,
        'serviceDevices',
        { code: device.code },
        {
          code: device.code,
          name: device.name,
          customerId: Number(customer.id),
          region: device.region,
          category: device.category,
          model: device.model,
          serialNumber: device.serialNumber,
          ownerId: device.ownerId,
          enabled: true,
          purchasedAt: at(-300),
          createdAt: at(0),
          updatedAt: at(0),
        },
      );
    }

    // Tickets ---------------------------------------------------------------
    const deviceByCode = new Map<string, Row>();
    for (const device of DEVICES) {
      deviceByCode.set(
        device.code,
        await ensure(
          query,
          'serviceDevices',
          { code: device.code },
          { code: device.code },
        ),
      );
    }
    const ticketIds = new Map<number, number>();
    for (const ticket of TICKETS) {
      const device = deviceByCode.get(ticket.deviceCode);
      if (!device) throw new Error(`Unknown device code: ${ticket.deviceCode}`);
      const ticketNo = `SR20260901${String(ticket.seq).padStart(4, '0')}`;
      const submitted = ticket.status === 'draft' ? null : at(ticket.day, 2);
      const assigned =
        ticket.assigneeId && ticket.status !== 'pending_dispatch'
          ? at(ticket.day, 4)
          : null;
      const started =
        ticket.assigneeId &&
        ['in_progress', 'pending_confirmation', 'closed'].includes(
          ticket.status,
        )
          ? at(ticket.day, 5)
          : null;
      const closed = ticket.status === 'closed' ? at(ticket.day, 8) : null;
      const row = await ensure(
        query,
        'serviceTickets',
        { ticketNo },
        {
          ticketNo,
          customerId: Number(device.customerId),
          deviceId: Number(device.id),
          title: ticket.title,
          description: ticket.description,
          priority: ticket.priority,
          status: ticket.status,
          region: device.region,
          assigneeId: ticket.assigneeId ?? null,
          confidential: ticket.confidential ?? false,
          reporterId: ticket.reporterId,
          reporterName: ticket.reporterName,
          source: ticket.source ?? 'manual',
          externalEventId: ticket.externalEventId ?? null,
          processNotes: ticket.processNotes ?? null,
          resolution: ticket.resolution ?? null,
          laborHours: ticket.laborHours ?? null,
          dueAt: at(ticket.day, 24),
          submittedAt: submitted,
          assignedAt: assigned,
          startedAt: started,
          closedAt: closed,
          createdAt: at(ticket.day, 1),
          updatedAt: at(ticket.day, 9),
        },
      );
      ticketIds.set(ticket.seq, Number(row.id));
    }
    const ticketId = (seq: number): number => {
      const id = ticketIds.get(seq);
      if (!id) throw new Error(`Ticket ${seq} was not seeded`);
      return id;
    };

    // History for a representative slice of the workflow -------------------
    const logs: {
      seq: number;
      action: string;
      fromStatus?: string;
      toStatus?: string;
      operatorId: string;
      operatorName: string;
      note?: string;
      day: number;
    }[] = [
      {
        seq: 1,
        action: 'create',
        toStatus: 'pending_dispatch',
        operatorId: 'svc-manager',
        operatorName: '陈刚 / Chen Gang',
        day: 12,
      },
      {
        seq: 1,
        action: 'assign',
        fromStatus: 'pending_dispatch',
        toStatus: 'in_progress',
        operatorId: 'svc-manager',
        operatorName: '陈刚 / Chen Gang',
        note: '派发给华东李明',
        day: 12,
      },
      {
        seq: 1,
        action: 'process',
        fromStatus: 'in_progress',
        toStatus: 'in_progress',
        operatorId: 'svc-east',
        operatorName: '李明 / Li Ming',
        note: '更换主轴前轴承',
        day: 13,
      },
      {
        seq: 3,
        action: 'submit-confirmation',
        fromStatus: 'in_progress',
        toStatus: 'pending_confirmation',
        operatorId: 'svc-east2',
        operatorName: '周洁 / Zhou Jie',
        note: '更换保护镜片并标定焦点',
        day: 11,
      },
      {
        seq: 4,
        action: 'confirm',
        fromStatus: 'pending_confirmation',
        toStatus: 'closed',
        operatorId: 'svc-manager',
        operatorName: '陈刚 / Chen Gang',
        note: '客户确认焊接质量合格',
        day: 6,
      },
      {
        seq: 10,
        action: 'confirm',
        fromStatus: 'pending_confirmation',
        toStatus: 'closed',
        operatorId: 'svc-manager',
        operatorName: '陈刚 / Chen Gang',
        note: '客户确认异响消除',
        day: 5,
      },
    ];
    for (const log of logs) {
      const id = ticketId(log.seq);
      await ensure(
        query,
        'serviceTicketLogs',
        { ticketId: id, action: log.action, note: log.note ?? null },
        {
          ticketId: id,
          operatorId: log.operatorId,
          operatorName: log.operatorName,
          action: log.action,
          fromStatus: log.fromStatus ?? null,
          toStatus: log.toStatus ?? null,
          note: log.note ?? null,
          reason: null,
          laborHours: null,
          createdAt: at(log.day, 6),
        },
      );
    }

    // Explicit collaboration shares ----------------------------------------
    const shares: { seq: number; userId: string; day: number }[] = [
      { seq: 15, userId: 'svc-collab', day: 10 },
      { seq: 17, userId: 'svc-collab', day: 11 },
      { seq: 1, userId: 'svc-observer', day: 12 },
      { seq: 7, userId: 'svc-observer', day: 11 },
      { seq: 15, userId: 'svc-observer', day: 10 },
    ];
    for (const share of shares) {
      const id = ticketId(share.seq);
      await ensure(
        query,
        'serviceTicketShares',
        { ticketId: id, userId: share.userId },
        {
          ticketId: id,
          userId: share.userId,
          grantedById: 'svc-manager',
          active: true,
          revokedAt: null,
          createdAt: at(share.day, 7),
          updatedAt: at(share.day, 7),
        },
      );
    }

    // Knowledge base --------------------------------------------------------
    for (const article of KNOWLEDGE) {
      await ensure(
        query,
        'serviceKnowledge',
        { title: article.title },
        {
          title: article.title,
          deviceCategory: article.category,
          summary: article.summary,
          body: article.body,
          status: 'published',
          authorId: article.authorId,
          viewCount: 0,
          publishedAt: at(2),
          createdAt: at(2),
          updatedAt: at(2),
        },
      );
    }

    // Inspection plan and daily tasks --------------------------------------
    const plan = await ensure(
      query,
      'serviceInspectionPlans',
      { name: '每日设备巡检' },
      {
        name: '每日设备巡检',
        cron: '0 9 * * *',
        timezone: 'Asia/Shanghai',
        region: null,
        enabled: true,
        lastRunAt: at(21, 1),
        createdAt: at(0),
        updatedAt: at(21, 1),
      },
    );
    const assigneeByRegion: Record<string, string> = {
      east: 'svc-east',
      south: 'svc-south',
    };
    for (const date of INSPECTION_DATES) {
      const dayOffset = date === '2026-09-21' ? 20 : 21;
      for (const [index, device] of DEVICES.entries()) {
        const completed = date === '2026-09-21' && index % 3 === 0;
        await ensure(
          query,
          'serviceInspectionTasks',
          {
            deviceId: Number(deviceByCode.get(device.code)!.id),
            taskDate: date,
          },
          {
            planId: Number(plan.id),
            deviceId: Number(deviceByCode.get(device.code)!.id),
            taskDate: date,
            status: completed ? 'completed' : 'pending',
            assigneeId:
              device.ownerId ?? assigneeByRegion[device.region] ?? null,
            note: completed ? '巡检完成，设备运行正常。' : null,
            completedAt: completed ? at(dayOffset, 3) : null,
            createdAt: at(dayOffset, 1),
            updatedAt: completed ? at(dayOffset, 3) : at(dayOffset, 1),
          },
        );
      }
    }
  },
});

export default seed;
