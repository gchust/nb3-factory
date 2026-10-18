import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  navigation: {
    ...systemZhCN.navigation,
    documents: '资料库',
    users: '用户与权限',
  },
  documents: {
    title: '内部资料库',
    description:
      '这里存放内部资料。草稿只有负责人本人可见，已发布的资料所有同事都可以阅读，保密资料无论是否共享都只有负责人本人可见。',
    demoHint:
      '演示账号：资料员甲（editor）和阅读者乙（reader），密码均为 admin123。',
    create: '新建资料',
    createTitle: '新建资料',
    createDescription: '新建的资料归你负责。',
    editTitle: '编辑资料',
    edit: '编辑',
    delete: '删除',
    deleting: '删除中…',
    deleteTitle: '删除这篇资料？',
    deleteDescription:
      '资料及其共享会一并永久删除；被共享的同事会立即失去访问权限。此操作无法撤销。',
    save: '保存',
    saving: '保存中…',
    cancel: '取消',
    saved: '已保存',
    back: '返回资料库',
    loading: '加载中…',
    owner: '负责人',
    updatedAt: '更新时间',
    published: '已发布',
    draft: '草稿',
    confidential: '保密',
    yes: '是',
    no: '否',
    field: {
      title: '标题',
      body: '正文',
      published: '是否发布',
      confidential: '是否保密',
    },
    visibility: {
      published: '已发布——所有同事都可以阅读。',
      draft: '草稿——只有你本人可以阅读。',
      confidential: '保密——只有你本人可以阅读，即使共享也看不到。',
    },
    empty: {
      title: '还没有资料',
      description: '你新建的资料，或同事发布的资料，会显示在这里。',
    },
    notFound: {
      title: '找不到这篇资料',
      description: '它可能已被删除，或者你没有访问权限。',
    },
    error: {
      load: '资料加载失败。',
      save: '资料保存失败。',
      request: '操作失败，请重试。',
      forbidden: '你没有执行该操作的权限。',
      titleRequired: '请填写标题。',
    },
    readOnly: '你可以阅读这篇资料，但不能修改。',
    shares: {
      title: '临时共享',
      description:
        '把一篇草稿临时共享给某位同事；撤销后对方立即失去访问权限。保密资料无论怎样共享都不会被对方看到。',
      select: '同事',
      placeholder: '选择一位同事',
      add: '共享',
      sharing: '共享中…',
      revoke: '撤销',
      empty: '尚未共享给任何人。',
      sharedWith: '已共享给 {{name}}',
      confidential: '这篇资料是保密资料，共享给他人也看不到内容。',
      addFailed: '共享失败。',
      revokeFailed: '撤销共享失败。',
    },
  },
  users: {
    title: '用户与权限',
    description:
      '创建账号、调整谁可以维护资料，以及停用需要立即失去访问权限的账号。',
    permission: '资料库权限',
    permissionNone: '无',
    permissionEditor: '资料维护者',
    permissionReader: '资料阅读者',
    permissionHint:
      '「资料维护者」可以新建并维护自己的资料；「资料阅读者」只能阅读，不能修改。',
    demoHint:
      '演示账号：资料员甲（editor）和阅读者乙（reader），密码均为 admin123。',
    search: '搜索姓名、用户名或邮箱',
    statusEnabled: '已启用',
    statusDisabled: '已停用',
    disable: '停用',
    enable: '启用',
    disableHint: '停用后该账号已登录的会话会立即失效。',
    emptyTitle: '没有匹配的用户',
    emptyDescription: '换一个搜索词试试。',
    error: {
      load: '用户列表加载失败。',
      save: '权限保存失败。',
      disable: '账号停用失败。',
      enable: '账号启用失败。',
    },
    saved: '权限已保存',
    disabled: '账号已停用',
    enabled: '账号已启用',
  },
};

export default zhCN;
