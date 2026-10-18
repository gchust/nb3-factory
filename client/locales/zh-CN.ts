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
      '一个最小的只读列表。“检查过期待办”定时任务会把已到期且未完成的记录标记为过期。',
    capNotice: '仅显示前 {{count}} 条匹配的待办。',
    fields: {
      title: '标题',
      dueAt: '到期时间',
      completed: '已完成',
      overdue: '已过期',
    },
    status: {
      completed: '已完成',
      open: '未完成',
      overdue: '已过期',
      onTime: '未过期',
    },
    empty: {
      title: '暂无待办',
      description: '尚未记录任何待办。',
    },
    error: {
      title: '无法加载待办',
      requestFailed: '请求失败，请重试。',
      sessionExpired: '登录状态已失效，请重新登录后继续。',
    },
  },
  scheduler: {
    title: '定时任务',
    description: '本应用定义的定时计划，以及每次执行的历史记录。',
    enabled: '已启用',
    disabled: '已停用',
    targetState: {
      ready: '就绪',
      disabled: '已停用',
      missing: '缺失',
      invalid: '无效',
    },
    fields: {
      title: '计划',
      cron: 'Cron 表达式',
      timezone: '时区',
      enabled: '启用状态',
      targetState: '执行目标',
      targetType: '目标类型',
      nextRunAt: '下次执行',
      lastRunAt: '上次执行',
      runCount: '执行次数',
      completedCount: '成功次数',
    },
    actions: {
      label: '操作',
      viewOccurrences: '执行记录',
      enable: '启用',
      disable: '停用',
      rowLabel: '“{{title}}”的操作',
      enableSuccess: '已启用“{{title}}”',
      disableSuccess: '已停用“{{title}}”',
      toggleFailed: '未能更改计划，请重试。',
      disableConfirmTitle: '停用“{{title}}”？',
      disableConfirmDescription:
        '计划将停止按计划执行。执行历史会保留，之后可以重新启用。',
    },
    empty: {
      title: '暂无定时任务',
      description: '本应用未定义任何定时计划。',
    },
    error: {
      title: '无法加载定时任务',
      requestFailed: '请求失败，请重试。',
    },
    detail: {
      breadcrumb: '执行记录',
      title: '定时任务',
      description: '该计划及其执行历史。',
      notFound: '该计划已不存在。',
    },
    occurrences: {
      title: '执行记录',
      empty: '该计划尚未执行。首次触发后会在此生成一条记录。',
      error: '无法加载执行历史。',
      loadMore: '加载更多',
      updatedCount: '已标记 {{count}} 条过期',
      fields: {
        status: '状态',
        startedAt: '开始时间',
        finishedAt: '结束时间',
        executionCount: '尝试次数',
        result: '执行结果',
      },
    },
    occurrenceStatus: {
      pending: '等待中',
      running: '执行中',
      waiting: '等待中',
      succeeded: '成功',
      failed: '失败',
      skipped: '已跳过',
      cancelled: '已取消',
      timed_out: '超时',
      triggered: '已触发',
    },
  },
};

export default zhCN;
