/**
 * Demonstration business records for a fresh installation: three customers, six
 * devices, six tickets spanning every lifecycle state, one inspection, two
 * knowledge articles and two manuals. Only identity fields are symbolic; the
 * seed resolves them to real ids.
 */

export interface DemoCustomer {
  code: string;
  name: string;
  contactName: string;
  contactPhone: string;
  address: string;
  serviceLevel: string;
  notes: string;
}

export const demoCustomers: readonly DemoCustomer[] = [
  {
    code: 'CUST-HZ-001',
    name: '杭州精工机械有限公司',
    contactName: '张伟',
    contactPhone: '0571-88001234',
    address: '浙江省杭州市余杭区文一西路 1000 号',
    serviceLevel: 'premium',
    notes: '重点客户，要求 4 小时响应。',
  },
  {
    code: 'CUST-SH-002',
    name: '上海海联电子科技股份有限公司',
    contactName: '李静',
    contactPhone: '021-56001288',
    address: '上海市浦东新区张江高科技园区科苑路 88 号',
    serviceLevel: 'standard',
    notes: '电子制造产线，停机窗口在夜间。',
  },
  {
    code: 'CUST-SZ-003',
    name: '苏州华瑞自动化设备有限公司',
    contactName: '王强',
    contactPhone: '0512-68009988',
    address: '江苏省苏州市工业园区星湖街 328 号',
    serviceLevel: 'basic',
    notes: '备件需提前一周预约。',
  },
];

export interface DemoDevice {
  serialNumber: string;
  name: string;
  model: string;
  category: string;
  location: string;
  status: string;
  warrantyUntil: string;
  customerCode: string;
  notes: string;
}

export const demoDevices: readonly DemoDevice[] = [
  {
    serialNumber: 'SN-HZ-1001',
    name: '三轴数控加工中心',
    model: 'CNC-850',
    category: '数控机床',
    location: '1 号车间 A 区',
    status: 'active',
    warrantyUntil: '2027-06-30',
    customerCode: 'CUST-HZ-001',
    notes: '主轴 2025 年更换过轴承。',
  },
  {
    serialNumber: 'SN-HZ-1002',
    name: '光纤激光切割机',
    model: 'LC-3015',
    category: '钣金设备',
    location: '1 号车间 B 区',
    status: 'active',
    warrantyUntil: '2027-03-31',
    customerCode: 'CUST-HZ-001',
    notes: '冷却水每月更换。',
  },
  {
    serialNumber: 'SN-SH-2001',
    name: '高速贴片机',
    model: 'SMT-X200',
    category: '电子制造',
    location: 'SMT 一车间',
    status: 'active',
    warrantyUntil: '2026-12-31',
    customerCode: 'CUST-SH-002',
    notes: '需要压缩空气 ≥ 0.6 MPa。',
  },
  {
    serialNumber: 'SN-SH-2002',
    name: '十温区回流焊炉',
    model: 'RF-800',
    category: '电子制造',
    location: 'SMT 一车间',
    status: 'maintenance',
    warrantyUntil: '2026-09-30',
    customerCode: 'CUST-SH-002',
    notes: '温区校准每季度一次。',
  },
  {
    serialNumber: 'SN-SZ-3001',
    name: '六轴工业机器人',
    model: 'IR-6A',
    category: '工业机器人',
    location: '装配二线',
    status: 'active',
    warrantyUntil: '2028-01-31',
    customerCode: 'CUST-SZ-003',
    notes: '本体电池 2026 年到期。',
  },
  {
    serialNumber: 'SN-SZ-3002',
    name: '自动化装配线控制柜',
    model: 'ASL-10',
    category: '自动化产线',
    location: '装配二线',
    status: 'active',
    warrantyUntil: '2027-08-31',
    customerCode: 'CUST-SZ-003',
    notes: '含 PLC 与伺服驱动。',
  },
];

export interface DemoTicket {
  code: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  source: string;
  confidential: boolean;
  reporterName: string;
  resolution?: string;
  deviceSerial: string;
  assigneeUsername?: string;
  externalEventId?: string;
  externalPlatform?: string;
  /** Timeline facts, written as ticket events by the seed. */
  events: readonly {
    type: string;
    fromStatus?: string;
    toStatus?: string;
    message: string;
  }[];
}

