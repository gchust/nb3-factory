import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  navigation: {
    ...systemZhCN.navigation,
    todos: '待办',
    schedules: '计划任务',
  },
  todos: {
    title: '待办',
    description: '全部待办，以及它们是否已完成或被计划任务标记为已过期。',
    refresh: '刷新',
    loading: '正在加载待办',
    loadErrorTitle: '待办加载失败',
    loadErrorDescription: '加载待办列表时出错，请重试。',
    retry: '重试',
    emptyTitle: '暂无待办',
    emptyDescription: '有待办后会显示在这里。',
    columns: {
      title: '标题',
      dueAt: '截止时间',
      completed: '已完成',
      expired: '已过期',
    },
    completed: { yes: '已完成', no: '未完成' },
    expired: { yes: '已过期', no: '未过期' },
  },
  schedules: {
    title: '计划任务',
    description: '本应用的全部计划任务、启用状态，以及最近几次执行的结果。',
    refresh: '刷新',
    loading: '正在加载计划任务',
    loadErrorTitle: '计划任务加载失败',
    loadErrorDescription: '加载计划任务列表时出错，请重试。',
    retry: '重试',
    enabled: '已启用',
    disabled: '已停用',
    inactive: '定义已移除',
    enable: '启用',
    disable: '停用',
    never: '从未',
    definitions: {
      todosCheckExpired: {
        title: '检查过期待办',
        description:
          '将截止时间已过且未完成的待办标记为已过期；已完成和尚未到期的待办不受影响。',
      },
    },
    targets: {
      todosMarkExpired: '检查过期待办',
    },
    fields: {
      cron: 'Cron',
      timezone: '时区',
      nextRunAt: '下次执行',
      lastRunAt: '上次执行',
      runCount: '执行次数',
      target: '任务',
    },
    executions: {
      title: '最近执行',
      empty: '该计划任务尚未执行。',
      status: '状态',
      startedAt: '开始时间',
      finishedAt: '结束时间',
      result: '结果',
    },
    status: {
      pending: '等待中',
      running: '执行中',
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
