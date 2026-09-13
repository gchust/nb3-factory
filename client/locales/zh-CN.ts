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
    products: '产品图册',
    open: '打开导航',
    close: '关闭导航',
    expand: '展开导航',
    collapse: '收起导航',
    label: '应用导航',
  },

  products: {
    title: '产品图册',
    description: '管理产品、产品简介与产品图片。',
    newProduct: '新建产品',
    empty: '暂无产品，先创建一个吧。',
    edit: '编辑',
    save: '保存产品',
    backToList: '返回产品图册',
    pages: {
      newTitle: '新建产品',
      editTitle: '编辑产品',
    },
    fields: {
      name: '产品名称',
      description: '产品简介',
      images: '产品图片',
    },
    form: {
      chooseImages: '选择图片',
      imagesHint:
        '可一次选择多张图片，第一张作为列表缩略图；单张不超过 5 MiB。',
    },
    files: {
      choose: '选择文件',
      empty: '暂无图片。',
      preview: '查看大图',
      download: '下载',
      remove: '移除',
      retry: '重试',
      done: '已上传',
      uploading: '上传中…',
      pending: '等待中',
      failed: '上传失败',
      cancel: '取消上传',
      previous: '上一张',
      next: '下一张',
      tooMany: '已达到图片数量上限。',
      typeNotAllowed: '不支持该文件类型。',
      urlNotAllowed: '图片地址不合法。',
      removeFailed: '移除图片失败。',
      uploadFailed: '图片上传失败。',
      loading: '正在加载预览…',
      loadFailed: '图片加载失败。',
      downloadFile: '下载图片',
      previewUnavailable: '该文件类型暂不支持预览。',
      officeFailed: '无法预览该办公文档。',
      officeRequiresUrl: '预览办公文档需要可公网访问的地址。',
    },
    errors: {
      INTERNAL_ERROR: '服务器开小差了，请稍后重试。',
      PRODUCT_NOT_FOUND: '产品不存在。',
      PRODUCT_NAME_REQUIRED: '产品名称不能为空。',
      PRODUCT_ID_INVALID: '产品编号参数不正确。',
      PRODUCT_VALUES_REQUIRED: '产品数据不能为空。',
      PRODUCT_BODY_INVALID: '请求数据格式不正确。',
      PRODUCT_IMAGE_NOT_FOUND: '所选图片不存在或已失效，无法保存。',
      PRODUCT_IMAGE_IN_USE:
        '部分图片已属于其他产品，一张图片只能归属一个产品。',
      PRODUCT_FILE_TOO_LARGE: '单个文件不能超过 5 MiB。',
    },
  },
};

export default zhCN;
