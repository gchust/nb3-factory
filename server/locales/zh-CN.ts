import type { AppServerResource } from './en-US.js';

const zhCN: AppServerResource = {
  helpdesk: {
    notifications: {
      assignedToEngineer: {
        title: '有工单指派给你',
        body: '“{{title}}”（{{priority}}优先级）已指派给你。',
      },
      assignedToReporter: {
        title: '你的工单已指派',
        body: '“{{title}}”已指派给 {{assignee}}。',
      },
      processingStarted: {
        title: '你的工单正在处理',
        body: '{{assignee}} 已开始处理“{{title}}”。',
      },
      resolved: {
        title: '你的工单已解决',
        body: '“{{title}}”已解决，请确认处理结果。',
      },
      reopened: {
        title: '工单已退回',
        body: '“{{title}}”被退回：{{reason}}',
      },
      confirmed: {
        title: '工单已确认',
        body: '“{{title}}”已确认并关闭。',
      },
      overdue: {
        title: '工单长时间未处理',
        body: '“{{title}}”（{{priority}}优先级）已超过 24 小时未解决。',
      },
    },
  },
};

export default zhCN;
