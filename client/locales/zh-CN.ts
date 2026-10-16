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
    saving: '保存中…',
    signInAgain: '重新登录',
  },
  'status.sessionExpired': '登录状态已过期，请重新登录后继续。',
  devices: {
    title: '设备台账',
    description: '台账中的全部设备，包含设备编号以及是否可借用。',
    fields: {
      code: '编号',
      name: '名称',
      status: '状态',
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
    create: {
      action: '新建设备',
      title: '新建设备',
      success: '已添加设备“{{name}}”。',
    },
    edit: {
      title: '编辑设备',
      success: '已保存设备“{{name}}”。',
    },
    actions: {
      label: '操作',
      edit: '编辑 {{name}}',
    },
    form: {
      description: '设备记录其编号、名称和状态。',
      codeRequired: '请输入设备编号。',
      codeTooLong: '设备编号最多 {{max}} 个字符。',
      codeTaken: '已有其他设备使用该编号。',
      nameRequired: '请输入设备名称。',
      nameTooLong: '设备名称最多 {{max}} 个字符。',
    },
    empty: {
      title: '暂无设备',
      description: '添加第一台设备以开始使用台账。',
      noResults: '没有符合该筛选条件的设备。',
    },
    error: {
      title: '无法加载设备',
      forbidden: '你没有查看设备的权限。',
      requestFailed: '请求失败，请重试。',
      notFound: '该设备不存在或已被删除。',
    },
    capNotice: '仅显示前 {{count}} 台设备，可按状态筛选以缩小范围。',
  },
};

export default zhCN;