export const demoTickets: readonly DemoTicket[] = [
  {
    code: 'WO-2026-0001',
    title: '加工中心主轴异响',
    description: 'CNC-850 主轴在 8000 转以上出现周期性异响，疑似轴承磨损。',
    status: 'pending_acceptance',
    priority: 'high',
    source: 'manual',
    confidential: false,
    reporterName: '张伟',
    deviceSerial: 'SN-HZ-1001',
    events: [
      {
        type: 'created',
        toStatus: 'pending_acceptance',
        message: '客户报修，工单已创建，等待受理。',
      },
    ],
  },
  {
    code: 'WO-2026-0002',
    title: '激光切割机切割面挂渣',
    description: '6mm 碳钢切割面挂渣严重，需要现场检查焦点与气压参数。',
    status: 'pending_processing',
    priority: 'urgent',
    source: 'manual',
    confidential: false,
    reporterName: '张伟',
    assigneeUsername: 'engineer.a1',
    deviceSerial: 'SN-HZ-1002',
    events: [
      {
        type: 'created',
        toStatus: 'pending_acceptance',
        message: '客户报修，工单已创建。',
      },
      {
        type: 'accepted',
        fromStatus: 'pending_acceptance',
        toStatus: 'pending_processing',
        message: '工单已受理并派单给 A 组工程师。',
      },
    ],
  },
  {
    code: 'WO-2026-0003',
    title: '贴片机抛料率异常（涉密）',
    description: '贴片机抛料率上升至 3%，涉及客户新产品工艺，工单内容保密。',
    status: 'processing',
    priority: 'normal',
    source: 'manual',
    confidential: true,
    reporterName: '李静',
    assigneeUsername: 'engineer.a2',
    deviceSerial: 'SN-SH-2001',
    events: [
      {
        type: 'created',
        toStatus: 'pending_acceptance',
        message: '客户报修，工单已创建（涉密）。',
      },
      {
        type: 'accepted',
        fromStatus: 'pending_acceptance',
        toStatus: 'pending_processing',
        message: '工单已受理。',
      },
      {
        type: 'processing',
        fromStatus: 'pending_processing',
        toStatus: 'processing',
        message: '工程师已到达现场，开始处理。',
      },
    ],
  },
  {
    code: 'WO-2026-0004',
    title: '回流焊炉温区校准',
    description: '回流焊炉第 7 温区温度偏差 8℃，处理后等待客户确认。',
    status: 'pending_confirmation',
    priority: 'normal',
    source: 'manual',
    confidential: false,
    reporterName: '李静',
    resolution: '重新校准第 7 温区热电偶并更换损坏的加热管，复测偏差 1.5℃。',
    assigneeUsername: 'engineer.a1',
    deviceSerial: 'SN-SH-2002',
    events: [
      {
        type: 'created',
        toStatus: 'pending_acceptance',
        message: '客户报修，工单已创建。',
      },
      {
        type: 'accepted',
        fromStatus: 'pending_acceptance',
        toStatus: 'pending_processing',
        message: '工单已受理。',
      },
      {
        type: 'processing',
        fromStatus: 'pending_processing',
        toStatus: 'processing',
        message: '开始处理温区偏差。',
      },
      {
        type: 'submitted',
        fromStatus: 'processing',
        toStatus: 'pending_confirmation',
        message: '处理完成，提交客户确认。',
      },
    ],
  },
  {
    code: 'WO-2026-0005',
    title: '机器人本体电池更换',
    description: '六轴机器人本体电池电压偏低，已上门更换。',
    status: 'closed',
    priority: 'low',
    source: 'manual',
    confidential: false,
    reporterName: '王强',
    resolution: '更换本体电池并完成原点标定，运行正常。',
    assigneeUsername: 'engineer.b1',
    deviceSerial: 'SN-SZ-3001',
    events: [
      {
        type: 'created',
        toStatus: 'pending_acceptance',
        message: '客户报修，工单已创建。',
      },
      {
        type: 'accepted',
        fromStatus: 'pending_acceptance',
        toStatus: 'pending_processing',
        message: '工单已受理。',
      },
      {
        type: 'processing',
        fromStatus: 'pending_processing',
        toStatus: 'processing',
        message: '开始更换电池。',
      },
      {
        type: 'submitted',
        fromStatus: 'processing',
        toStatus: 'pending_confirmation',
        message: '处理完成，提交客户确认。',
      },
      {
        type: 'closed',
        fromStatus: 'pending_confirmation',
        toStatus: 'closed',
        message: '客户确认完成，工单关闭。',
      },
    ],
  },
  {
    code: 'WO-2026-0006',
    title: '装配线控制柜报警 E-204',
    description: '外部设备平台上报：控制柜 E-204 伺服过载报警。',
    status: 'pending_processing',
    priority: 'high',
    source: 'external',
    confidential: false,
    reporterName: '设备物联平台',
    assigneeUsername: 'engineer.b1',
    deviceSerial: 'SN-SZ-3002',
    externalEventId: 'EXT-2026-0001',
    externalPlatform: 'device-platform',
    events: [
      {
        type: 'created',
        toStatus: 'pending_acceptance',
        message: '外部设备平台自动报修。',
      },
      {
        type: 'accepted',
        fromStatus: 'pending_acceptance',
        toStatus: 'pending_processing',
        message: '工单已受理并派单给 B 组工程师。',
      },
    ],
  },
];

export interface DemoInspection {
  code: string;
  title: string;
  scheduledDate: string;
  status: string;
  deviceSerial: string;
  assigneeUsername: string;
  findings: string;
}

