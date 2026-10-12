import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  navigation: {
    ...systemZhCN.navigation,
    tickets: '工单',
  },
  helpdesk: {
    unassigned: '未指派',
    workspace: {
      section: '服务台',
    },
    collections: {
      tickets: '工单',
      ticketComments: '工单评论',
      ticketAttachments: '工单附件',
    },
    status: {
      submitted: '已提交',
      assigned: '已指派',
      processing: '处理中',
      resolved: '已解决',
      closed: '已关闭',
    },
    priority: {
      low: '低',
      medium: '中',
      high: '高',
      urgent: '紧急',
    },
    fields: {
      title: '标题',
      description: '描述',
      category: '分类',
      priority: '优先级',
      status: '状态',
      reporter: '提交人',
      assignee: '处理人',
      screenshots: '截图',
      resolution: '解决方案',
      serviceDeskNote: '服务台备注',
      reopenReason: '退回原因',
      createdAt: '创建时间',
      updatedAt: '更新时间',
    },
    filters: {
      status: '按状态筛选',
      allStatuses: '全部状态',
    },
    dashboard: {
      title: '服务台',
      description: '服务台正在处理的工单、超时工单以及各工程师的负载。',
      stats: {
        pending: '待指派',
        overdue: '已超时',
        open: '处理中',
        resolved: '已解决',
        total: '总计',
      },
      workload: {
        title: '工程师负载',
        description: '每位工程师当前负责的未关闭工单。',
        empty: '当前没有已指派的未关闭工单。',
        count: '{{tickets}} 个处理中',
      },
      recent: {
        title: '最近工单',
        description: '你可查看的工单，按最近更新排序。',
      },
      error: {
        title: '无法加载服务台',
        unauthorized: '会话已失效，请重新登录后继续。',
        forbidden: '你没有访问服务台的权限。',
        requestFailed: '服务台加载失败，请重试。',
      },
    },
    tickets: {
      title: '工单',
      description: '提交问题、跟进处理进度并确认解决结果。',
      new: '新建工单',
      search: '搜索工单',
      empty: {
        title: '暂无工单',
        description: '没有匹配的工单，可通过“新建工单”报告新问题。',
      },
      error: {
        title: '无法加载工单',
        unauthorized: '会话已失效，请重新登录后继续。',
        forbidden: '你没有访问这些工单的权限。',
        requestFailed: '工单加载失败，请重试。',
      },
    },
    form: {
      create: {
        title: '新建工单',
        description: '请描述问题及其紧急程度。',
      },
      categoryPlaceholder: '例如：硬件、账号、网络',
      screenshots: {
        choose: '添加截图',
        remove: '移除',
        hint: '上传截图，便于服务台了解问题。',
        invalidImage:
          '该文件不是有效的图片，请上传 PNG、JPG、GIF、WebP 或 BMP 格式的截图。',
      },
      submit: '提交工单',
      submitting: '提交中…',
      error: {
        unauthorized: '会话已失效，请重新登录后继续。',
        requestFailed: '工单创建失败，请重试。',
      },
    },
    detail: {
      description: '问题描述',
      actions: '操作',
      actionsHint: '你当前可对此工单执行的操作。',
      comments: '留言',
      noComments: '暂无留言。',
      addComment: '添加留言',
      conflict: '该工单已被他人修改，请刷新页面后重试。',
      transitionFailed: '操作未能完成，请重试。',
      commentFailed: '留言添加失败，请重试。',
      notFound: {
        title: '未找到工单',
        description: '该工单不存在，或你的角色无法查看。',
      },
      error: {
        title: '无法加载工单',
        unauthorized: '会话已失效，请重新登录后继续。',
        requestFailed: '工单加载失败，请重试。',
      },
    },
    transition: {
      assign: {
        title: '指派工单',
        description: '选择负责处理该工单的工程师。',
        choose: '选择工程师',
      },
      start: {
        title: '开始处理',
        description: '通知提交人你已开始处理该工单。',
      },
      resolve: {
        title: '解决工单',
        description: '记录解决方案，并请提交人确认。',
      },
      confirm: {
        title: '确认解决',
        description: '问题已解决，关闭该工单。',
      },
      reopen: {
        title: '退回工单',
        description: '将工单退回给工程师继续处理。',
      },
    },
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
