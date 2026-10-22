import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  navigation: { ...systemZhCN.navigation, devices: '设备' },
  devices: {
    title: '设备台账',
    description: '登记设备，并记录每台设备是否可借用。',
    loading: '正在加载设备',
    capNotice: '仅显示前 {{count}} 台设备。',
    created: '设备“{{name}}”已创建。',
    saved: '设备“{{name}}”已保存。',
    fields: {
      code: '编号',
      name: '名称',
      status: '状态',
      notes: '备注',
    },
    // 系统状态值，始终翻译；设备自身的名称与备注不翻译。
    status: {
      available: '可借用',
      borrowed: '已借出',
    },
    filters: {
      all: '全部状态',
      status: '按状态筛选',
      clear: '清除筛选',
    },
    actions: {
      label: '操作',
      create: '新增设备',
      edit: '编辑 {{name}}',
      save: '保存',
      saving: '保存中…',
      cancel: '取消',
      retry: '重试',
      signIn: '重新登录',
    },
    empty: {
      title: '暂无设备',
      description: '添加第一台设备以开始记录。',
      noResults: '没有符合所选状态的设备。',
    },
    create: {
      title: '新增设备',
      description: '登记设备及其可借用状态。',
    },
    edit: {
      title: '编辑设备',
      description: '更新设备信息。',
    },
    form: {
      codePlaceholder: '例如 DEV-1001',
      namePlaceholder: '例如 ThinkPad T14',
      notesPlaceholder: '可选备注',
      codeRequired: '请输入设备编号。',
      nameRequired: '请输入设备名称。',
    },
    errors: {
      title: '无法加载设备',
      requestFailed: '请求失败，请重试。',
      forbidden: '您没有查看设备的权限。',
      sessionExpired: '登录状态已失效，请重新登录。',
      codeTaken: '该编号已被其他设备使用。',
      notFound: '该设备已不存在，请刷新列表后重试。',
      invalid: '请检查填写的内容后重试。',
      unknown: '请求失败，请重试。',
    },
  },
};

export default zhCN;
