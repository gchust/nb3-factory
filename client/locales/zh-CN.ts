import type { AppResource } from './en-US.js';

const zhCN: AppResource = {
  home: {
    title: '开始构建你的应用',
    description: '向 AI 助手描述你的需求，逐步构建页面、数据模型和业务流程。',
  },

  announcements: {
    title: '公告',
    description: '在这里向团队发布动态，最新创建的公告显示在最前面。',
    form: {
      heading: '新建公告',
      titleLabel: '标题',
      titlePlaceholder: '一句话概括',
      bodyLabel: '正文',
      bodyPlaceholder: '输入公告正文…',
      submit: '发布',
      submitting: '发布中…',
    },
    list: {
      heading: '已发布的公告',
      empty: '暂无公告，发布第一条吧。',
      loading: '正在加载公告',
      created: '创建于 {{date}}',
    },
    error: {
      load: '无法加载公告。',
      create: '无法发布公告。',
      titleRequired: '请输入标题。',
      titleTooLong: '标题请控制在 200 个字符以内。',
      bodyRequired: '请输入正文。',
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
    announcements: '公告',
    open: '打开导航',
    close: '关闭导航',
    expand: '展开导航',
    collapse: '收起导航',
    label: '应用导航',
  },
};

export default zhCN;
