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
    discard: '放弃更改',
    signInAgain: '重新登录',
  },
  'status.sessionExpired': '登录状态已失效，请重新登录后继续。',
  devices: {
    title: '设备台账',
    description: '记录团队共享设备的编号、名称与状态。',
    search: {
      label: '搜索设备',
      placeholder: '按编号或名称搜索',
    },
    filters: {
      status: '按状态筛选',
      allStatuses: '全部状态',
      clear: '清除筛选',
    },
    fields: {
      code: '编号',
      name: '名称',
      status: '状态',
    },
    status: {
      available: '可借用',
      borrowed: '已借出',
    },
    actions: {
      label: '操作',
      more: '“{{name}}”的操作',
      edit: '编辑',
    },
    create: {
      action: '新建设备',
      title: '新建设备',
      success: '已添加设备“{{name}}”',
    },
    edit: {
      title: '编辑设备',
      success: '已保存设备“{{name}}”',
    },
    form: {
      description: '填写设备的编号、名称和状态。',
      codeRequired: '请输入设备编号',
      codeTooLong: '编号不能超过 {{max}} 个字符',
      nameRequired: '请输入设备名称',
      nameTooLong: '名称不能超过 {{max}} 个字符',
      codeTaken: '该编号已被其他设备使用',
    },
    empty: {
      title: '暂无设备',
      description: '添加第一台设备，开始建立台账。',
      noResults: '没有符合筛选条件的设备',
    },
    error: {
      title: '无法加载设备',
      notFound: '该设备不存在或已被删除。',
      forbidden: '你没有查看设备的权限，请联系管理员获取权限。',
      requestFailed: '请求失败，请重试。',
    },
    capNotice: '仅显示前 {{count}} 台设备，请使用搜索或筛选缩小范围。',
  },
};

export default zhCN;
