import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  // This application's own copy, mirroring `./en-US.ts`.
  actions: {
    ...systemZhCN.actions,
    create: '新建',
    retry: '重试',
    saving: '保存中…',
  },
  navigation: {
    ...systemZhCN.navigation,
    library: '资料库',
    members: '人员',
  },
  library: {
    title: '资料库',
    description: '阅读已发布给你的资料，并维护你负责的资料。',
    search: {
      label: '搜索资料',
      placeholder: '按标题或正文搜索',
    },
    filter: {
      visibility: '按可见范围筛选',
      allVisibilities: '全部可见范围',
    },
    visibility: {
      published: '已发布',
      draft: '草稿',
      confidential: '保密',
    },
    column: {
      title: '标题',
      owner: '负责人',
      visibility: '可见范围',
      updatedAt: '更新时间',
      actions: '操作',
    },
    list: {
      count: '共 {{count}} 条资料',
      empty: '暂无资料',
      emptyHint: '你负责的资料，以及已发布给你的资料，会显示在这里。',
      emptyFiltered: '没有匹配的资料',
      emptyFilteredHint: '当前搜索和筛选没有结果，可以换个关键词试试。',
    },
    clearFilters: '清除筛选',
    row: {
      actions: '{{title}} 的操作',
      view: '查看',
      edit: '编辑',
    },
    create: {
      action: '新建资料',
      title: '新建资料',
      description: '写一条资料。在发布之前，只有你自己可以看到它。',
    },
    edit: {
      action: '编辑',
      title: '编辑资料',
      description: '修改正文内容，或调整读者是否可以看到它。',
      forbidden: '你可以阅读这份资料，但不能修改它。请联系资料负责人或管理员。',
    },
    form: {
      title: '标题',
      body: '正文',
      published: '发布',
      publishedHint: '读者可以打开这条资料。仍是草稿时请保持关闭。',
      confidential: '保密',
      confidentialHint:
        '保密资料对读者始终不可见，即使单独共享给某个人也一样。',
      titleRequired: '请填写标题。',
      titleTooLong: '标题最多 {{max}} 个字符。',
      bodyTooLong: '正文最多 {{max}} 个字符。',
      submitFailed: '资料保存失败，请重试。',
      forbidden: '你没有修改这条资料的权限。',
    },
    detail: {
      title: '资料',
      loading: '正在加载资料',
      notFound: '这条资料不可用。它可能已被取消发布，或访问权限已被撤回。',
      forbidden: '你没有阅读这条资料的权限。',
      error: '资料加载失败，请重试。',
      owner: '负责人 {{name}}',
      updatedAt: '更新于 {{date}}',
      emptyBody: '这条资料还没有正文。',
    },
    shares: {
      title: '临时开放',
      description:
        '在不发布的情况下，让某位同事阅读这条资料。阅读权限不等于修改权限。',
      confidentialNotice: '这条资料是保密的，此处开放对读者不会生效。',
      person: '共享给',
      pickPerson: '选择同事',
      add: '共享',
      revoke: '撤销',
      empty: '尚未共享给任何人。',
      failed: '保存失败，请重试。',
      forbidden: '你没有管理临时开放的权限。',
    },
    error: {
      title: '资料库加载失败',
      description: '加载资料时出错，请重试。',
      forbidden: '你没有阅读资料库的权限。',
    },
  },
  members: {
    title: '人员',
    description: '谁可以登录、每个账号拥有哪些权限集，以及账号是否启用。',
    search: {
      label: '搜索人员',
      placeholder: '按姓名或邮箱搜索',
    },
    filter: {
      status: '按状态筛选',
      allStatuses: '全部状态',
    },
    status: {
      enabled: '已启用',
      disabled: '已停用',
    },
    noPermissionSets: '无权限集',
    column: {
      name: '姓名',
      email: '邮箱',
      permissionSets: '权限集',
      status: '状态',
      createdAt: '创建时间',
      actions: '操作',
    },
    row: {
      actions: '{{name}} 的操作',
      permissionSets: '权限集',
      permissionSetsHint: '这个账号可以做什么。',
      disable: '停用',
      enable: '重新启用',
    },
    list: {
      count: '共 {{count}} 个账号',
      empty: '暂无账号',
      emptyHint: '账号创建后会显示在这里。',
      emptyFiltered: '没有匹配的账号',
    },
    clearFilters: '清除筛选',
    saved: '已保存。',
    saveFailed: '保存失败，请重试。',
    error: {
      title: '人员加载失败',
      description: '加载人员列表时出错，请重试。',
      forbidden: '只有根管理员可以管理人员。',
    },
  },
};

export default zhCN;
