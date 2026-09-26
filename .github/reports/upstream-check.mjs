// Optional latest-upstream recheck of frozen review findings. Absent means
// "not rechecked" — never "still present" and never "fixed". The recheck sits
// beside the frozen review: it can suggest a different severity or type, but
// the original assessment stays visible and is not rewritten.
export const upstreamStatus = {
  present: '上游仍存在',
  fixed: '上游已修复',
  changed: '上游已变化',
  unknown: '上游无法判断',
};

const SEVERITIES = ['critical', 'major', 'minor', 'info'];
const TYPES = [
  'runtime-defect',
  'capability-gap',
  'guidance-error',
  'guidance-gap',
  'usability',
];
const need = (condition, message) => {
  if (!condition) throw new Error(`upstreamCheck: ${message}`);
};
const text = (value, where) =>
  need(typeof value === 'string' && value.trim(), `${where} 必须是非空字符串`);

export function validateUpstreamCheck(check, findingIds) {
  need(check?.version === 1, 'version 不支持');
  need(/^[\w.-]+\/[\w.-]+$/.test(check.repository), 'repository 非法');
  need(/^[a-f\d]{40}$/.test(check.sha), 'sha 必须是完整提交 SHA');
  for (const key of ['ref', 'checkedAt', 'checker']) text(check[key], key);
  need(
    check.findings && typeof check.findings === 'object',
    'findings 必须是对象',
  );
  for (const [id, entry] of Object.entries(check.findings)) {
    need(findingIds.has(id), `${id} 不是本次评审的发现`);
    need(Object.hasOwn(upstreamStatus, entry.status), `${id}.status 非法`);
    text(entry.summary, `${id}.summary`);
    if (entry.note !== undefined) text(entry.note, `${id}.note`);
    if (entry.suggestedSeverity !== undefined)
      need(
        SEVERITIES.includes(entry.suggestedSeverity),
        `${id}.suggestedSeverity 非法`,
      );
    if (entry.suggestedType !== undefined)
      need(TYPES.includes(entry.suggestedType), `${id}.suggestedType 非法`);
    need(
      Array.isArray(entry.evidence) && entry.evidence.length,
      `${id}.evidence 至少一条`,
    );
    for (const item of entry.evidence) {
      text(item.label, `${id}.evidence.label`);
      text(item.path, `${id}.evidence.path`);
      need(
        !item.path.startsWith('/') && !item.path.includes('..'),
        `${id}.evidence.path 必须是仓库内相对路径`,
      );
      need(
        Array.isArray(item.lines) &&
          item.lines.length === 2 &&
          item.lines.every(Number.isSafeInteger) &&
          item.lines[0] >= 1 &&
          item.lines[1] >= item.lines[0],
        `${id}.evidence.lines 非法`,
      );
      need(typeof item.excerpt === 'string', `${id}.evidence.excerpt 必须提供`);
    }
  }
}

export const upstreamEntry = (check, finding) =>
  check?.findings?.[finding.id] ?? null;
export const shortSha = (check) => check.sha.slice(0, 8);
export const upstreamLink = (check, item) =>
  `https://github.com/${check.repository}/blob/${check.sha}/${item.path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}#L${item.lines[0]}${item.lines[1] > item.lines[0] ? `-L${item.lines[1]}` : ''}`;