export const demoInspections: readonly DemoInspection[] = [
  {
    code: 'INS-2026-0001',
    title: '1 号车间季度巡检',
    scheduledDate: '2026-10-15T01:00:00.000Z',
    status: 'scheduled',
    deviceSerial: 'SN-HZ-1001',
    assigneeUsername: 'engineer.a1',
    findings: '',
  },
];

export interface DemoArticle {
  title: string;
  slug: string;
  category: string;
  deviceCategory: string;
  summary: string;
  content: string;
  status: string;
  tags: readonly string[];
}

export const demoArticles: readonly DemoArticle[] = [
  {
    title: '数控机床主轴异响的排查与处理',
    slug: 'cnc-spindle-noise',
    category: '故障排查',
    deviceCategory: '数控机床',
    summary:
      '从转速、负载、润滑和轴承间隙四个方向定位主轴异响，并给出处理步骤。',
    content: [
      '# 主轴异响排查',
      '',
      '## 现象',
      '主轴在特定转速区间出现周期性异响，切削表面出现振纹。',
      '',
      '## 排查步骤',
      '1. 记录异响出现的转速区间，低速与高速分别试运行。',
      '2. 检查润滑脂余量与油路，确认润滑正常。',
      '3. 用振动仪测量主轴径向振动，判断是否超过 0.02 mm。',
      '4. 检查拉刀机构与刀柄锥面是否清洁、有无拉伤。',
      '',
      '## 处理',
      '- 润滑不足：补充指定牌号润滑脂。',
      '- 轴承磨损：更换主轴轴承组并重新预紧。',
      '- 拉刀机构松动：调整拉刀力至铭牌要求。',
    ].join('\n'),
    status: 'published',
    tags: ['数控机床', '主轴', '故障排查'],
  },
  {
    title: '三轴加工中心日常保养指南',
    slug: 'cnc-daily-maintenance',
    category: '维护保养',
    deviceCategory: '数控机床',
    summary: '每日、每周、每月的保养项目清单，适用于 CNC-850 等立式加工中心。',
    content: [
      '# 加工中心保养',
      '',
      '## 每日',
      '- 检查气压与油位。',
      '- 清理导轨与工作台切屑。',
      '- 空运行确认各轴无异常声音。',
      '',
      '## 每周',
      '- 清理主轴冷却与电气柜过滤网。',
      '- 检查刀库换刀动作。',
      '',
      '## 每月',
      '- 检查导轨润滑泵与油路。',
      '- 备份数控系统参数与 PLC 程序。',
    ].join('\n'),
    status: 'published',
    tags: ['数控机床', '保养'],
  },
];

export interface DemoManual {
  title: string;
  code: string;
  deviceCategory: string;
  model: string;
  version: string;
  summary: string;
  /** Markdown body, so the manual's own text is searchable, not just its title. */
  content: string;
  status: string;
}

export const demoManuals: readonly DemoManual[] = [
  {
    title: 'CNC-850 数控加工中心操作手册',
    code: 'MAN-CNC-850',
    deviceCategory: '数控机床',
    model: 'CNC-850',
    version: 'v3.2',
    summary: '操作、编程、报警代码与日常保养说明。',
    content: [
      '# CNC-850 数控加工中心操作手册',
      '',
      '## 开机与回零',
      '1. 合上总电源，等待系统自检完成。',
      '2. 依次按下 X、Y、Z 轴回零按钮，确认各轴返回参考点。',
      '',
      '## 报警代码',
      '| 代码 | 含义 | 处理 |',
      '| --- | --- | --- |',
      '| ALM-401 | X 轴伺服过载 | 检查导轨润滑与负载 |',
      '| ALM-520 | 主轴温度过高 | 停机冷却，检查冷却液 |',
      '',
      '## 日常保养',
      '- 每班次清理切屑并检查导轨油位。',
      '- 每周检查气压并排放储气罐积水。',
    ].join('\n'),
    status: 'published',
  },
  {
    title: 'SMT-X200 贴片机维护手册',
    code: 'MAN-SMT-X200',
    deviceCategory: '电子制造',
    model: 'SMT-X200',
    version: 'v2.5',
    summary: '供料器校准、贴装精度调整与故障代码表。',
    content: [
      '# SMT-X200 贴片机维护手册',
      '',
      '## 供料器校准',
      '1. 将供料器装入对应站位并锁紧。',
      '2. 使用校准程序测量送料步距，偏差超过 0.05mm 时重新校正。',
      '',
      '## 贴装精度调整',
      '在视觉标定页面重新标定 Mark 点，检查吸嘴真空值是否达到设定范围。',
      '',
      '## 常见故障代码',
      '| 代码 | 含义 | 处理 |',
      '| --- | --- | --- |',
      '| E-102 | 吸嘴真空异常 | 清理吸嘴并检查气路 |',
      '| E-233 | 供料器通信超时 | 重新插拔供料器并复位 |',
    ].join('\n'),
    status: 'published',
  },
];
