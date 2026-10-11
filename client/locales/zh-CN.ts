import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  navigation: {
    ...systemZhCN.navigation,
    todos: '待办',
    schedules: '调度任务',
  },
  todos: {
    title: '待办',
    description:
      '待办在到期时间已过且仍未完成时被标记为“已过期”。该状态由“检查过期待办”调度任务写入；本页面只读取结果，并提供完成或重新打开的操作。',
    refresh: '刷新',
    loading: '正在加载待办',
    columns: {
      title: '标题',
      dueAt: '到期时间',
      status: '状态',
      actions: '操作',
    },
    status: {
      pending: '进行中',
      completed: '已完成',
      expired: '已过期',
    },
    action: {
      complete: '标记完成',
      reopen: '重新打开',
    },
    toast: {
      completed: '已将“{{title}}”标记为完成。',
      reopened: '已重新打开“{{title}}”。',
      failed: '更改未能保存。',
    },
    error: {
      title: '无法加载待办',
      deniedTitle: '无权访问',
      deniedDescription: '你没有查看待办的权限。',
      unknown: '发生未知错误。',
      retry: '重试',
    },
    empty: {
      title: '暂无待办',
      description: '应用数据库安装完成后，待办会显示在这里。',
    },
  },
  schedules: {
    title: '调度任务',
    description:
      '本应用定义的调度任务及其每次执行的记录。执行由内置调度器触发；本页面用于启用或停用任务并查看执行历史。',
    refresh: '刷新',
    loading: '正在加载调度任务',
    columns: {
      title: '任务',
      schedule: '执行周期',
      status: '状态',
      nextRunAt: '下次执行',
      runs: '执行统计',
      actions: '操作',
    },
    status: {
      enabled: '已启用',
      disabled: '已停用',
    },
    runs: {
      value: '共 {{runCount}} 次 · 成功 {{completedCount}} 次',
    },
    action: {
      viewRuns: '执行记录',
      enable: '启用',
      disable: '停用',
    },
    toast: {
      enabled: '已启用“{{title}}”。',
      disabled: '已停用“{{title}}”。',
      failed: '更改未能保存。',
    },
    occurrences: {
      title: '执行记录',
      description: '“{{title}}”的每次执行，最新的在前。',
      loading: '正在加载执行记录',
      columns: {
        status: '状态',
        startedAt: '开始时间',
        finishedAt: '结束时间',
        result: '执行结果',
      },
      empty: {
        title: '暂无执行记录',
        description: '任务下次执行后，记录会显示在这里。',
      },
      expiredCount: '标记 {{count}} 条待办为已过期',
    },
    occurrenceStatus: {
      pending: '等待中',
      running: '执行中',
      waiting: '处理中',
      succeeded: '成功',
      failed: '失败',
      skipped: '已跳过',
      cancelled: '已取消',
      timed_out: '已超时',
      triggered: '已触发',
    },
    error: {
      title: '无法加载调度任务',
      deniedTitle: '需要调度任务访问权限',
      deniedDescription: '你的账号没有调度任务访问权限，请联系管理员授予。',
      unknown: '发生未知错误。',
      retry: '重试',
    },
    empty: {
      title: '暂无调度任务',
      description: '本应用尚未定义任何调度任务。',
    },
  },
};

export default zhCN;
