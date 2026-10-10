import type { AppServerResource } from './en-US.js';

const zhCN: AppServerResource = {
  recordAccess: {
    viewable: '可见资料',
    viewableDescription: '可读取标记为非保密的资料。',
  },
  composite: {
    title: '内部资料',
    view: '读取资料',
    edit: '维护资料',
  },
  collection: {
    title: '资料',
  },
  ui: {
    section: '内部资料',
  },
  permissionSets: {
    colleague: '资料读者',
    supervisor: '资料主管',
  },
};

export default zhCN;
