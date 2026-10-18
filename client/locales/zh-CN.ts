import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  navigation: {
    ...systemZhCN.navigation,
    materials: '资料库',
    libraryAdmin: '资料库管理',
  },
  library: {
    title: '资料库',
    description:
      '你需要阅读的资料。已发布的资料同事可以阅读，草稿默认只有作者本人可见。',
    create: '新建资料',
    owner: '作者',
    list: {
      emptyTitle: '暂时没有可阅读的资料',
      emptyDescription: '还没有已发布的资料，也没有人把草稿共享给你。',
    },
    error: {
      title: '无法读取资料库',
      description: '资料库读取失败，请重试。',
    },
    status: {
      published: '已发布',
      draft: '草稿',
      confidential: '机密',
      shared: '已共享给你',
    },
    actions: {
      menu: '资料操作',
      edit: '编辑',
      share: '管理共享',
      delete: '删除',
    },
    form: {
      createTitle: '新建资料',
      editTitle: '编辑资料',
      description: '一份资料由标题和正文组成；可见性和机密性决定谁可以阅读。',
      title: '标题',
      titlePlaceholder: '请输入标题',
      body: '正文',
      bodyPlaceholder: '请输入正文…',
      visibility: '可见性',
      published: '已发布',
      draft: '草稿',
      confidentiality: '机密性',
      confidential: '机密',
      normal: '普通',
      save: '保存',
      saving: '保存中…',
      cancel: '取消',
      titleRequired: '标题不能为空。',
    },
    saveFailed: '资料保存失败。',
    delete: {
      title: '删除这份资料？',
      description: '资料及其所有共享记录都会被删除。',
      confirm: '删除',
      cancel: '取消',
    },
    detail: {
      back: '返回资料库',
      bodyEmpty: '这份资料还没有正文。',
      notFoundTitle: '资料不可用',
      notFoundDescription: '这份资料不存在，或者没有共享给你。',
    },
    share: {
      title: '临时共享',
      description:
        '共享可以让某个人阅读一份草稿；机密资料即使被共享也不会显示。',
      empty: '没有其他可以共享的人。',
      grant: '共享',
      revoke: '撤销',
      close: '关闭',
      failed: '共享设置修改失败。',
    },
    admin: {
      title: '资料库管理',
      description: '谁可以维护资料、谁只能阅读，以及哪些账号已被停用。',
      members: '人员',
      role: {
        editor: '维护者',
        reader: '阅读者',
      },
      active: '正常',
      disabled: '已停用',
      disable: '停用',
      enable: '启用',
      you: '管理员',
      actionFailed: '修改未生效。',
      roleFailed: '工作角色修改失败。',
      disableFailed: '账号停用失败。',
      enableFailed: '账号启用失败。',
    },
    forbidden: {
      title: '没有权限',
      description: '只有管理员可以打开此页面。',
    },
  },
};

export default zhCN;
