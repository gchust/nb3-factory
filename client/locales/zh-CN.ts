import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  navigation: {
    ...systemZhCN.navigation,
    library: '文档库',
    libraryManage: '文档管理',
    adminUsers: '用户与权限',
  },
  library: {
    title: '文档库',
    description:
      '这里列出所有已发布且不保密的文档。草稿只属于作者，保密文档只有作者和文档管理员可以阅读。',
    manageTitle: '文档管理',
    manageDescription:
      '这里是你负责的文档，包括草稿和保密文档。只有你和文档管理员可以阅读这些内容。保密文档不能共享。',
    searchPlaceholder: '搜索标题或正文',
    searchLabel: '搜索文档',
    columns: {
      title: '标题',
      owner: '作者',
      visibility: '状态',
      updatedAt: '更新时间',
      actions: '操作',
    },
    visibility: {
      published: '已发布',
      draft: '草稿',
      confidential: '保密',
    },
    empty: {
      title: '暂无文档',
      description: '当有文档符合你的访问范围和搜索条件时，会显示在这里。',
      manageTitle: '你还没有文档',
      manageDescription: '创建第一篇需要管理的文档。',
    },
    actions: {
      new: '新建文档',
      view: '查看',
      edit: '编辑',
      share: '共享',
      delete: '删除',
      cancel: '取消',
      save: '保存',
      saving: '保存中…',
      create: '创建',
      creating: '创建中…',
      previous: '上一页',
      next: '下一页',
      retry: '重试',
    },
    detail: {
      title: '文档详情',
      description: '文档的只读视图。',
      body: '正文',
      owner: '作者',
      updatedAt: '最后更新',
      published: '已发布',
      confidential: '保密',
      yes: '是',
      no: '否',
    },
    form: {
      createTitle: '新建文档',
      createDescription: '草稿只属于你。发布后，不保密的文档会对所有读者可见。',
      editTitle: '编辑文档',
      editDescription: '更新文档内容以及谁可以阅读。',
      title: '标题',
      titlePlaceholder: '给文档起一个清晰的标题',
      body: '正文',
      bodyPlaceholder: '在这里编写文档',
      published: '发布这篇文档',
      publishedHint: '已发布且不保密的文档对所有读者可见。',
      confidential: '保密文档',
      confidentialHint:
        '保密文档只有你和文档管理员可以阅读，不能共享给其他任何人。',
      error: '文档保存失败，请检查填写内容后重试。',
    },
    delete: {
      title: '删除这篇文档？',
      description: '文档及其共享名单会被删除，且无法恢复。',
      confirm: '删除文档',
      deleting: '删除中…',
    },
    share: {
      title: '共享文档',
      description: '除作者和文档管理员外，选择还可以阅读这篇文档的人。',
      candidates: '人员',
      selected: '已共享给',
      empty: '这篇文档尚未共享给其他人。',
      searchLabel: '搜索人员',
      searchPlaceholder: '按姓名或邮箱搜索',
      noCandidates: '没有符合搜索条件的人员。',
      confidentialTitle: '保密文档不能共享',
      confidentialHint:
        '保密文档只有作者和文档管理员可以阅读，即使有人尝试共享也不会开放。如果旧规则中还有人员，可以在这里移除。',
      removeExisting: '可移除的现有共享',
      error: '共享名单更新失败，请重试。',
      save: '保存共享',
      saving: '保存中…',
    },
    errors: {
      load: '文档加载失败。',
      notFound: '文档不存在，或你没有阅读权限。',
    },
    permissionSets: {
      librarian: '文档管理员',
      reader: '读者',
    },
    recordAccess: {
      visible: '已发布文档和本人文档',
      visibleDescription: '已发布且不保密的文档，以及当前用户自己创建的文档。',
    },
    resources: {
      documents: '文档',
      documentsDescription: '文档库中的文档及其可见性设置。',
    },
    settings: {
      title: '文档库设置',
      read: '查看设置',
      update: '修改设置',
    },
    sections: {
      library: '文档库',
      documents: '文档',
      administration: '管理',
    },
    scopes: {
      documents: '文档范围',
    },
  },
  users: {
    title: '用户与权限',
    description: '管理员工账号、他们拥有的权限集，以及是否允许登录。',
    searchLabel: '搜索用户',
    searchPlaceholder: '按姓名或邮箱搜索',
    you: '本人',
    status: {
      label: '账号状态',
      all: '全部',
      enabled: '已启用',
      disabled: '已停用',
    },
    account: {
      enabled: '已启用',
      disabled: '已停用',
    },
    columns: {
      person: '人员',
      permissions: '权限集',
      status: '状态',
      actions: '操作',
    },
    actions: {
      permissions: '管理权限',
      enable: '启用账号',
      disable: '停用账号',
      revokeSessions: '退出所有会话',
      cancel: '取消',
      retry: '重试',
      previous: '上一页',
      next: '下一页',
    },
    empty: {
      title: '没有符合条件的用户',
      description: '请尝试其他搜索条件或账号状态。',
    },
    errors: {
      load: '用户加载失败。',
    },
    permissions: {
      title: '管理权限',
      description: '选择 {{name}} 可以执行的操作。',
      none: '未分配权限集',
      save: '保存权限',
      saving: '保存中…',
      error: '权限保存失败。',
      protected: '该分配由用户管理之外的功能维护。',
      defaultAccess: '所有已登录人员还会获得另外配置的默认访问权限。',
    },
    disable: {
      title: '停用这个账号？',
      description: '该人员会立即退出登录，并且在重新启用账号之前无法再次登录。',
      confirm: '停用账号',
      disabling: '停用中…',
      success: '账号已停用，现有会话已结束。',
    },
    enable: {
      success: '账号已启用，该人员可以重新登录。',
      error: '账号启用失败。',
    },
    revokeSessions: {
      success: '该人员已在所有位置退出登录。',
      error: '会话结束失败。',
    },
  },
};

export default zhCN;
