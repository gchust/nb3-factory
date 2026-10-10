import type { AppServerResource } from './en-US.js';

const zhCN: AppServerResource = {
  knowledge: {
    section: '内部资料',
    collection: { documents: '资料' },
    resource: { documents: '资料' },
    action: {
      documents: { read: '查看', manage: '编辑' },
    },
    data: {
      documents: { read: '查看资料', manage: '编辑资料' },
    },
    recordAccess: { publicDocuments: '所有人可读的资料' },
    permissionSet: {
      supervisor: '资料主管',
      colleague: '资料读者',
    },
  },
};

export default zhCN;
