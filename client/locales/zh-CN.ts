import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  'auth.realtimeUnavailable': '实时更新暂不可用',
  'auth.realtimeUnavailableDescription':
    '应用仍可继续使用，但连接恢复前页面内容可能不会及时更新。',
  navigation: { ...systemZhCN.navigation, library: '资料库' },
  library: {
    navigation: '资料库',
    title: '资料库',
    description:
      '已发布的资料对读者开放。维护者在这里保存自己的草稿，管理员可以临时把一篇草稿开放给一位读者。',
    count: '共 {{count}} 篇资料',
    byOwner: '作者：{{name}}',
    noBody: '暂无内容。',
    updatedAt: '更新于 {{date}}',
    deleted: '资料已删除。',
    documentBreadcrumb: '资料',
    status: {
      published: '已发布',
      draft: '草稿',
      confidential: '保密',
    },
    actions: {
      create: '新建资料',
      edit: '编辑',
      delete: '删除',
      save: '保存',
      saving: '保存中…',
      cancel: '取消',
      back: '返回资料库',
    },
    empty: {
      title: '这里还没有资料',
      description: '维护者可以创建第一篇资料。读者会在这里看到已发布的资料。',
    },
    form: {
      createTitle: '新建资料',
      createDescription: '编写资料。草稿在发布或共享前保持私密。',
      editTitle: '编辑资料',
      editDescription: '只有创建这篇资料的人可以修改它。',
      title: '标题',
      titlePlaceholder: '给资料起一个清晰的标题',
      body: '内容',
      bodyPlaceholder: '撰写资料内容…',
      published: '发布',
      publishedHint: '读者可以看到已发布且非保密的资料。',
      confidential: '保密',
      confidentialHint: '读者永远看不到保密资料，即使它被共享。',
    },
    errors: {
      loadFailed: '无法加载资料库。',
      saveFailed: '无法保存资料。',
      deleteFailed: '无法删除资料。',
      denied: '你没有修改这篇资料的权限。',
    },
    missing: {
      title: '资料不可用',
      description: '它可能已被删除，或者你没有阅读它的权限。',
    },
    delete: {
      title: '删除这篇资料？',
      description:
        '“{{title}}”以及它的所有临时共享都会被移除。此操作无法撤销。',
    },
    admin: {
      navigation: '资料共享',
      title: '资料共享',
      description:
        '临时把一篇草稿开放给某个人，并在不再需要时立即撤销。已发布和保密资料由它们自己的可见性控制。',
      grantTitle: '共享草稿',
      grantHint: '读者会一直保留访问权限，直到撤销共享。保密资料不能共享。',
      document: '资料',
      chooseDocument: '选择一篇资料',
      person: '读者',
      choosePerson: '选择一位启用中的用户',
      confidentialWarning: '这篇资料是保密的，不能共享给读者。',
      share: '共享',
      saving: '共享中…',
      shared: '草稿已共享。',
      shareFailed: '无法共享这篇草稿。',
      noShares: '目前没有人拥有这篇资料的临时访问权限。',
      revoke: '撤销',
      revoked: '访问权限已撤销。',
      revokeFailed: '无法撤销访问权限。',
      read: '查看资料共享',
      update: '管理资料共享',
    },
    roles: {
      maintainer: '资料维护者',
      reader: '资料读者',
    },
    permissions: {
      resource: '资料库',
      documents: '资料',
      view: '查看资料',
      create: '创建资料',
      edit: '编辑自己的资料',
      delete: '删除自己的资料',
      readable: '可读资料',
      readableDescription: '已发布且非保密的资料，以及共享给我的草稿。',
      visible: '可见资料',
      visibleDescription: '我自己的资料，以及已发布且非保密的资料。',
    },
  },
};

export default zhCN;
