import type { AppServerResource } from './en-US.js';

const zhCN: AppServerResource = {
  library: {
    permissionSets: {
      librarian: '文档管理员',
      reader: '读者',
    },
    recordAccess: {
      visible: '已发布文档和本人文档',
      visibleDescription: '已发布且不保密的文档，以及当前用户自己创建的文档。',
    },
    resources: {
      documents: '文档',
      documentsDescription: '文档库中的文档及其可见性设置。',
    },
    settings: {
      title: '文档库设置',
      read: '查看设置',
      update: '修改设置',
    },
    sections: {
      library: '文档库',
      documents: '文档',
      administration: '管理',
    },
    scopes: {
      documents: '文档范围',
    },
    actions: {
      view: '查看',
      create: '新建',
      edit: '编辑',
      delete: '删除',
    },
  },
};

export default zhCN;
