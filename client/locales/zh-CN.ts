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
    contracts: '合同档案',
    open: '打开导航',
    close: '关闭导航',
    expand: '展开导航',
    collapse: '收起导航',
    label: '应用导航',
  },
  contracts: {
    title: '合同档案',
    description: '管理合同及其附件，并按分类筛选查看。',
    newContract: '新建合同',
    newTitle: '新建合同',
    editTitle: '编辑合同',
    edit: '编辑',
    saving: '保存中…',
    empty: '暂无合同',
    actions: '操作',
    filter: { label: '分类', all: '全部分类' },
    categories: {
      procurement: '采购',
      sales: '销售',
      service: '服务',
    },
    fields: {
      name: '合同名称',
      counterparty: '签约对方',
      category: '合同分类',
      attachment: '合同附件',
    },
    attachment: {
      none: '未上传附件',
      view: '查看',
      download: '下载',
      remove: '移除附件',
      uploading: '上传中…',
      hint: '支持 PDF、图片或文本文件，单个不超过 5 MiB。',
    },
    errors: {
      CONTRACT_NAME_REQUIRED: '请填写合同名称。',
      CONTRACT_NAME_TOO_LONG: '合同名称不能超过 255 个字符。',
      CONTRACT_COUNTERPARTY_REQUIRED: '请填写签约对方。',
      CONTRACT_COUNTERPARTY_TOO_LONG: '签约对方不能超过 255 个字符。',
      CONTRACT_CATEGORY_INVALID: '合同分类不正确。',
      CONTRACT_ATTACHMENT_REQUIRED: '请先上传一份合同附件。',
      CONTRACT_ATTACHMENT_NOT_FOUND: '附件不存在或已失效，请重新上传。',
      CONTRACT_ATTACHMENT_IN_USE: '该附件已属于其他合同，请重新上传。',
      CONTRACT_ATTACHMENT_TYPE_NOT_ALLOWED: '附件仅支持 PDF、图片或文本文件。',
      CONTRACT_ATTACHMENT_TOO_LARGE: '附件不能超过 5 MiB。',
      CONTRACT_ATTACHMENT_FILE_REQUIRED: '请选择要上传的附件文件。',
      CONTRACT_NOT_FOUND: '合同不存在。',
      CONTRACT_ID_INVALID: '合同编号参数不正确。',
      CONTRACT_BODY_INVALID: '请求数据格式不正确。',
      INTERNAL_ERROR: '服务器内部错误，请稍后重试。',
    },
  },
};

export default zhCN;
