import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  navigation: {
    ...systemZhCN.navigation,
    equipments: '设备台账',
  },
  equipment: {
    title: '设备台账',
    description: '团队共用的设备借用台账。编号和名称按输入内容原样保存。',
    filter: {
      label: '状态',
      all: '全部状态',
      available: '可借用',
      borrowed: '已借出',
    },
    status: {
      available: '可借用',
      borrowed: '已借出',
    },
    fields: {
      code: '编号',
      name: '名称',
      status: '状态',
      notes: '备注',
      actions: '操作',
      notesEmpty: '—',
    },
    actions: {
      add: '新增设备',
      edit: '编辑',
      save: '保存',
      saving: '正在保存…',
      cancel: '取消',
      close: '关闭',
      retry: '重试',
      clearFilters: '清除筛选',
    },
    create: {
      title: '新增设备',
      description: '在共享台账中创建设备。',
    },
    edit: {
      title: '编辑设备',
      description: '更新设备信息。设备编号不能与其他设备重复。',
    },
    form: {
      codePlaceholder: '例如 EQ-003',
      namePlaceholder: '例如 现场相机',
      notesPlaceholder: '可选：补充设备说明',
    },
    empty: {
      title: '暂无设备',
      description: '添加第一台设备，开始使用共享台账。',
      filteredTitle: '没有符合筛选条件的设备',
      filteredDescription: '请选择其他状态，或查看全部设备。',
    },
    toast: {
      created: '设备已创建。',
      updated: '设备已更新。',
    },
    validation: {
      codeRequired: '请输入设备编号。',
      codeTooLong: '设备编号不能超过 64 个字符。',
      nameRequired: '请输入设备名称。',
      nameTooLong: '设备名称不能超过 191 个字符。',
      notesTooLong: '备注不能超过 2,000 个字符。',
    },
    errors: {
      generic: '操作失败，请重试。',
      loadFailed: '无法加载设备，请重试。',
      saveFailed: '无法保存更改，请重试。',
      sessionExpired: '登录已过期，请重新登录。',
      invalidInput: '请检查标出的字段后重试。',
      notFound: '该设备记录已不存在。',
      codeTaken: '该编号已被其他设备使用。',
    },
  },
};

export default zhCN;
