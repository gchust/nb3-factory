import type { AppResource } from './en-US.js';

const zhCN: AppResource = {
  home: {
    title: '预览冒烟',
    description:
      '用于确认预览环境可以登录并读写数据。卡片显示服务端提供的构建信息，访问计数保存在数据库中持续累加。',
    retry: '重试',
    buildInfo: {
      title: '构建信息',
      name: '应用名称',
      startedAt: '服务启动时间',
      nodeVersion: 'Node 版本',
      loading: '正在加载构建信息…',
      error: '无法加载构建信息。',
    },
    visits: {
      title: '访问计数',
      label: '累计访问次数',
      loading: '正在加载访问计数…',
      error: '无法加载访问计数。',
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
    open: '打开导航',
    close: '关闭导航',
    expand: '展开导航',
    collapse: '收起导航',
    label: '应用导航',
  },
};

export default zhCN;
