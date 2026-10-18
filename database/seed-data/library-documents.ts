import type { Repository } from '@nocobase/db';

import { LIBRARY_USER_IDS } from './library-users.ts';

export interface LibrarySeedDocument {
  id: string;
  title: string;
  body: string;
  ownerId: string;
  published: boolean;
  confidential: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Demonstration records. They make the three visibility rules observable immediately: a reader sees the two public
 * guides, a librarian sees their own drafts, and even a published confidential document stays with its owner.
 */
export const LIBRARY_DOCUMENTS: readonly LibrarySeedDocument[] = [
  {
    id: '2b4a1d5e-7f80-4c91-9d10-3a5b6c7d0001',
    title: '数字馆藏使用指南',
    body: '数字馆藏面向全体读者开放。检索后可直接在线阅读，需要复制时请遵守版权提示，并在引用中注明来源。\n\n校外访问请先登录读者账户，遇到无法打开的资源，可记录题名与链接后联系馆员。',
    ownerId: LIBRARY_USER_IDS.jia,
    published: true,
    confidential: false,
    createdAt: '2026-09-02T09:00:00.000Z',
    updatedAt: '2026-09-02T09:00:00.000Z',
  },
  {
    id: '2b4a1d5e-7f80-4c91-9d10-3a5b6c7d0002',
    title: '阅览室使用规则',
    body: '阅览室开放时间为每日 8:30 至 21:00。请保持安静，勿将食物带入阅览区。\n\n离座超过三十分钟，座位可由其他读者使用；闭馆前十五分钟停止入馆。',
    ownerId: LIBRARY_USER_IDS.zhou,
    published: true,
    confidential: false,
    createdAt: '2026-09-05T02:30:00.000Z',
    updatedAt: '2026-09-06T01:15:00.000Z',
  },
  {
    id: '2b4a1d5e-7f80-4c91-9d10-3a5b6c7d0003',
    title: '古籍修复项目计划（内部）',
    body: '本季度优先处理民国期刊合订本，修复前完成纸张酸碱度检测并留存影像记录。\n\n预算与捐赠人联系方式仅限项目组成员查阅，对外沟通统一由馆办公室负责。',
    ownerId: LIBRARY_USER_IDS.zhou,
    published: true,
    confidential: true,
    createdAt: '2026-09-08T06:20:00.000Z',
    updatedAt: '2026-09-10T03:40:00.000Z',
  },
  {
    id: '2b4a1d5e-7f80-4c91-9d10-3a5b6c7d0004',
    title: '秋季读书会活动草案',
    body: '拟围绕城市史主题安排四场共读，每场限二十人。场地、嘉宾与宣传物料仍在协调中，定稿前不对外发布。',
    ownerId: LIBRARY_USER_IDS.jia,
    published: false,
    confidential: false,
    createdAt: '2026-09-12T07:05:00.000Z',
    updatedAt: '2026-09-12T07:05:00.000Z',
  },
  {
    id: '2b4a1d5e-7f80-4c91-9d10-3a5b6c7d0005',
    title: '读者荐购流程说明（草稿）',
    body: '读者可通过服务台或线上表单荐购。馆员每周汇总一次，结合馆藏结构与本年度预算决定是否采购。\n\n待补充审批环节与到馆通知方式后再发布。',
    ownerId: LIBRARY_USER_IDS.lin,
    published: false,
    confidential: false,
    createdAt: '2026-09-15T08:10:00.000Z',
    updatedAt: '2026-09-15T08:10:00.000Z',
  },
];

/** Writes only missing rows, keeping any later edits an administrator or owner made. */
export async function ensureLibraryDocuments(
  documents: Repository<
    LibrarySeedDocument,
    LibrarySeedDocument,
    Partial<LibrarySeedDocument>
  >,
): Promise<void> {
  for (const document of LIBRARY_DOCUMENTS) {
    const existing = await documents.findOne({
      filter: { id: document.id },
    });
    if (!existing) {
      await documents.createOne({ values: document });
    }
  }
}
