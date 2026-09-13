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
    resources: '资料中心',
    files: '文件列表',
    open: '打开导航',
    close: '关闭导航',
    expand: '展开导航',
    collapse: '收起导航',
    label: '应用导航',
  },
  resources: {
    title: '资料中心',
    description:
      '每条资料包含标题、分类和一张封面图，并附带一份可下载的资料文件。',
    new: '新建资料',
    createTitle: '新建资料',
    createDescription: '上传一张封面图和一份资料文件，然后保存。',
    loading: '正在加载资料',
    empty: '暂无资料。',
    loadError: '资料加载失败。',
    notFound: '该资料不存在。',
    noCover: '暂无封面',
    noDocument: '暂无资料文件。',
    save: '保存',
    saving: '保存中…',
    cancel: '取消',
    backToList: '返回资料中心',
    download: '下载',
    fields: {
      title: '标题',
      category: '分类',
      cover: '封面图',
      coverHint: '在资料列表中展示的小图片。',
      document: '资料文件',
      documentHint: '可下载的文档或 PDF 文件。',
    },
    placeholders: {
      title: '请输入标题',
      category: '请输入分类',
    },
    upload: {
      chooseCover: '选择封面图',
      chooseDocument: '选择资料文件',
      uploading: '上传中…',
      remove: '移除',
      failed: '上传失败，请重试。',
    },
    errors: {
      title: '请输入不超过 200 个字符的标题。',
      category: '请输入不超过 100 个字符的分类。',
      file: '附件不存在，请重新上传。',
      save: '资料保存失败。',
    },
  },
  files: {
    title: '文件列表',
    description: '资料中心里已上传的全部文件。',
    loading: '正在加载文件',
    empty: '暂无已上传的文件。',
    loadError: '文件加载失败。',
    download: '下载',
    units: {
      b: 'B',
      kb: 'KB',
      mb: 'MB',
      gb: 'GB',
    },
  },
};

export default zhCN;
