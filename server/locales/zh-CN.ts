import type { AppServerResource } from './en-US.js';

const zhCN: AppServerResource = {
  documents: {
    title: '文档',
    section: '文档',
    administration: {
      title: '文档管理',
      section: '文档管理',
    },
    actions: {
      view: '查看文档',
      create: '创建文档',
      edit: '编辑文档',
      delete: '删除文档',
    },
    permissions: {
      view: '查看文档',
      create: '创建文档',
      update: '更新文档',
      delete: '删除文档',
    },
    roles: {
      admin: '文档管理员',
      maintainer: '文档维护者',
      reader: '文档读者',
    },
    restriction: {
      nonConfidential: '仅限非机密文档',
    },
    recordAccess: {
      ownOrPublished: '自己的文档或已发布的公开文档',
      ownOrPublishedDescription: '本人拥有的文档，以及已发布且非机密的文档。',
      publishedPublic: '已发布的公开文档',
      publishedPublicDescription: '已发布且非机密的文档。',
      nonConfidential: '非机密文档',
      nonConfidentialDescription: '所有未标记为机密的文档。',
    },
  },
};

export default zhCN;
