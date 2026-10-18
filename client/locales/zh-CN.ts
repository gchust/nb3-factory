import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  actions: {
    ...systemZhCN.actions,
    refresh: '刷新',
    retry: '重试',
    saving: '保存中…',
  },
  navigation: {
    ...systemZhCN.navigation,
    dashboard: '服务台',
    serviceDesk: '服务台',
    tickets: '工单',
    team: '服务团队',
  },
  dashboard: {
    title: '服务台',
    description:
      '今天需要处理的事项：待分配工单、超时工单，以及每位工程师的负载。',
    error: {
      title: '无法加载服务台',
      description: '服务台数据加载失败，请重试。',
    },
    roles: {
      employee: '员工',
      engineer: '工程师',
      'service-desk': '服务台',
    },
    metrics: {
      pending: {
        title: '待分配',
        description: '还没有工程师接手的工单。',
      },
      overdue: {
        title: '已超时',
        description: '超过 24 小时仍未解决。',
      },
      role: {
        title: '你的角色',
        description: '服务台允许你查看和操作的范围。',
      },
    },
    workload: {
      title: '工程师负载',
      description: '每位工程师处理中和已解决的工单数量。',
      empty: '暂无工程师',
      emptyDescription: '为成员分配工程师角色后，他们会显示在这里。',
      active: '处理中 {{count}}',
      resolved: '已解决 {{count}}',
    },
    pending: {
      title: '待分配',
      description: '已提交但还没有工程师的工单。',
      empty: '暂无待分配工单',
      emptyDescription: '所有工单都已分配工程师。',
      viewAll: '查看全部待分配工单',
    },
    overdue: {
      title: '已超时',
      description: '超过 24 小时仍未解决的工单。',
      empty: '暂无超时工单',
      emptyDescription: '所有未关闭工单都在提醒时限内。',
      viewAll: '查看全部工单',
    },
  },
  tickets: {
    title: '工单',
    description: '上报问题，或跟进你提交或负责的工单。',
    unassigned: '未分配',
    overdue: '已超时',
    status: {
      pending: '待处理',
      processing: '处理中',
      resolved: '已解决',
      closed: '已关闭',
    },
    urgency: {
      low: '低',
      medium: '中',
      high: '高',
      urgent: '紧急',
    },
    columns: {
      title: '问题',
      status: '状态',
      urgency: '紧急程度',
      requester: '提交人',
      assignee: '工程师',
      submitted: '提交时间',
    },
    search: {
      label: '搜索工单',
      placeholder: '按标题或描述搜索…',
    },
    filters: {
      allStatuses: '全部状态',
      statusLabel: '按状态筛选',
      allUrgencies: '全部紧急程度',
      urgencyLabel: '按紧急程度筛选',
      clear: '清除筛选',
    },
    empty: {
      title: '暂无工单',
      description: '有人上报问题后，工单会连同负责工程师和处理进度显示在这里。',
    },
    noResults: {
      title: '没有匹配的工单',
      description: '没有工单符合当前的搜索和筛选条件。',
    },
    error: {
      title: '无法加载工单',
      description: '工单列表加载失败，请重试。',
    },
    pagination: {
      summary: '第 {{first}}–{{last}} 条，共 {{total}} 条',
      previous: '上一页',
      next: '下一页',
    },
    create: {
      action: '新建工单',
      title: '上报问题',
      description: '描述出了什么问题、有多紧急，服务台会安排工程师处理。',
      submit: '提交工单',
      success: '工单已提交。',
      fields: {
        title: '摘要',
        titlePlaceholder: '用一句话描述问题',
        description: '问题详情',
        descriptionPlaceholder: '你当时在做什么、出了什么错、看到了什么提示。',
        urgency: '紧急程度',
        screenshots: '截图',
        screenshotsHelp: '最多可上传 20 张问题截图，可选。',
        addScreenshots: '添加截图',
        removeScreenshot: '移除 {{name}}',
      },
      errors: {
        required: '请填写摘要和问题详情。',
        failed: '工单提交失败，请重试。',
      },
    },
    detail: {
      title: '工单',
      description: '问题内容、处理进度，以及你可以执行的操作。',
      error: {
        title: '无法加载工单',
        description: '该工单加载失败，请重试。',
      },
      fields: {
        description: '问题详情',
        resolution: '解决方案',
        screenshots: '截图',
        submitted: '提交时间',
        updated: '更新时间',
        returnCount: '退回次数',
      },
      assign: {
        label: '分配给工程师',
        placeholder: '选择工程师',
        submit: '分配',
        success: '已分配工程师。',
        failed: '分配工程师失败，请重试。',
        noEngineers: '当前没有可分配的工程师。',
      },
      process: {
        label: '记录处理过程',
        placeholder: '你排查了什么、发现了什么、做了什么。',
        submit: '添加记录',
        success: '已记录处理过程。',
      },
      resolve: {
        label: '标记为已解决',
        placeholder: '问题是如何解决的。',
        submit: '标记已解决',
        success: '工单已解决。',
      },
      confirm: {
        action: '确认并关闭',
        success: '工单已关闭，谢谢。',
      },
      return: {
        label: '问题仍未解决',
        placeholder: '还有什么问题，方便工程师继续处理。',
        submit: '退回继续处理',
        success: '已退回给工程师。',
      },
      comment: {
        label: '添加评论',
        placeholder: '需要让服务台和工程师知道的信息。',
        submit: '评论',
        success: '评论已添加。',
      },
      errors: {
        failed: '操作失败，请重试。',
      },
      logs: {
        title: '处理记录',
        empty: '暂无记录。',
        system: '系统',
        kinds: {
          submit: '提交了工单',
          assign: '分配了工程师',
          process: '记录了处理过程',
          resolve: '标记为已解决',
          confirm: '确认关闭',
          return: '退回继续处理',
          comment: '发表了评论',
        },
      },
    },
  },
  team: {
    title: '服务团队',
    description: '可被分配工单的工程师及其负载。',
    empty: {
      title: '暂无工程师',
      description: '为成员分配工程师角色后，他们会出现在这里以供分配。',
    },
    error: {
      title: '无法加载服务团队',
      description: '工程师列表加载失败，请重试。',
    },
    columns: {
      name: '工程师',
      email: '邮箱',
      active: '处理中',
      resolved: '已解决',
    },
  },
};

export default zhCN;
