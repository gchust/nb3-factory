import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,

  settings: {
    // 设置界面的文案由模板提供，这里只扩展，不能整组覆盖。
    ...systemZhCN.settings,
    // 本应用自有 `todos` 字段在记录过滤中的名称。
    permissionFields: {
      dueAt: '截止时间',
      completed: '已完成',
      expired: '已过期',
    },
  },
  todos: {
    collectionTitle: '待办事项',
    title: '待办事项',
    description: '定时逾期检查所用的待办列表，检查每 30 秒运行一次。',
    refresh: '刷新',
    retry: '重试',
    loading: '正在加载待办…',
    failed: '待办列表加载失败。',
    denied: '你没有查看待办事项的权限。',
    sessionEnded: '会话已结束，请刷新页面重新登录。',
    total: '共 {{count}} 条待办',
    expiredCount: '{{count}} 条已逾期',
    completedCount: '{{count}} 条已完成',
    dueAt: '截止时间',
    completed: '已完成',
    expired: '已逾期',
    pending: '待处理',
    expiryHint:
      '定时任务只会把“未完成且已过截止时间”的待办标记为已逾期，重复执行不会新增重复待办。',
    empty: '还没有待办',
    emptyHint: '初始化数据运行后，示例待办会显示在这里。',
    schedules: {
      title: '定时任务',
      description:
        '应用在代码中定义的调度计划。可在这里暂停计划，或查看它的执行记录。',
      definition: {
        title: '待办逾期标记',
        description:
          '每 30 秒检查一次待办：将已过截止时间且未完成的待办标记为已逾期，不会重复新增待办。',
      },
      target: {
        title: '待办逾期检查',
      },
      detailTitle: '执行记录',
      detailDescription: '该计划的每次触发记录，最新在前，并显示结果摘要。',
      refresh: '刷新',
      back: '返回定时任务',
      overview: '计划信息',
      cron: 'Cron 表达式',
      timezone: '时区',
      nextRun: '下次运行',
      lastRun: '上次运行',
      runCount: '触发次数',
      completedCount: '成功次数',
      enabled: '已启用',
      disabled: '已暂停',
      enable: '启用',
      disable: '暂停',
      enabledToast: '计划已启用。',
      disabledToast: '计划已暂停。',
      saving: '保存中…',
      never: '从未',
      inactive: '应用已不再定义此计划。原因：{{reason}}',
      unknownReason: '未记录',
      empty: '没有定时任务',
      emptyHint: '应用定义计划并完成同步后，计划会显示在这里。',
      executions: '执行记录',
      noExecutions: '还没有执行记录',
      noExecutionsHint: '计划首次触发后会出现记录，可刷新后再查看。',
      startedAt: '开始时间',
      finishedAt: '结束时间',
      attempts: '尝试 {{count}} 次',
      reason: '原因',
      result: '执行结果',
      noResult: '未记录结果',
      viewExecutions: '执行记录',
      loadMore: '加载更多',
      status: {
        pending: '等待中',
        running: '运行中',
        waiting: '等待结果',
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
