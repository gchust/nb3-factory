/**
 * The two short, fully fictional device manuals shipped with the application.
 * They are the fixed sample content a supervisor loads into the internal
 * knowledge base with one click, so a fresh installation can demonstrate the
 * whole maintenance path without hunting for files.
 */
export interface DeviceManualSample {
  filename: string;
  title: string;
  content: string;
}

export const deviceManualSamples: readonly DeviceManualSample[] = [
  {
    filename: 'injection-molding-machine.md',
    title: '注塑机日常维护手册 / Injection molding machine maintenance',
    content: [
      '# 注塑机日常维护手册（虚构示例）',
      '',
      '## 日常检查',
      '- 每班检查液压油位，油温高于 55°C 时停机散热。',
      '- 清理料斗与螺杆进料口的残料，防止混料。',
      '- 检查安全门限位开关是否可靠。',
      '',
      '## 压力异常排查',
      '1. 确认压力表读数与设定值差值在 10% 以内。',
      '2. 若压力不足，依次检查液压油位、吸油滤芯、溢流阀设定。',
      '3. 更换滤芯后仍低于额定值 80%，联系服务工程师检查液压泵。',
      '',
      '## 安全提示',
      '任何进入模具区域的操作必须先切断电源并挂牌。',
    ].join('\n'),
  },
  {
    filename: 'cnc-machine.md',
    title: '数控机床安全操作手册 / CNC machine safety operation',
    content: [
      '# 数控机床安全操作手册（虚构示例）',
      '',
      '## 开机前',
      '- 确认工作区域内无人员与杂物。',
      '- 检查冷却液液位与气压是否达标。',
      '- 确认急停按钮已复位。',
      '',
      '## 主轴异响处理',
      '1. 立即停止主轴并记录异响发生时的转速。',
      '2. 检查刀具装夹是否松动、主轴锥孔是否有切屑。',
      '3. 若异响持续，停机并通知服务工程师检查轴承。',
      '',
      '## 保养周期',
      '- 每日清理导轨切屑。',
      '- 每周补充导轨润滑油。',
      '- 每月校准一次主轴跳动并留存记录。',
    ].join('\n'),
  },
];
