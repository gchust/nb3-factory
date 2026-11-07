import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  actions: {
    ...systemZhCN.actions,
    create: '新建',
    edit: '编辑',
    retry: '重试',
    saving: '保存中…',
  },
  navigation: {
    ...systemZhCN.navigation,
    devices: '设备台账',
  },
  devices: {
    title: '设备台账',
    description: '记录团队可借用的设备，并了解哪些设备当前可以借用。',
    total: '共 {{count}} 台',
    fields: {
      code: '设备编号',
      name: '设备名称',
      status: '状态',
      notes: '备注',
    },
    status: {
      all: '全部状态',
      available: '可借用',
      borrowed: '已借出',
    },
    filter: {
      status: '按状态筛选',
      clear: '清除筛选',
    },
    table: {
      actions: '操作',
    },
    create: {
      action: '添加设备',
      title: '添加设备',
      success: '已添加设备“{{name}}”。',
    },
    edit: {
      title: '编辑设备',
      success: '已保存设备“{{name}}”。',
    },
    empty: {
      title: '还没有设备',
      description: '把第一台设备添加到台账中。',
      filteredTitle: '没有符合筛选条件的设备',
      filteredDescription: '请选择其他状态，或清除筛选。',
    },
    error: {
      loadFailed: '无法加载设备列表。',
    },
    form: {
      description: '填写设备上的编号、名称，以及设备当前的状态。',
      codeRequired: '请填写设备编号。',
      codeTooLong: '设备编号不能超过 {{max}} 个字符。',
      nameRequired: '请填写设备名称。',
      nameTooLong: '设备名称不能超过 {{max}} 个字符。',
      notesTooLong: '备注不能超过 {{max}} 个字符。',
      codeTaken: '该设备编号已被使用。',
      notFound: '该设备已不存在。',
      requestFailed: '无法保存设备，请重试。',
    },
  },
};

export default zhCN;
