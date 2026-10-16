import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  navigation: {
    ...systemZhCN.navigation,
    todos: '待办',
    schedules: '调度计划',
    settings: '设置',
  },
  todos: {
    title: '待办',
    description:
      '本应用的待办列表。截止时间已过且未完成的待办，由“检查过期待办”计划任务标记为已过期。',
    refresh: '刷新',
    column: {
      title: '标题',
      dueAt: '截止时间',
      completed: '已完成',
      expired: '已过期',
    },
    yes: '是',
    no: '否',
    empty: '暂无待办',
    emptyDescription: '列表中还没有任何记录。',
    loadFailed: '待办加载失败，请重试。',
  },
  settings: {
    title: '设置',
    description: '配置本应用的运行方式。',
    scheduledTasks: {
      title: '定时任务',
      description: '启用或停用任务。更改立即生效，并由调度器保存。',
      empty: '暂无定时任务。',
      loadFailed: '定时任务加载失败，请重试。',
    },
  },
  schedules: {
    title: '调度计划',
    description: '本应用的定时任务，以及每个任务的执行记录入口。',
    refresh: '刷新',
    column: {
      title: '计划名称',
      status: '启用状态',
      results: '执行记录',
    },
    enabled: '已启用',
    disabled: '已停用',
    toggle: '启用或停用{{title}}',
    enabledToast: '已启用“{{title}}”',
    disabledToast: '已停用“{{title}}”',
    disable: '停用',
    disableConfirmTitle: '停用“{{title}}”？',
    disableConfirmDescription: '停用后该计划任务将不再运行，直到重新启用。',
    toggleFailed: '更改计划状态失败，请重试。',
    viewResults: '查看执行记录',
    empty: '暂无调度计划',
    emptyDescription: '当前没有注册任何计划任务。',
    loadFailed: '调度计划加载失败，请重试。',
    status: {
      pending: '等待中',
      running: '运行中',
      waiting: '等待中',
      succeeded: '已完成',
      failed: '失败',
      skipped: '已跳过',
      cancelled: '已取消',
      timed_out: '已超时',
      triggered: '已触发',
    },
    occurrences: {
      title: '执行记录',
      description: '“{{title}}”最近的执行记录。',
      column: {
        startedAt: '开始时间',
        status: '状态',
        result: '结果',
      },
      updatedCount: '已标记 {{count}} 条待办为过期',
      empty: '暂无执行记录',
      emptyDescription: '该计划尚未执行过。',
      loadFailed: '执行记录加载失败，请重试。',
    },
  },
};

export default zhCN;
