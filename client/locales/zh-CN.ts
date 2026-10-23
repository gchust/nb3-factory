import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  materials: {
    pageTitle: '资料库',
    pageDescription:
      '已发布的资料对同事开放；草稿只对资料员本人可见，管理员可以临时开放其中一份；保密资料始终只属于资料员。',
    title: '标题',
    body: '正文',
    owner: '资料员',
    status: '状态',
    actions: '操作',
    published: '已发布',
    draft: '草稿',
    confidential: '保密',
    view: '查看',
    edit: '编辑',
    create: '新建资料',
    createTitle: '新建资料',
    editTitle: '编辑资料',
    formDescription:
      '资料员会自动记录为当前账号。设为已发布即向同事开放；设为保密则只保留给资料员本人。',
    save: '保存',
    cancel: '取消',
    close: '关闭',
    delete: '删除',
    deleteTitle: '删除这份资料？',
    deleteDescription: '“{{title}}”将被删除，且无法恢复。',
    deleted: '资料已删除',
    saved: '已保存',
    loading: '加载中…',
    emptyTitle: '还没有资料',
    emptyDescription: '当前的权限下没有可读的资料，或者资料库还是空的。',
    noBody: '这份资料还没有正文。',
    shares: '共享访问',
    shareHint: '被共享的阅读者可以阅读这份资料，直到撤销共享。',
    confidentialShareHint:
      '保密资料不会向被共享的阅读者开放，只有资料员本人保留访问。',
    noShares: '暂无其他可以阅读这份资料的账号。',
    shareTarget: '阅读者',
    noTargets: '没有可以共享的启用账号。',
    grant: '授权',
    revoke: '撤销',
    shareGranted: '已授权',
    shareRevoked: '已撤销',
    denied: '没有执行该操作的权限。',
    failed: '请求失败。',
    sharing: {
      ruleTitle: '将某份资料开放给某位读者',
    },
    resourceTitle: '资料库',
    permission: {
      view: '查看资料',
      create: '新建资料',
      edit: '编辑资料',
      delete: '删除资料',
    },
    action: {
      view: '查看',
      create: '新建',
      edit: '编辑',
      delete: '删除',
    },
    recordAccess: {
      public: '已发布且非保密的资料',
      publicHint: '每位登录同事都可以阅读已发布且非保密的资料。',
      nonConfidential: '非保密资料',
      nonConfidentialHint: '即使共享中指定了保密资料，保密资料也不会开放。',
    },
    rules: {
      confidential: '保密资料只属于资料员',
    },
    permissionSets: {
      contributor: '资料员',
      reader: '资料阅读者',
    },
  },
};

export default zhCN;
