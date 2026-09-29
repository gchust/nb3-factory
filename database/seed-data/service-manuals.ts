/**
 * Two short fictional equipment manuals. They double as the seed content for
 * the AI Knowledge Base manual and as the knowledge the service assistant
 * answers from, so both sources stay identical.
 */

export interface ServiceManualSeed {
  readonly title: string;
  readonly version: string;
  readonly deviceModel: string;
  readonly status: 'draft' | 'published';
  readonly content: string;
}

export const SERVICE_MANUALS: readonly ServiceManualSeed[] = [
  {
    title: 'NX-200 工业泵日常巡检手册',
    version: 'v1.0',
    deviceModel: 'NX-200',
    status: 'published',
    content: [
      '# NX-200 工业泵日常巡检手册（v1.0）',
      '',
      '## 1. 适用范围',
      '本手册适用于 NX-200 系列工业泵的日常巡检与一级保养。',
      '',
      '## 2. 巡检周期',
      '- 日常巡检：每 7 天一次。',
      '- 一级保养：每 90 天一次。',
      '',
      '## 3. 巡检项目与判定标准',
      '1. 泵体温度：不超过 75℃；超过时停机检查冷却水路。',
      '2. 出口压力：稳定在 0.4–0.6 MPa。',
      '3. 轴承振动：振幅不超过 4.5 mm/s。',
      '4. 密封泄漏：滴漏不超过 5 滴/分钟。',
      '5. 电源与接地：接线端子无松动、无焦痕。',
      '',
      '## 4. 常见故障处理',
      '- 压力不足：检查入口过滤器是否堵塞，清洗或更换滤芯。',
      '- 异常噪音：检查联轴器对中，重新校准同轴度。',
      '- 温度过高：检查冷却水流量与散热片清洁度。',
      '',
      '## 5. 安全须知',
      '检修前必须断电挂牌，并等待叶轮完全停止后再操作。',
      '',
      '## 6. 记录要求',
      '每次巡检须在系统中登记巡检结果；发现异常时必须创建工单跟进。',
    ].join('\n'),
  },
  {
    title: 'NX-200 工业泵故障诊断手册',
    version: 'v1.1',
    deviceModel: 'NX-200',
    status: 'published',
    content: [
      '# NX-200 工业泵故障诊断手册（v1.1）',
      '',
      '## 1. 诊断流程',
      '观察现象 → 读取压力与温度 → 检查电气与机械 → 定位原因 → 处置并记录。',
      '',
      '## 2. 现象与原因对照',
      '| 现象 | 可能原因 | 处置 |',
      '| --- | --- | --- |',
      '| 出口压力持续偏低 | 过滤器堵塞、叶轮磨损 | 清洗滤芯；叶轮磨损时更换 |',
      '| 泵体温度过高 | 冷却水不足、轴承润滑不良 | 恢复冷却水；补充或更换润滑脂 |',
      '| 振动超标 | 联轴器不对中、地脚螺栓松动 | 重新对中；按扭矩紧固地脚 |',
      '| 电流异常升高 | 负载过大、绕组问题 | 检查负载；测量绝缘电阻 |',
      '| 密封滴漏加剧 | 密封件老化 | 更换机械密封组件 |',
      '',
      '## 3. 更换件清单',
      '机械密封、滤芯、润滑脂为常用备件，建议现场常备。',
      '',
      '## 4. 升级与回退',
      '本版本新增电流异常诊断项；若现场条件不足，可回退 v1.0 执行基础项目。',
      '',
      '## 5. 上报要求',
      '无法在 4 小时内定位的故障，须上报主管并升级为加急工单。',
    ].join('\n'),
  },
];
