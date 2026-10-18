import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  actions: {
    ...systemZhCN.actions,
    saving: '保存中…',
  },
  navigation: {
    ...systemZhCN.navigation,
    tickets: '报修工单',
    inbox: '收件箱',
    team: '团队',
  },
  dashboard: {
    title: 'IT 服务台',
    description: '查看待指派、超时未处理的工单，以及每位工程师的负载。',
    counts: '工单数量',
    viewAll: '查看全部工单',
    error: {
      load: '无法加载首页数据，请重试。',
    },
    pendingAssignment: {
      title: '待指派',
      description: '还没有工程师处理的工单。',
      empty: '暂无待指派工单。',
    },
    overdue: {
      title: '超过 24 小时未解决',
      description: '超过一天没有进展的工单。',
      empty: '暂无超时工单。',
    },
    workload: {
      title: '工程师负载',
      description: '每位工程师当前处理的未关闭工单。',
      empty: '暂无工程师有待处理工单。',
      open: '{{count}} 个处理中',
    },
  },
  tickets: {
    title: '报修工单',
    description: '提交问题并跟踪处理进展。你能看到的范围取决于你的角色。',
    report: '提交报修',
    filter: {
      status: '状态',
      urgency: '紧急程度',
      search: '搜索标题或描述',
      apply: '搜索',
      allStatuses: '全部状态',
      allUrgencies: '全部紧急程度',
    },
    status: {
      pending: '待指派',
      processing: '处理中',
      resolved: '待确认',
      closed: '已关闭',
    },
    urgency: {
      normal: '普通',
      urgent: '紧急',
      critical: '非常紧急',
    },
    empty: {
      title: '暂无工单',
      description: '没有符合当前筛选条件的工单。',
    },
    pagination: {
      summary: '第 {{page}} / {{total}} 页 · 共 {{count}} 条',
      previous: '上一页',
      next: '下一页',
    },
    field: {
      title: '标题',
      description: '问题描述',
      urgency: '紧急程度',
      screenshots: '截图',
      chooseScreenshots: '添加截图',
      noScreenshots: '暂无截图',
      screenshotsHint: '最多 10 张图片，每张不超过 10 MB。',
      reporter: '报修人',
      assignee: '处理工程师',
      unassigned: '未指派',
      chooseEngineer: '选择工程师',
      createdAt: '提交时间',
      statusChangedAt: '最近状态变更',
      handling: '处理情况',
      handlingNote: '处理过程',
      solution: '解决方案',
      lastReturnReason: '退回原因',
      history: '历史记录',
      empty: '暂无记录。',
    },
    create: {
      title: '提交报修',
      description: '描述问题并附上截图，服务台会指派工程师处理。',
      required: '标题和问题描述为必填项。',
      success: '工单 #{{id}} 已创建。',
      failed: '创建工单失败，请重试。',
      submitting: '提交中…',
    },
    action: {
      success: '操作成功。',
      failed: '操作失败，请重试。',
      wrongState: '当前状态不支持该操作。',
    },
    transition: {
      assign: '指派',
      reassign: '重新指派',
      progress: '记录处理过程',
      resolve: '标记已解决',
      confirm: '确认并关闭',
      return: '退回继续处理',
      remind: '提醒服务台',
    },
    dialog: {
      description: '该操作会记录在工单中。',
      required: '请填写后再继续。',
      assign: {
        title: '指派工程师',
        description: '被指派的工程师会收到通知并开始处理。',
      },
      reassign: {
        title: '重新指派工单',
        description: '新的工程师会收到通知。',
      },
      progress: {
        title: '记录处理过程',
        description: '记录目前已经做了哪些处理。',
      },
      resolve: {
        title: '填写解决方案',
        description: '报修人会收到通知，并确认是否解决或退回继续处理。',
      },
      return: {
        title: '退回继续处理',
        description: '请说明问题尚未解决的原因。',
      },
    },
    detail: {
      notFound: '未找到该工单',
      backToList: '返回工单列表',
    },
    error: {
      load: '无法加载工单，请重试。',
    },
    team: {
      title: '团队',
      description: '创建账号，并为成员分配服务台或工程师角色。',
      members: '成员',
      field: {
        name: '姓名',
        username: '用户名（可选）',
        email: '邮箱',
        password: '密码',
        roles: '角色',
      },
      create: {
        title: '添加成员',
        submit: '创建账号',
        required: '姓名、邮箱和密码为必填项。',
        failed: '创建账号失败，请重试。',
        success: '账号已创建。',
      },
      roles: {
        success: '角色已更新。',
        failed: '更新角色失败，请重试。',
      },
      error: {
        load: '无法加载团队成员，请重试。',
      },
    },
  },
};

export default zhCN;
