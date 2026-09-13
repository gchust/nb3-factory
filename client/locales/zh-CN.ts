import type { AppResource } from './en-US.js';

const zhCN: AppResource = {
  home: {
    title: '开始构建你的应用',
    description: '向 AI 助手描述你的需求，逐步构建页面、数据模型和业务流程。',
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
    expenseClaims: '报销单据',
    open: '打开导航',
    close: '关闭导航',
    expand: '展开导航',
    collapse: '收起导航',
    label: '应用导航',
  },
  expenseClaims: {
    title: '报销单据',
    description: '登记每笔报销的事由、金额、发生日期和发票附件。',
    new: '新建报销单',
    loading: '正在加载报销单据…',
    loadFailed: '加载报销单据失败。',
    retry: '重试',
    empty: '暂无报销单据。',
    notFound: '未找到该报销单。',
    uploadFailed: '附件上传失败。',
    uploading: '正在上传…',
    saving: '正在保存…',
    submitFailed: '保存报销单失败。',
    reasonRequired: '请填写事由。',
    amountInvalid: '请填写大于 0 的金额。',
    dateRequired: '请选择发生日期。',
    attachmentsRequired: '请至少上传一张发票附件。',
    backToList: '返回报销单据',
    fields: {
      amount: '金额',
      date: '日期',
      attachments: '附件',
    },
    table: {
      reason: '事由',
      amount: '金额',
      date: '发生日期',
      attachments: '附件数',
    },
    form: {
      reason: '事由',
      reasonPlaceholder: '这笔费用的用途？',
      amount: '金额',
      amountPlaceholder: '0.00',
      date: '发生日期',
      attachments: '发票附件',
      attachmentsHint: '可一次选择多张图片或 PDF 发票，选择后立即上传。',
      removeAttachment: '移除 {{name}}',
    },
    attachments: {
      title: '发票附件',
      empty: '该报销单暂无附件。',
      download: '下载',
    },
  },
};

export default zhCN;
