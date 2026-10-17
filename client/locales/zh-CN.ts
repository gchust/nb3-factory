import type { AppResource } from './en-US.js';
import systemZhCN from './system/zh-CN.js';

const zhCN: AppResource = {
  // The template's own copy; see `./en-US.ts`.
  ...systemZhCN,
  navigation: {
    ...systemZhCN.navigation,
    todos: '待办',
    schedules: '调度管理',
  },
  todos: {
    title: '待办',
    description:
      '每条待办都有一个截止时间。后台调度会把已过截止时间且未完成的待办标记为已过期，不会改动未到期或已完成的待办。',
    refresh: '刷新',
    loading: '正在加载待办',
    dueAt: '截止 {{date}}',
    createAction: '新建待办',
    complete: '标记完成',
    reopen: '标记未完成',
    updateFailed: '待办更新失败，请重试。',
    updateForbidden: '你无权修改该待办。',
    status: {
      completed: '已完成',
      expired: '已过期',
      open: '待办中',
    },
    empty: {
      title: '还没有待办',
      description: '新建一条待办，它会带着截止时间和状态出现在这里。',
    },
    error: {
      title: '待办加载失败',
      description: '请检查与服务器的连接后重试。',
      forbidden: '你没有待办的访问权限',
      forbiddenDescription:
        '请联系管理员分配该页面的权限，或使用有权限的账号登录。',
      retry: '重试',
    },
    form: {
      title: '标题',
      titlePlaceholder: '例如：提交月度报表',
      titleRequired: '请填写标题。',
      titleTooLong: '标题最多 200 个字符。',
      dueDate: '截止日期',
      dueTime: '截止时间',
      dueDateRequired: '请选择截止日期。',
      dueTimeRequired: '请选择截止时间。',
      pickDate: '选择日期',
      dueHint: '可以填写已经过去的时间：调度下次运行时会把该待办标记为已过期。',
    },
    create: {
      title: '新建待办',
      description: '填写标题和截止时间。',
      submit: '创建',
      submitting: '正在创建…',
      cancel: '取消',
      success: '「{{title}}」已创建。',
      forbidden: '你无权新建待办。',
      failed: '待办创建失败，请重试。',
    },
  },
  schedules: {
    title: '调度管理',
    description:
      '由应用注册的定时任务。每次运行都会留下记录，可在执行记录中查看它做了什么、做了什么时间。',
    refresh: '刷新',
    loading: '正在加载调度',
    enabled: '「{{title}}」已启用。',
    disabled: '「{{title}}」已停用。',
    forbidden: '你无权管理调度。',
    toggleFailed: '调度状态修改失败，请重试。',
    status: {
      active: '运行中',
      paused: '已暂停',
    },
    targetState: {
      ready: '就绪',
      disabled: '目标已停用',
      missing: '目标缺失',
      invalid: '目标无效',
    },
    nextRun: '下次运行',
    noNextRun: '暂无计划',
    lastRun: '上次运行',
    neverRun: '尚未运行',
    runs: '运行次数',
    runCounts: '共 {{runs}} 次，成功 {{succeeded}} 次',
    enable: '启用',
    disable: '停用',
    empty: {
      title: '还没有注册调度',
      description:
        '调度在应用代码中声明；注册后会带着计划与执行记录出现在这里。',
    },
    occurrences: {
      open: '执行记录',
      title: '执行记录',
      subtitle: '该调度记录的运行',
      refresh: '刷新',
      loading: '正在加载执行记录',
      loadMore: '加载更多',
      loadMoreFailed: '下一页加载失败，请重试。',
      empty: {
        title: '还没有运行记录',
        description: '调度派发该计划后，运行会立即出现在这里。',
      },
      error: {
        title: '执行记录加载失败',
        description: '请检查与服务器的连接后重试。',
        notFound: '该调度已不存在',
        notFoundDescription: '应用已不再注册该调度，因此无法显示它的记录。',
        retry: '重试',
      },
    },
    occurrence: {
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
      executionCount: '第 {{count}} 次尝试',
      startedAt: '开始时间',
      finishedAt: '结束时间',
      running: '仍在运行',
      result: '运行结果',
      expiredCount_one: '已标记 {{count}} 条待办为已过期',
      expiredCount_other: '已标记 {{count}} 条待办为已过期',
      reason: '原因：{{reason}}',
    },
    disableConfirm: {
      title: '停用「{{title}}」？',
      description: '停用后它不再运行，直到重新启用；计划与执行记录会保留。',
      cancel: '保持运行',
      confirm: '停用',
    },
    error: {
      title: '调度加载失败',
      description: '请检查与服务器的连接后重试。',
      forbidden: '你没有调度的访问权限',
      forbiddenDescription:
        '请联系管理员分配该页面的权限，或使用有权限的账号登录。',
      retry: '重试',
    },
  },
};

export default zhCN;
