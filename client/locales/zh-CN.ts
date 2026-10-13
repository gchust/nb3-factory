import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  navigation: {
    ...systemZhCN.navigation,
    todos: '待办',
    schedules: '调度',
  },
  todos: {
    title: '待办',
    description:
      '所有待办，以及“检查过期待办”调度是否已将其标记为超过截止时间。',
    refresh: '刷新',
    columns: {
      title: '标题',
      dueAt: '截止时间',
      completed: '已完成',
      overdue: '已过期',
    },
    completed: '已完成',
    pending: '未完成',
    overdue: '已过期',
    onTime: '未过期',
    empty: '暂无待办',
    emptyDescription:
      '示例待办随数据库一起载入；表中已有的记录都会显示在这里。',
    errorTitle: '无法加载待办',
    errorDescription: '请求失败，请刷新重试。',
  },
  schedules: {
    title: '调度',
    description: '本应用运行的定时任务，以及每次执行的结果。',
    refresh: '刷新',
    columns: {
      name: '名称',
      schedule: '调度',
      status: '状态',
      nextRun: '下次运行',
      runs: '运行次数',
      actions: '操作',
    },
    status: {
      enabled: '已启用',
      disabled: '已停用',
      missing: '不可用',
      invalid: '无效',
    },
    never: '未计划',
    runs: '{{completed}} / {{total}}',
    enable: '启用',
    disable: '停用',
    executionResults: '执行结果',
    noExecutions: '该调度尚未运行。',
    actionFailed: '无法修改该调度。',
    empty: '暂无调度',
    emptyDescription: '本应用未定义任何定时任务。',
    errorTitle: '无法加载调度',
    errorDescription: '请求失败，请刷新重试。',
    actionsFor: '{{title}} 的操作',
    definitions: {
      markOverdueTodos: '检查过期待办',
    },
    targets: {
      markOverdueTodos: '检查过期待办',
    },
    occurrences: {
      status: '状态',
      startedAt: '开始时间',
      detail: '详情',
      noDetail: '无详情',
    },
    occurrenceStatus: {
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
};

export default zhCN;
