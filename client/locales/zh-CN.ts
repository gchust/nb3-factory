import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,

  // The session-ended alert (`client/components/session-expired-alert.tsx`).
  'status.sessionExpired': '登录状态已失效，请重新登录后继续。',
  actions: {
    ...systemZhCN.actions,
    create: '新建',
    saving: '保存中…',
    signInAgain: '重新登录',
  },
  navigation: {
    ...systemZhCN.navigation,
    devices: '设备台账',
  },
  // 设备台账：设备列表，含新建与编辑对话框。用户输入的编号和名称不做翻译，只有界面文案和固定状态会翻译。
  devices: {
    title: '设备台账',
    description:
      '台账中的全部设备，包含编号、名称以及当前是「可借用」还是「已借出」。',
    create: {
      title: '新建设备',
      action: '新建设备',
      success: '已创建设备「{{name}}」。',
    },
    edit: {
      title: '编辑设备',
      success: '已保存设备「{{name}}」。',
    },
    fields: {
      code: '编号',
      name: '名称',
      status: '状态',
    },
    form: {
      description: '每台设备有唯一的编号、名称和状态。',
      codeRequired: '请输入编号。',
      codeTooLong: '编号最多 {{max}} 个字符。',
      codeTaken: '该编号已被其他设备使用。',
      nameRequired: '请输入名称。',
      nameTooLong: '名称最多 {{max}} 个字符。',
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
    empty: {
      title: '暂无设备',
      description: '添加一台设备开始记录台账。',
      noResults: '没有符合该筛选条件的设备。',
    },
    error: {
      title: '无法加载设备',
      requestFailed: '出错了，请重试。',
      forbidden: '你没有查看设备的权限。',
      notFound: '该设备已不存在。',
    },
    capNotice: '仅显示前 {{count}} 台设备，请使用状态筛选缩小范围。',
    actions: {
      label: '操作',
      more: '「{{name}}」的操作',
      edit: '编辑',
    },
  },
};

export default zhCN;
