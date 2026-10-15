import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  navigation: {
    ...systemZhCN.navigation,
    todos: '待办事项',
    scheduler: '定时任务',
  },
  todos: {
    title: '待办事项',
    description:
      '一个小列表，它的字段正是过期待办标记要读的内容：标题、截止时间、是否完成、是否过期。',
    new: '新建待办',
    rule: '定时任务会把所有未完成、且截止时间已过的待办标记为已过期。',
    viewSchedules: '查看定时任务',
    capNotice: '共 {{total}} 条待办，显示前 {{shown}} 条。',
    empty: {
      title: '暂无待办',
      description: '新建一条，然后观察定时任务把它标记为已过期。',
    },
    table: {
      title: '标题',
      dueAt: '截止时间',
      completed: '已完成',
      expired: '已过期',
      actions: '操作',
    },
    value: {
      completed: '已完成',
      open: '未完成',
      expired: '已过期',
      notExpired: '未过期',
    },
    actions: {
      complete: '标记为已完成',
      reopen: '重新打开',
    },
    form: {
      description: '填写标题和截止时间。截止时间是所选那一天的最后时刻。',
      title: '标题',
      titlePlaceholder: '需要做什么？',
      dueAt: '截止时间',
      titleRequired: '请输入标题。',
      titleTooLong: '最多 {{max}} 个字符。',
      dueAtRequired: '请选择截止时间。',
    },
    create: {
      title: '新建待办',
      submit: '创建',
      submitting: '创建中…',
      success: '已添加“{{title}}”。',
    },
    complete: {
      success: '已完成“{{title}}”。',
    },
    reopen: {
      success: '已重新打开“{{title}}”。',
    },
    error: {
      title: '出错了',
      requestFailed: '请求失败，请重试。',
      forbidden: '你没有执行该操作的权限。',
      sessionExpired: '会话已结束，请重新登录后继续。',
      notFound: '该待办已不存在。',
    },
  },
  scheduler: {
    title: '定时任务',
    description: '应用的定时任务：各自何时运行，以及最近几次运行的结果。',
    refresh: '刷新',
    enabled: '已启用',
    disabled: '已停用',
    enable: '启用',
    disable: '停用',
    enableSuccess: '已启用“{{title}}”。',
    disableSuccess: '已停用“{{title}}”。',
    actions: '“{{title}}”的操作',
    viewRuns: '查看运行记录',
    runsCount: '{{runCount}} 次运行 · {{completedCount}} 次成功',
    columnTitle: '任务',
    columnSchedule: '运行周期',
    columnStatus: '状态',
    columnNextRunAt: '下次运行',
    columnLastRunAt: '上次运行',
    columnRuns: '运行次数',
    columnActions: '操作',
    targetState: {
      ready: '目标正常',
      disabled: '目标已停用',
      missing: '目标缺失',
      invalid: '目标无效',
    },
    empty: {
      title: '暂无定时任务',
      description: '应用没有定义任何定时任务。',
    },
    error: {
      title: '无法加载定时任务',
      requestFailed: '请求失败，请重试。',
      forbidden: '你没有查看定时任务的权限。',
    },
    runs: {
      title: '“{{title}}”的运行记录',
      description: '最新的运行在前，包含每次运行的状态和记录的结果。',
      loading: '正在加载运行记录',
      failed: '无法加载运行记录',
      empty: '该定时任务还没有运行过。',
      more: '更早的运行记录未显示。',
      unfinished: '—',
      noResult: '没有记录结果。',
      columnStatus: '状态',
      columnStartedAt: '开始时间',
      columnFinishedAt: '结束时间',
      columnResult: '结果',
      status: {
        pending: '等待中',
        running: '运行中',
        waiting: '等待中',
        succeeded: '成功',
        failed: '失败',
        skipped: '已跳过',
        cancelled: '已取消',
        timed_out: '已超时',
        triggered: '已触发',
      },
    },
  },
};

export default zhCN;
