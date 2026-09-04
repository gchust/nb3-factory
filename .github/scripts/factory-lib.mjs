import { appendFileSync } from 'node:fs';

export const FACTORY_PROVIDER = 'nb3-factory';

export const STATUS_LABELS = {
  'pi:pending': ['d4c5f9', 'Waiting for the factory to accept the task'],
  'pi:queued': ['bfdadc', 'Queued for the serialized Pi worker'],
  'pi:running': ['1d76db', 'Pi is implementing the task'],
  'pi:verifying': ['fbca04', 'The generated application is being verified'],
  'pi:review': ['0e8a16', 'A generated pull request is ready for review'],
  'pi:waiting': [
    'c5def5',
    'Waiting for another Pi pull request on the target branch',
  ],
  'pi:succeeded': ['0e8a16', 'The generated pull request was merged'],
  'pi:failed': ['d93f0b', 'The factory run failed'],
  'pi:needs-input': ['b60205', 'The task needs owner input'],
};

const FIELD_NAMES = {
  targetBranch: '目标分支',
  taskType: '任务类型',
  requirements: '业务需求',
  acceptanceCriteria: '验收要求',
  sampleData: '示例数据',
};

const TARGET_BRANCH_RE =
  /^apps\/[a-z0-9](?:[a-z0-9._-]{0,62})(?:\/[a-z0-9](?:[a-z0-9._-]{0,62}))*$/;

export class TaskInputError extends Error {}

export function extractIssueSections(body = '') {
  const sections = new Map();
  const heading = /^###\s+(.+?)\s*$\r?\n([\s\S]*?)(?=^###\s+|(?![\s\S]))/gm;

  for (const match of body.matchAll(heading)) {
    const value = match[2].trim();
    sections.set(match[1].trim(), value === '_No response_' ? '' : value);
  }

  return sections;
}

export function validateTargetBranch(branch) {
  if (typeof branch !== 'string' || !TARGET_BRANCH_RE.test(branch)) {
    throw new TaskInputError(
      '目标分支必须使用 `apps/<name>` 格式，并且只包含小写字母、数字、点、下划线、短横线或安全的子路径。',
    );
  }

  if (branch.length > 120 || branch.includes('..') || branch.endsWith('.')) {
    throw new TaskInputError('目标分支名称过长或包含 Git 不接受的片段。');
  }

  return branch;
}

export function parseIssueTask(issue) {
  const sections = extractIssueSections(issue.body ?? '');
  const required = (key) => {
    const value = sections.get(FIELD_NAMES[key])?.trim();
    if (!value) {
      throw new TaskInputError(`Issue 缺少必填字段：${FIELD_NAMES[key]}。`);
    }
    return value;
  };

  return {
    targetBranch: validateTargetBranch(required('targetBranch')),
    taskType: required('taskType'),
    requirements: required('requirements'),
    acceptanceCriteria: required('acceptanceCriteria'),
    sampleData: sections.get(FIELD_NAMES.sampleData)?.trim() || '是',
  };
}

export function issueNumberFromEvent(event) {
  const value =
    event.issue?.number ??
    event.client_payload?.issue_number ??
    event.inputs?.issue_number;
  const number = Number(value);

  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new TaskInputError('无法从触发事件中确定有效的 Issue 编号。');
  }

  return number;
}

export function appendGithubOutput(path, key, value) {
  if (!path) return;
  const text = String(value ?? '');
  if (!text.includes('\n') && !text.includes('\r')) {
    appendFileSync(path, `${key}=${text}\n`);
    return;
  }

  const delimiter = `factory_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  appendFileSync(path, `${key}<<${delimiter}\n${text}\n${delimiter}\n`);
}

export function replaceTemplate(template, values) {
  let rendered = template;
  for (const [key, value] of Object.entries(values)) {
    rendered = rendered.replaceAll(`{{${key}}}`, String(value ?? ''));
  }
  return rendered;
}

export function parseBoolean(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

export function assertSafeChangedPaths(paths) {
  const forbidden = paths.filter(
    (file) =>
      file === '.npmrc' ||
      file === '.gitmodules' ||
      file === 'config.yml' ||
      file.startsWith('.github/'),
  );

  if (forbidden.length > 0) {
    throw new TaskInputError(
      `Pi 修改了工厂控制文件，已拒绝发布：${forbidden.join(', ')}`,
    );
  }
}

export class GitHubClient {
  constructor({ token, repository, apiUrl = 'https://api.github.com' }) {
    if (!token) throw new Error('GITHUB_TOKEN is required.');
    if (!repository?.includes('/'))
      throw new Error('GITHUB_REPOSITORY is invalid.');
    this.token = token;
    this.repository = repository;
    this.apiUrl = apiUrl.replace(/\/$/, '');
  }

  async request(method, route, { body, query, allow404 = false } = {}) {
    const url = new URL(`${this.apiUrl}/repos/${this.repository}${route}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value != null) url.searchParams.set(key, String(value));
    }

    const response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'User-Agent': 'gchust-nb3-factory',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: body == null ? undefined : JSON.stringify(body),
    });

    if (allow404 && response.status === 404) return null;
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `GitHub API ${method} ${route} failed (${response.status}): ${detail.slice(0, 1000)}`,
      );
    }
    if (response.status === 204) return null;
    return response.json();
  }

  getRepository() {
    return this.request('GET', '');
  }

  getIssue(number) {
    return this.request('GET', `/issues/${number}`);
  }

  getRef(branch, allow404 = false) {
    const ref = branch.split('/').map(encodeURIComponent).join('/');
    return this.request('GET', `/git/ref/heads/${ref}`, { allow404 });
  }

  createRef(branch, sha) {
    return this.request('POST', '/git/refs', {
      body: { ref: `refs/heads/${branch}`, sha },
    });
  }

  listOpenPullRequests(base) {
    return this.request('GET', '/pulls', {
      query: { state: 'open', base, per_page: 100 },
    });
  }

  addComment(issueNumber, body) {
    return this.request('POST', `/issues/${issueNumber}/comments`, {
      body: { body },
    });
  }

  async ensureStatusLabels() {
    const labels = await this.request('GET', '/labels', {
      query: { per_page: 100 },
    });
    const existing = new Set(labels.map((label) => label.name));

    for (const [name, [color, description]] of Object.entries(STATUS_LABELS)) {
      if (existing.has(name)) continue;
      await this.request('POST', '/labels', {
        body: { name, color, description },
      });
    }
  }

  async setIssueStatus(issue, status, comment) {
    if (!STATUS_LABELS[status])
      throw new Error(`Unknown status label: ${status}`);
    const current = (issue.labels ?? []).map((label) =>
      typeof label === 'string' ? label : label.name,
    );
    const labels = current.filter((name) => !name?.startsWith('pi:'));
    labels.push(status);

    const updated = await this.request('PATCH', `/issues/${issue.number}`, {
      body: { labels },
    });
    if (comment) await this.addComment(issue.number, comment);
    return updated;
  }
}
