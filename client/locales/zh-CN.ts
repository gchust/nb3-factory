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
    create: '创建',
    saving: '保存中…',
    signInAgain: '重新登录',
  },
  'status.sessionExpired': '会话已结束，请重新登录后继续。',
  devices: {
    title: '设备台账',
    description: '记录每台设备的编号、名称与借用状态。',
    add: '新增设备',
    empty: {
      title: '暂无设备',
      description: '新增第一台设备，开始记录台账。',
    },
    noResults: '没有符合该状态的设备。',
    fields: {
      code: '编号',
      name: '名称',
      status: '状态',
    },
    status: {
      available: '可借用',
      borrowed: '已借出',
    },
    filter: {
      label: '按状态筛选',
      all: '全部状态',
      clear: '清除筛选',
    },
    create: {
      title: '新增设备',
      description: '填写设备编号、名称与状态。',
      success: '已新增设备“{{name}}”。',
    },
    edit: {
      title: '编辑设备',
      description: '修改设备编号、名称或状态。',
      success: '已更新设备“{{name}}”。',
    },
    form: {
      codePlaceholder: '例如 DEV-LAP-0001',
      namePlaceholder: '设备名称',
      statusPlaceholder: '选择状态',
      codeRequired: '请输入设备编号。',
      codeTooLong: '设备编号不能超过 {{max}} 个字符。',
      nameRequired: '请输入设备名称。',
      nameTooLong: '设备名称不能超过 {{max}} 个字符。',
    },
    errors: {
      title: '设备加载失败',
      loadFailed: '设备列表加载失败，请重试。',
      requestFailed: '请求未能完成。',
      codeTaken: '该编号的设备已存在。',
      notFound: '设备不存在。',
      sessionExpired: '登录状态已失效，请重新登录后继续。',
    },
    actions: {
      label: '操作',
      edit: '编辑',
      more: '打开“{{name}}”的菜单',
    },
  },
};

export default zhCN;
