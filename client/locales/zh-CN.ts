import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  actions: {
    ...systemZhCN.actions,
    create: '创建',
    saving: '保存中…',
    signInAgain: '重新登录',
  },
  'status.sessionExpired': '会话已结束，请重新登录后继续。',
  navigation: {
    ...systemZhCN.navigation,
    equipment: '设备台账',
  },
  equipment: {
    title: '设备台账',
    description: '办公室共用、可借出与归还的设备。',
    fields: {
      code: '编号',
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
      more: '“{{name}}”的更多操作',
      edit: '编辑',
    },
    create: {
      action: '添加设备',
      title: '添加设备',
      success: '已添加设备“{{name}}”',
    },
    edit: {
      title: '编辑设备',
      success: '已保存设备“{{name}}”',
    },
    form: {
      description: '填写设备编号、名称和状态。',
      codeRequired: '请输入设备编号',
      nameRequired: '请输入设备名称',
      codeTooLong: '最多 {{max}} 个字符',
      nameTooLong: '最多 {{max}} 个字符',
      notesTooLong: '最多 {{max}} 个字符',
      codeTaken: '该设备编号已被使用',
    },
    empty: {
      title: '暂无设备',
      description: '添加第一台设备，开始建立台账。',
      noResults: '没有符合筛选条件的设备',
    },
    error: {
      title: '设备加载失败',
      forbidden: '你没有使用设备台账的权限。',
      requestFailed: '请求失败，请重试。',
      notFound: '该设备不存在或已被删除。',
    },
  },
};

export default zhCN;
