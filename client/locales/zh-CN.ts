import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  navigation: {
    ...systemZhCN.navigation,
    devices: '设备台账',
  },
  actions: {
    ...systemZhCN.actions,
    create: '新建',
    edit: '编辑',
    saving: '正在保存…',
    signInAgain: '重新登录',
  },
  'status.sessionExpired': '登录状态已过期，请重新登录后继续。',
  devices: {
    title: '设备台账',
    description: '记录团队有哪些设备、是否可用，以及存放在哪里。',
    create: {
      action: '新建设备',
      title: '新建设备',
      success: '已创建设备“{{name}}”。',
    },
    edit: {
      title: '编辑设备',
      success: '已保存“{{name}}”的修改。',
    },
    fields: {
      code: '编号',
      name: '名称',
      status: '状态',
      notes: '备注',
      actions: '操作',
    },
    status: {
      available: '可用',
      borrowed: '借出中',
    },
    form: {
      description: '编号必须唯一。状态按系统值保存，界面显示当前语言下的名称。',
      codeRequired: '请输入编号。',
      codeTooLong: '编号最多 {{max}} 个字符。',
      codeTaken: '该编号已被其他设备使用。',
      nameRequired: '请输入名称。',
      nameTooLong: '名称最多 {{max}} 个字符。',
      notesTooLong: '备注最多 {{max}} 个字符。',
    },
    filters: {
      status: '按状态筛选',
      allStatuses: '全部状态',
      clear: '清除筛选',
    },
    list: {
      total: '共 {{total}} 台设备',
      range: '第 {{first}}–{{last}} 条，共 {{total}} 条',
      page: '第 {{page}} / {{totalPages}} 页',
      previous: '上一页',
      next: '下一页',
      noNotes: '无备注',
    },
    empty: {
      title: '还没有设备',
      description: '添加第一台设备，让团队了解可用情况。',
      filteredTitle: '没有符合筛选条件的设备',
      filteredDescription: '换一个状态试试，或清除筛选。',
    },
    actionsFor: '{{name}} 的操作',
    error: {
      requestFailed: '请求未能完成，请重试。',
      forbidden: '你没有执行此操作的权限。',
      notFound: '该设备已不存在。',
    },
  },
};

export default zhCN;
