import type { AppResource } from './en-US.js';

const zhCN: AppResource = {
  home: {
    title: '开始构建你的应用',
    description: '向 AI 助手描述你的需求，逐步构建页面、数据模型和业务流程。',
  },

  employees: {
    title: '员工档案',
    description: '维护员工信息及其名下的各类证件。',
    new: '新增员工',
    loading: '正在加载员工',
    empty: '暂无员工，先新增一位吧。',
    retry: '重试',
    form: {
      name: '姓名',
      employeeNo: '工号',
      department: '部门',
      saving: '正在保存…',
    },
    errors: {
      employeeNoTaken: '该工号已被使用。',
      invalidInput: '部分字段缺失或格式不正确。',
      notFound: '未找到对应的记录。',
      generic: '操作失败，请重试。',
    },
  },
  employeeDetail: {
    back: '返回员工列表',
    loading: '正在加载员工',
    retry: '重试',
    meta: '工号 {{employeeNo}} · {{department}}',
  },
  certificates: {
    title: '证件记录',
    add: '新增证件',
    empty: '暂无证件，先新增一条吧。',
    attachmentsEmpty: '暂无附件',
    expiresAt: '有效期至 {{date}}',
    noExpiry: '未填写有效期',
    delete: '删除证件 {{name}}',
    form: {
      name: '证件名称',
      expiresAt: '有效期至',
      attachments: '附件',
      saving: '正在上传…',
    },
  },

  appearance: {
    title: '外观',
    mode: '颜色模式',
    preset: '主题',
    light: '浅色',
    dark: '深色',
    system: '跟随系统',
    themes: { default: '默认', compact: '紧凑' },
  },
  app: {
    title: 'NocoBase',
  },
  actions: {
    close: '关闭',
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
    employees: '员工档案',
    open: '打开导航',
    close: '关闭导航',
    expand: '展开导航',
    collapse: '收起导航',
    label: '应用导航',
  },
};

export default zhCN;
