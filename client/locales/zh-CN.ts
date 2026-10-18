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
    description: '记录需要完成的事情，按截止时间排序。',
    showing: '显示 {{count}} 条',
    loading: '正在加载待办…',
    refreshFailed: '列表刷新失败。',
    toggleFailed: '更新待办失败，请重试。',
    search: {
      placeholder: '搜索待办',
      clear: '清除搜索',
    },
    columns: {
      completed: '完成',
      title: '待办',
      dueAt: '截止时间',
      status: '状态',
    },
    create: {
      action: '新建待办',
      title: '新建待办',
      description: '填写标题并设置截止时间。',
    },
    edit: {
      title: '编辑待办',
      description: '修改标题或调整截止时间。',
    },
    form: {
      titleLabel: '标题',
      titlePlaceholder: '需要做什么？',
      dueAtLabel: '截止时间',
      dueAtPlaceholder: '选择日期',
      timeLabel: '时间',
      titleRequired: '请输入标题。',
      titleTooLong: '标题不能超过 200 个字符。',
      dueAtRequired: '请选择截止日期。',
      timeInvalid: '请输入有效的时间。',
      saveFailed: '保存待办失败，请重试。',
      saving: '正在保存…',
    },
    calendar: {
      previousMonth: '上个月',
      nextMonth: '下个月',
    },
    status: {
      pending: '待办',
      completed: '已完成',
      expired: '已过期',
    },
    actions: {
      menu: '待办操作',
      edit: '编辑',
      delete: '删除',
      markComplete: '标记为已完成',
      markIncomplete: '标记为未完成',
    },
    delete: {
      title: '删除待办？',
      description: '“{{title}}”将被永久删除，此操作无法撤销。',
      action: '删除',
      deleting: '正在删除…',
      failed: '删除待办失败，请重试。',
    },
    empty: {
      title: '还没有待办',
      description: '创建第一条待办，并为它设置截止时间。',
    },
    noResults: {
      title: '没有找到匹配的待办',
      description: '换个关键词试试。',
      action: '清除搜索',
    },
    loadError: {
      title: '加载待办失败',
      description: '请检查网络连接后重试。',
    },
    notFound: {
      title: '待办不存在',
      description: '它可能已被删除，关闭此对话框查看最新列表。',
    },
    toast: {
      created: '待办已创建。',
      updated: '待办已更新。',
      deleted: '待办已删除。',
    },
  },
  scheduler: {
    title: '定时任务',
    description: '应用注册的计划任务及其每次执行结果。',
    refresh: '刷新',
    loading: '正在加载计划任务…',
    loadError: {
      title: '加载计划任务失败',
      description: '请检查网络连接后重试。',
    },
    toggleFailed: '修改计划任务失败，请重试。',
    empty: {
      title: '没有计划任务',
      description: '当前应用没有注册任何计划任务。',
    },
    columns: {
      title: '任务',
      schedule: '计划',
      status: '状态',
      nextRun: '下次执行',
      actions: '操作',
    },
    status: {
      enabled: '已启用',
      disabled: '已停用',
    },
    runCount: '已执行 {{count}} 次 · 成功 {{completed}} 次',
    actions: {
      enable: '启用',
      disable: '停用',
    },
    records: {
      action: '执行记录',
      title: '执行记录',
      description: '“{{title}}”最近的执行情况。',
      loading: '正在加载执行记录…',
      empty: '该计划任务尚未执行。',
      error: {
        title: '加载执行记录失败',
        description: '请检查网络连接后重试。',
      },
      columns: {
        started: '开始时间',
        status: '状态',
        finished: '结束时间',
        result: '结果',
      },
    },
    occurrenceStatus: {
      pending: '待执行',
      waiting: '等待中',
      running: '执行中',
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
