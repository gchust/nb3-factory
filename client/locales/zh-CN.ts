import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  navigation: {
    ...systemZhCN.navigation,
    devices: '设备台账',
  },
  devices: {
    title: '设备台账',
    description: '记录可借用与已借出的设备，并按状态筛选台账。',
    loading: '正在加载设备…',
    fields: {
      code: '编号',
      name: '名称',
      status: '状态',
      actions: '操作',
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
    empty: {
      title: '暂无设备',
      description: '添加第一台设备以开始记录。',
      filtered: '该状态下暂无设备。',
    },
    create: {
      action: '新增设备',
      title: '新增设备',
      description: '向台账添加一台设备，编号必须唯一。',
      submit: '新增设备',
      success: '设备“{{name}}”已新增。',
    },
    edit: {
      actionFor: '编辑 {{name}}',
      title: '编辑设备',
      description: '更新设备名称或借用状态。',
      submit: '保存更改',
      success: '设备“{{name}}”已更新。',
    },
    actions: {
      cancel: '取消',
      saving: '保存中…',
    },
    form: {
      codeRequired: '请输入设备编号。',
      codeTooLong: '设备编号不能超过 64 个字符。',
      nameRequired: '请输入设备名称。',
      nameTooLong: '设备名称不能超过 100 个字符。',
      codeTaken: '该编号已被使用。',
    },
    error: {
      conflict: '该设备编号已被使用。',
      validation: '请检查填写内容是否符合要求。',
      sessionExpired: '登录已失效，请重新登录。',
      forbidden: '您没有管理设备的权限。',
      notFound: '该设备已不存在。',
      requestFailed: '无法完成设备请求，请稍后重试。',
      signIn: '重新登录',
      retry: '重试',
    },
  },
};

export default zhCN;
