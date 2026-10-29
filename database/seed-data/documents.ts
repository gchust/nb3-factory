/** The fictional identities and documents every fresh installation of this application carries. */
export const DEMO_PASSWORD = 'NocoBase123!';

export const DEMO_USERS = {
  editor: {
    username: 'editor',
    name: '资料员甲',
    email: 'editor@example.com',
  },
  reader: {
    username: 'reader',
    name: '阅读者乙',
    email: 'reader@example.com',
  },
} as const;

/**
 * P proves the baseline for published, non-confidential documents.
 * D is the owner's private draft used for the temporary-sharing flow.
 * C is published but confidential, so the reader must never receive it.
 */
export const DOCUMENT_FIXTURES = [
  {
    key: 'public',
    title: '内部资料：新员工入职指南',
    content:
      '本文介绍公司内部资料库的使用方式、办公环境与日常协作规范，供全体同事阅读。',
    published: true,
    confidential: false,
  },
  {
    key: 'draft',
    title: '草稿：第三季度资料整理计划',
    content:
      '这是资料员尚未发布的整理计划草稿。默认仅负责人可见，经管理员临时授权后可向指定同事开放。',
    published: false,
    confidential: false,
  },
  {
    key: 'confidential',
    title: '机密：年度预算测算底稿',
    content:
      '本文包含年度预算测算底稿，属于机密资料，不得通过临时共享向普通阅读者开放。',
    published: true,
    confidential: true,
  },
] as const;
