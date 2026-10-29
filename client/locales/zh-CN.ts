import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  navigation: {
    ...systemZhCN.navigation,
    devices: '设备',
  },
  devices: {
    title: '设备台账',
    description: '团队共用的一份设备记录，所有已登录成员看到同一份清单。',
    add: '添加设备',
    addTitle: '添加设备',
    editTitle: '编辑设备',
    formDescription: '设备编号和名称会按录入内容原样保存，不受界面语言影响。',
    code: '设备编号',
    name: '设备名称',
    status: '状态',
    actions: '操作',
    editDevice: '编辑{{name}}',
    filterStatus: '按状态筛选',
    allStatuses: '全部状态',
    available: '可借用',
    borrowed: '已借出',
    empty: '暂无设备。',
    emptyFiltered: '没有此状态的设备。',
    loading: '正在加载设备…',
    codeRequired: '请输入设备编号。',
    nameRequired: '请输入设备名称。',
    duplicateCode: '该设备编号已被使用，请换一个编号。',
    invalidInput: '请检查设备编号和名称后重试。',
    notFound: '该设备已不存在，请刷新列表。',
    loadFailed: '设备列表加载失败，请重试。',
    retry: '重试',
    saveFailed: '设备保存失败，请重试。',
    created: '已添加设备{{name}}。',
    saved: '已保存设备{{name}}。',
    save: '保存',
    saving: '正在保存…',
    cancel: '取消',
  },
};

export default zhCN;
