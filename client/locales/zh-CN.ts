import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,

  navigation: {
    ...systemZhCN.navigation,
    documents: '资料库',
  },
  documents: {
    title: '内部资料库',
    description:
      '阅读与你共享的内部资料。已发布且非机密的资料对所有拥有阅读权限的同事开放；草稿和机密资料仍然受到限制。',
    new: '新建资料',
    published: '已发布',
    draft: '草稿',
    confidential: '机密',
    owner: '负责人',
    updatedAt: '更新时间',
    readOnlyHint: '阅读权限不包含编辑权限。如需调整工作权限，请联系管理员。',
    emptyTitle: '暂无可阅读的资料',
    emptyDescription: '有可用的已发布内部资料时，会显示在这里。',
    detail: {
      title: '资料详情',
      notFoundTitle: '该资料不可用',
      notFoundDescription: '它可能已被移动，或已不再向你开放。',
    },
    edit: '编辑资料',
    editTitle: '编辑资料',
    editDescription: '更新《{{title}}》。只有负责人可以编辑这份资料。',
    create: {
      title: '新建资料',
      description:
        '撰写一份由你负责的资料。草稿在发布前仅你可见；机密资料始终保持受限。',
    },
    form: {
      title: '标题',
      content: '正文',
      published: '发布',
      publishedHint: '已发布且非机密的资料，拥有资料阅读权限的同事可以阅读。',
      confidential: '机密',
      confidentialHint: '机密资料永远不会通过临时共享开放。',
      cancel: '取消',
      save: '保存修改',
      create: '创建资料',
      saving: '保存中…',
    },
    errors: {
      accessDenied: '你没有资料阅读权限。',
      accessDeniedDescription:
        '请联系管理员授予阅读权限。阅读权限不包含编辑权限。',
      notFound: '该资料不可用。',
      recipientNotFound: '未找到所选人员。',
      recipientDisabled: '所选账号已停用，无法获得临时访问权限。',
      confidentialDocument: '机密资料不能通过临时共享开放。',
      invalidInput: '请检查表单后重试。',
      unknown: '操作失败，请重试。',
    },
    sharing: {
      ruleTitle: '临时资料共享',
    },
    restriction: {
      confidentialTitle: '机密资料保持隐藏',
    },
  },
  settings: {
    ...systemZhCN.settings,
    documentsSharing: '资料共享',
    documentsSharingDescription:
      '将一份草稿临时开放给指定人员，并在不再需要时撤销访问权限。',
    temporarySharing: '临时共享',
    temporarySharingDescription:
      '选择一份资料和一位人员。只有该人员获得这份资料的阅读权限。',
    selectDocument: '资料',
    selectDocumentHint: '选择资料',
    selectRecipient: '人员',
    selectRecipientHint: '选择人员',
    share: '授予阅读权限',
    shareCreated: '临时访问权限已授予',
    shareRevoked: '临时访问权限已撤销',
    shareRecipientHint: '授予阅读权限不会同时授予编辑权限。',
    activeShares: '当前访问权限',
    activeSharesDescription: '查看并撤销每份资料的临时阅读权限。',
    noShares: '暂无人拥有这份资料的临时访问权限。',
    noDocuments: '暂无资料',
    noDocumentsDescription: '创建资料后会显示在这里。',
    confidentialLocked: '机密资料不能通过临时共享开放。',
    revokeShare: '撤销访问',
    revokeShareTitle: '撤销临时访问权限？',
    revokeShareDescription:
      '{{name}} 将不再看到《{{title}}》。刷新或重新打开原链接也不会显示该资料。',
  },
};

export default zhCN;
