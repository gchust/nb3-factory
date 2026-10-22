import type { AppServerResource } from './en-US.js';

const zhCN: AppServerResource = {
  helpdesk: {
    notifications: {
      assigned: {
        title: '新的服务台工单已分派',
        body: '工单 {{ticketNo}}（{{priority}}）“{{title}}”已分派给您。',
      },
      reassigned: {
        title: '服务台工单已重新分派',
        body: '工单 {{ticketNo}}（{{priority}}）“{{title}}”已分派给您。',
      },
      progress: {
        title: '服务台工单有新进展',
        body: '工单 {{ticketNo}}“{{title}}”：{{note}}',
      },
      resolved: {
        title: '您的服务台工单已解决',
        body: '工单 {{ticketNo}} 已解决：{{resolution}}',
      },
      returned: {
        title: '解决方案被退回',
        body: '工单 {{ticketNo}} 已被退回继续处理：{{reason}}',
      },
      closed: {
        title: '服务台工单已关闭',
        body: '工单 {{ticketNo}}“{{title}}”已确认并关闭。',
      },
      overdue: {
        title: '服务台工单已超时',
        body: '工单 {{ticketNo}}“{{title}}”处理时间已超过 {{hours}} 小时。',
      },
    },
  },
};

export default zhCN;
