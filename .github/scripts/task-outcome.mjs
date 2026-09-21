export const outcomeLabels = {
  delivered: '已生成/更新业务 PR',
  handoff: '已保存 Handoff，等待下一轮续跑',
  failure: '失败',
  cancelled: '已取消',
  timed_out: '超时',
  success: '运行完成（未确认业务交付）',
  action_required: '需人工介入',
  skipped: '跳过',
};

export function taskOutcome(run, jobs) {
  if (
    jobs.some((job) => job.name === 'publish' && job.conclusion === 'success')
  )
    return 'delivered';
  const agent = jobs.find((job) => job.name === 'agent');
  if (
    run.conclusion === 'success' &&
    agent?.steps?.some(
      (step) =>
        step.name === 'Dispatch continuation run' &&
        step.conclusion === 'success',
    )
  )
    return 'handoff';
  return run.conclusion;
}
