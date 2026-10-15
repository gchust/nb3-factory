import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  actions: {
    ...systemZhCN.actions,
    create: '新建',
    saving: '保存中…',
  },
  navigation: {
    ...systemZhCN.navigation,
    devices: '设备台账',
  },
  devices: {
    title: '设备台账',
    description: '本办公室可借用的设备，以及它们的当前状态。',
    fields: {
      code: '编码',
      name: '名称',
      status: '状态',
      notes: '备注',
    },
    status: {
      available: '可借用',
      borrowed: '已借出',
    },
    filters: {
      status: '按状态筛选',
      allStatuses: '全部状态',
      clear: '清除筛选',
    },
    actions: {
      label: '操作',
      editNamed: '编辑{{name}}',
    },
    create: {
      action: '新增设备',
      title: '新增设备',
      success: '已新增“{{name}}”。',
    },
    edit: {
      title: '编辑设备',
      success: '已保存“{{name}}”。',
    },
    form: {
      description:
        '用编码标识设备，用名称说明大家怎么称呼它。两者必填，编码不能重复。',
      codeHint: '不可重复，例如 DEV-003。',
      codeRequired: '请输入编码。',
      codeTooLong: '最多 {{max}} 个字符。',
      codeTaken: '已有其他设备使用该编码。',
      nameRequired: '请输入名称。',
      nameTooLong: '最多 {{max}} 个字符。',
      notesHint: '可自由填写，使用你习惯的语言；保存后按原样显示。',
      notesTooLong: '最多 {{max}} 个字符。',
    },
    empty: {
      title: '暂无设备',
      description: '新增本办公室可借用的第一台设备。',
      noResults: '没有该状态的设备。',
    },
    error: {
      title: '无法加载设备台账',
      requestFailed: '出了点问题，请重试。',
      sessionExpired: '登录状态已失效，请重新登录后查看设备台账。',
      notFound: '该设备已不存在。',
    },
  },
};

export default zhCN;
