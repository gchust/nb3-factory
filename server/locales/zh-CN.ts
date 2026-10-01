import type { AppServerResource } from './en-US.js';

const zhCN: AppServerResource = {
  service: {
    notification: {
      overdue: {
        title: '工单 {{code}} 已逾期',
        body: '请尽快处理逾期工单。',
      },
      inspectionAssigned: {
        title: '新的巡检任务',
        body: '设备 {{device}} 已到巡检日期，请在 {{date}} 完成巡检。',
      },
    },
  },
};

export default zhCN;
