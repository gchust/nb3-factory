import type { AppResource } from './en-US.js';

const zhCN: AppResource = {
  app: {
    title: 'NocoBase',
  },
  actions: {
    save: '保存',
    cancel: '取消',
    confirm: '确认',
    language: '语言',
  },
  account: {
    openMenu: '打开账户菜单',
    fallback: '账户',
    signOut: '退出登录',
    signingOut: '正在退出…',
  },
  navigation: {
    home: '首页',
    open: '打开导航',
    close: '关闭导航',
    expand: '展开导航',
    collapse: '收起导航',
    label: '应用导航',
  },
  equipment: {
    navigation: {
      equipment: '设备台账',
      borrowRecords: '借用记录',
    },
    home: {
      title: '设备借用看板',
      description: '办公设备借用与归还',
      stats: {
        total: '设备总数',
        available: '可借用',
        borrowed: '已借出',
        repairing: '维修中',
        activeBorrows: '进行中的借用',
      },
      browseEquipment: '浏览设备台账',
      viewBorrowRecords: '查看借用记录',
    },
    list: {
      title: '设备台账',
      subtitle: '办公设备台账',
      create: '新增设备',
      empty: '还没有登记任何设备。',
      searchPlaceholder: '按名称或资产编号搜索…',
    },
    records: {
      title: '借用记录',
      subtitle: '借用与归还历史',
      empty: '还没有借用记录。',
    },
    fields: {
      name: '名称',
      assetNumber: '资产编号',
      category: '类别',
      status: '状态',
      description: '描述',
      borrower: '借用人',
      borrowedAt: '借用时间',
      returnedAt: '归还时间',
      note: '备注',
      state: '状态',
      actions: '操作',
    },
    status: {
      available: '可借用',
      borrowed: '已借出',
      repairing: '维修中',
    },
    recordState: {
      open: '已借出',
      returned: '已归还',
    },
    actions: {
      edit: '编辑',
      delete: '删除',
      borrow: '借用',
      return: '归还',
      confirmDelete: '确定删除该设备？',
      confirmDeleteHint: '有借用历史的设备无法删除。',
    },
    dialog: {
      createTitle: '新增设备',
      editTitle: '编辑设备',
      borrowTitle: '借用设备',
      borrowEquipmentLabel: '设备',
      borrowNotePlaceholder: '用途或备注（可选）',
      statusHint: '设备状态会随借出与归还自动变更。',
    },
    errors: {
      loadFailed: '加载设备列表失败。',
      loadRecordsFailed: '加载借用记录失败。',
      createFailed: '新增设备失败。',
      updateFailed: '保存设备失败。',
      deleteFailed: '删除设备失败。',
      borrowFailed: '登记借用失败。',
      returnFailed: '登记归还失败。',
      unavailable: '该设备当前不可借用。',
      unexpected: '操作失败，请稍后重试。',
    },
    toasts: {
      created: '设备已新增。',
      updated: '设备已保存。',
      deleted: '设备已删除。',
      borrowed: '借用已登记。',
      returned: '归还已登记。',
    },
  },
};

export default zhCN;
