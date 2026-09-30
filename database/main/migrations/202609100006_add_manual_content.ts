import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Manual body text. A manual document uploaded as Markdown is stored as the
 * manual's own `content` so the written procedure is part of the searchable
 * knowledge instead of being locked inside an opaque attachment. The column is
 * nullable: a manual whose files are PDFs or images simply has no text body.
 *
 * The two manuals the demo seed installs are backfilled here, because the seed
 * has already run on an existing installation and a seed never rewrites rows.
 */
const CNC_CONTENT = [
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
].join('\n');

const SMT_CONTENT = [
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
].join('\n');

export const migration: MigrationDefinition = defineMigration({
  name: '202609100006_add_manual_content',
  async up({ builder, query }) {
    await builder.alterCollection('serviceManuals', (collection) => {
      collection.text('content');
    });

    await query
      .updateTable('service_manuals')
      .set({ content: CNC_CONTENT, updatedAt: new Date().toISOString() })
      .where('code', '=', 'MAN-CNC-850')
      .execute();

    await query
      .updateTable('service_manuals')
      .set({ content: SMT_CONTENT, updatedAt: new Date().toISOString() })
      .where('code', '=', 'MAN-SMT-X200')
      .execute();
  },
  async down({ builder }) {
    await builder.alterCollection('serviceManuals', (collection) => {
      collection.dropField('content');
    });
  },
});

export default migration;
