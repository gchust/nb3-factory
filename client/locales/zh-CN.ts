import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  navigation: {
    ...systemZhCN.navigation,
    documents: '资料库',
    settings: '资料库设置',
  },
  actions: {
    ...systemZhCN.actions,
    create: '新建',
    saving: '保存中…',
    signInAgain: '重新登录',
  },
  'status.sessionExpired': '登录状态已失效，请重新登录后继续。',

  // 资料库。`documents.title`、`documents.actions`、`documents.permissions`、`documents.recordAccess` 和
  // `documents.admin` 同时也是权限页面显示的标题，因此放在本命名空间内。
  documents: {
    title: '资料',
    description:
      '已发布的资料对拥有读取权限的同事开放；草稿默认只有负责人可以看到。',
    collection: '资料',
    actions: {
      view: '查看资料',
      create: '新建资料',
      edit: '编辑资料',
      delete: '删除资料',
    },
    permissions: {
      view: '查看资料',
      create: '新建资料',
      edit: '编辑资料',
      delete: '删除资料',
    },
    permissionSets: {
      editor: '资料员',
      reader: '资料阅读者',
    },
    recordAccess: {
      readable: '本人负责、已发布或临时共享给我的资料',
    },
    create: {
      title: '新建资料',
      action: '新建资料',
      success: '已新建“{{name}}”。',
    },
    edit: {
      title: '编辑资料',
      success: '已保存“{{name}}”。',
    },
    form: {
      description: '已发布且不保密的资料，拥有资料读取权限的同事都可以查看。',
      title: '标题',
      titlePlaceholder: '给资料起一个清晰的标题',
      body: '正文',
      bodyPlaceholder: '在这里撰写资料内容',
      published: '是否发布',
      publishedHint: '发布后，拥有资料读取权限的同事即可查看。',
      confidential: '是否保密',
      confidentialHint: '保密资料只有负责人本人可以查看，临时共享也不例外。',
      titleRequired: '请填写标题。',
      titleTooLong: '标题最多 {{max}} 个字符。',
    },
    discard: {
      title: '放弃修改？',
      description: '你的修改不会被保存。',
      cancel: '继续编辑',
      confirm: '放弃修改',
    },
    fields: {
      title: '标题',
      body: '正文',
      owner: '负责人',
      status: '状态',
      published: '是否发布',
      confidential: '是否保密',
      updatedAt: '更新时间',
    },
    status: {
      published: '已发布',
      draft: '草稿',
      confidential: '保密',
      normal: '非保密',
    },
    search: {
      label: '按标题搜索资料',
      placeholder: '按标题搜索',
    },
    filters: {
      clear: '清除搜索',
    },
    sort: {
      by: '按{{field}}排序',
      toggle: '切换{{field}}的排序方向',
    },
    empty: {
      title: '还没有资料',
      description: '资料库是空的，从第一份资料开始。',
      noResults: '没有符合条件的资料',
      noResultsDescription: '换一个标题试试，或清除搜索条件。',
    },
    pagination: {
      summary: '共 {{total}} 份资料 · 第 {{page}} / {{pageCount}} 页',
      previous: '上一页',
      next: '下一页',
    },
    rowActions: {
      label: '操作',
      more: '“{{name}}”的操作',
      edit: '编辑',
      delete: '删除',
    },
    detail: {
      title: '资料',
      description: '这份资料的内容，以及谁可以查看。',
      unknownOwner: '未知',
      emptyBody: '这份资料还没有正文。',
      missing: {
        description: '这份资料不存在，或你已无权查看。',
      },
    },
    delete: {
      title: '删除“{{name}}”？',
      description: '删除后所有人都无法再查看，且无法恢复。',
      confirm: '删除',
      success: '已删除“{{name}}”。',
      notFound: '“{{name}}”已被删除。',
    },
    error: {
      notFound: '这份资料不存在，或你已无权查看。',
      forbidden: '你没有执行该操作的权限。',
      requestFailed: '操作失败，请重试。',
    },
    admin: {
      title: '资料库',
      actions: {
        read: '打开资料库设置',
        manage: '管理临时共享',
      },
    },
  },

  settings: {
    title: '资料库设置',
    description: '谁可以登录资料库，以及哪些资料对谁临时开放。',
    tabs: {
      users: '人员权限',
      shares: '临时共享',
    },
    users: {
      title: '人员权限',
      description: '启用或停用账号，并选择其拥有的权限集。',
      search: {
        label: '搜索人员',
        placeholder: '按姓名、用户名或邮箱搜索',
      },
      saving: '保存中…',
      status: {
        enabled: '已启用',
        disabled: '已停用',
      },
      roles: {
        label: '“{{name}}”的权限集',
        none: '没有可分配的权限集。',
        success: '已更新“{{name}}”的权限集。',
      },
      empty: {
        description: '还没有人员账号。',
        noResults: '没有符合条件的人员。',
      },
      disable: {
        action: '停用',
        title: '停用“{{name}}”？',
        description:
          '账号将无法登录，已经登录的会话也会失效。其资料和共享关系保留。',
        confirm: '停用',
        success: '已停用“{{name}}”。',
      },
      enable: {
        action: '启用',
        title: '启用“{{name}}”？',
        description: '账号可以重新登录。',
        confirm: '启用',
        success: '已启用“{{name}}”。',
      },
    },
    shares: {
      title: '临时共享',
      description: '把一份资料临时开放给一个人。保密资料不会因共享而开放。',
      document: '资料',
      documentPlaceholder: '选择一份资料',
      user: '共享给',
      userPlaceholder: '选择一个人',
      share: {
        action: '共享',
        success: '已共享该资料。',
      },
      revoke: {
        action: '撤销',
        success: '已撤销共享。',
      },
      confidentialHint:
        '这是一份保密资料，共享不会让它对他人开放；只有负责人本人可以查看。',
      selectDocument: '选择一份资料，查看并管理它的共享。',
      empty: '这份资料还没有共享给任何人。',
      since: '共享于 {{date}}',
      readOnly: '你可以查看这些共享，但不能修改。',
    },
  },
};

export default zhCN;
