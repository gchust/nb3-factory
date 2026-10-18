import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  // The application's copy; keep the same shape as `./en-US.ts`.
  actions: {
    ...systemZhCN.actions,
    create: '新建',
    saving: '保存中…',
    signInAgain: '重新登录',
  },
  navigation: {
    ...systemZhCN.navigation,
    devices: '设备',
  },
  'status.sessionExpired': '登录已过期，请重新登录后继续。',
  devices: {
    title: '设备',
    description: '管理团队可借用的设备。',
    capNotice: '仅显示前 {{count}} 台设备，请缩小筛选范围查看其余设备。',
    fields: {
      reference: '编号',
      name: '名称',
      status: '状态',
      remark: '备注',
      updatedAt: '更新时间',
    },
    status: {
      available: '可借用',
      borrowed: '已借出',
    },
    filters: {
      status: '状态',
      allStatuses: '全部状态',
      clear: '清除筛选',
    },
    create: {
      action: '新建设备',
      title: '新建设备',
      success: '已创建设备“{{name}}”。',
    },
    edit: {
      title: '编辑设备',
      success: '已保存设备“{{name}}”。',
    },
    form: {
      description: '编号和名称为必填项。状态表示设备当前是否可借用。',
      referenceRequired: '请输入编号。',
      referenceTooLong: '编号最多 {{max}} 个字符。',
      nameRequired: '请输入名称。',
      nameTooLong: '名称最多 {{max}} 个字符。',
      remarkTooLong: '备注最多 {{max}} 个字符。',
      referenceTaken: '已存在相同编号的设备。',
    },
    actions: {
      label: '操作',
      more: '查看 {{name}} 的更多操作',
      edit: '编辑',
    },
    empty: {
      title: '暂无设备',
      description: '添加第一台设备，开始管理团队可借用的设备。',
      noResults: '没有符合当前筛选条件的设备。',
    },
    error: {
      title: '无法加载设备',
      forbidden: '你没有查看设备的权限。',
      requestFailed: '出现问题，请重试。',
      notFound: '该设备已不存在。',
    },
  },
};

export default zhCN;
