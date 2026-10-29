import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  navigation: {
    ...systemZhCN.navigation,
    todos: '待办事项',
    schedules: '调度任务',
  },
  todos: {
    title: '待办事项',
    description:
      '“检查过期待办” 调度任务所处理的种子数据。是否过期由调度任务标记，而不是本页面。',
    empty: '暂无待办事项。',
    dueAt: '截止时间 {{value}}',
    status: {
      completed: '已完成',
      pending: '未完成',
      expired: '已过期',
    },
    action: {
      markCompleted: '标记为已完成',
      markPending: '标记为未完成',
    },
    error: {
      failed: '无法加载或更新待办事项，请重试。',
    },
  },
  schedules: {
    title: '调度任务',
    description:
      '本应用定义的定时任务、它们的下次运行时间，以及此前每次运行的执行结果。',
    empty: '暂无调度任务。',
    field: {
      cron: '调度周期',
      key: '标识',
      nextRunAt: '下次运行',
      lastRunAt: '上次运行',
      runCount: '运行次数',
      runCountValue: '共 {{runs}} 次，成功 {{succeeded}} 次',
    },
    status: {
      enabled: '已启用',
      disabled: '已停用',
    },
    targetState: {
      ready: '就绪',
      disabled: '目标已停用',
      missing: '目标缺失',
      invalid: '目标无效',
    },
    action: {
      enable: '启用',
      disable: '停用',
      showOccurrences: '执行结果',
      hideOccurrences: '收起结果',
    },
    occurrences: {
      title: '执行结果',
      empty: '该调度任务尚未运行。',
      result: '已标记 {{value}} 条过期',
      noResult: '无结果',
    },
    occurrenceStatus: {
      pending: '等待中',
      running: '运行中',
      waiting: '等待中',
      triggered: '已触发',
      succeeded: '成功',
      skipped: '已跳过',
      failed: '失败',
      cancelled: '已取消',
      timed_out: '超时',
    },
    error: {
      failed: '无法加载或更新调度任务，请重试。',
      occurrencesFailed: '无法加载执行结果，请重试。',
    },
  },
};

export default zhCN;
