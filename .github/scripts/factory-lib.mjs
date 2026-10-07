import { appendFileSync } from 'node:fs';

import { defaultAcceptanceCriteria } from './acceptance-criteria.mjs';
import { isTaskStatus } from './task-compat.mjs';

export const FACTORY_PROVIDER = 'nb3-factory';
export const BUILD_LABEL = 'factory:build';

export const STATUS_LABELS = {
  'agent:pending': ['d4c5f9', 'Waiting for the factory to accept the task'],
  'agent:queued': ['bfdadc', 'Queued for the serialized Code Agent worker'],
  'agent:running': ['1d76db', 'Code Agent is implementing the task'],
  'agent:verifying': ['fbca04', 'The generated application is being verified'],
  'agent:review': ['0e8a16', 'A generated pull request is ready for review'],
  'agent:waiting': [
    'c5def5',
    'Waiting for another Code Agent pull request on the target branch',
  ],
  'agent:succeeded': ['0e8a16', 'The generated pull request was merged'],
  'agent:failed': ['d93f0b', 'The factory run failed'],
  'agent:needs-input': ['b60205', 'The task needs owner input'],
};

const FIELD_NAMES = {
  targetBranch: '目标分支',
  taskType: '任务类型',
  requirements: '业务需求',
  acceptanceCriteria: '验收要求',
  sampleData: '示例数据',
};

const TARGET_BRANCH_RE = /^[A-Za-z0-9_][A-Za-z0-9._/-]*$/;

export class TaskInputError extends Error {}

// The repository and its Actions logs are public. Only people with repository
// access may start a model run from an Issue or comment; everyone else is ignored.
export const TRUSTED_AUTHOR_ASSOCIATIONS = ['OWNER', 'MEMBER', 'COLLABORATOR'];
export function isTrustedAuthor(entity) {
  return TRUSTED_AUTHOR_ASSOCIATIONS.includes(entity?.author_association);
}

// An Issue whose body may become a comment round's requirements. Besides
// people with repository access, the factory's own Issues qualify: daily
// preset runs and evaluation samples are opened by this repository's
// workflows as github-actions[bot] (whose association is never OWNER, MEMBER
// or COLLABORATOR), and only those workflows can author as that account.
// Other bots and Apps, an external task manager's included, are not trusted.
export function isFactoryBot(user) {
  return user?.login === 'github-actions[bot]' && user?.type === 'Bot';
}
export function isTrustedIssue(issue) {
  return isTrustedAuthor(issue) || isFactoryBot(issue?.user);
}

export function extractIssueSections(body = '') {
  const sections = new Map();
  const heading = /^###\s+(.+?)\s*$\r?\n([\s\S]*?)(?=^###\s+|(?![\s\S]))/gm;

  for (const match of body.matchAll(heading)) {
    const value = match[2].trim();
    sections.set(match[1].trim(), value === '_No response_' ? '' : value);
  }

  return sections;
}

export function isValidTargetBranch(branch) {
  return (
    typeof branch === 'string' &&
    TARGET_BRANCH_RE.test(branch) &&
    branch.length <= 120 &&
    branch !== 'HEAD' &&
    !branch.includes('..') &&
    branch
      .split('/')
      .every(
        (part) =>
          part &&
          !part.startsWith('.') &&
          !part.endsWith('.') &&
          !part.endsWith('.lock'),
      )
  );
}

export function validateTargetBranch(branch) {
  if (!isValidTargetBranch(branch)) {
    throw new TaskInputError(
      '目标分支名称无效：使用字母、数字、点、下划线、短横线或子路径，最长 120 字符。留空使用仓库默认分支（develop）。',
    );
  }
  return branch;
}

// Only this control field selects the optional assessment; it is not business input.
// The forms offer 执行评测/跳过评测. 默认 (no choice) survives only in older
// snapshots; 自动/完整/轻量 are retired labels still present in older Issues and presets.
export const BUILD_REVIEW_LABELS = { auto: '默认', full: '执行评测', off: '跳过评测' };
// The field is optional. An empty, missing or unrecognized value is "no choice"
// (null), which inherits a source preset and otherwise resolves to a full review;
// it never blocks the business task. Rejecting unknown labels stranded #392: a
// sample written with 跳过评测 ran on a control pinned before that label existed.
export function parseBuildReviewMode(value) {
  const normalized = String(value ?? '').trim();
  if (['full', '执行评测', '完整'].includes(normalized)) return 'full';
  if (['off', '跳过评测', '轻量'].includes(normalized)) return 'off';
  return null;
}

export function resolveBuildReviewMode(task, env, replay = false) {
  const configured = task?.buildReviewMode;
  if (configured != null && !['full', 'off'].includes(configured))
    throw new TaskInputError('Invalid captured buildReviewMode');
  // An explicit reassessment request must work even for a smoke task.
  const mode = replay ? 'full' : configured ?? (env.FACTORY_BUILD_REVIEW || 'full');
  if (!['full', 'off'].includes(mode)) throw new TaskInputError('FACTORY_BUILD_REVIEW must be full or off');
  return mode;
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

  const targetBranch = sections.get(FIELD_NAMES.targetBranch)?.trim();
  const buildReviewMode = parseBuildReviewMode(sections.get('框架评测'));
  const requirements = required('requirements');
  return {
    ...(buildReviewMode ? { buildReviewMode } : {}),
    // Resolve an omitted branch against the repository, not the Issue number.
    targetBranch: targetBranch ? validateTargetBranch(targetBranch) : null,
    taskType: required('taskType'),
    requirements,
    acceptanceCriteria: sections.get(FIELD_NAMES.acceptanceCriteria)?.trim()
      || defaultAcceptanceCriteria(requirements),
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
      file === 'factory-source.json' ||
      file === '.gitmodules' ||
      file === 'config.yml' ||
      file.startsWith('.github/'),
  );

  if (forbidden.length > 0) {
    throw new TaskInputError(
      `Code Agent 修改了工厂控制文件，已拒绝发布：${forbidden.join(', ')}`,
    );
  }
}

// GitHub answers 502/503/504 and drops connections during short outages.
// Only requests that leave the same state when repeated are retried: a POST
// that creates a comment, ref or Issue could otherwise create it twice.
const RETRYABLE_METHODS = new Set(['GET', 'HEAD', 'PUT', 'PATCH']);
// Git objects are content-addressed: creating the same blob, tree or commit
// again only yields another unreferenced object, never a second visible change.
// A caller opts in per request with `contentAddressed: true`; any other POST,
// and every ref update, stays unretried.
const CONTENT_ADDRESSED_ROUTES = new Set([
  '/git/blobs',
  '/git/trees',
  '/git/commits',
]);
const RETRYABLE_STATUSES = new Set([502, 503, 504]);
export const GITHUB_RETRY_DELAYS_MS = [1000, 3000, 8000];
// A half-open connection otherwise waits for undici's ~300 s timeout on every
// attempt, which four attempts stretch past most job timeouts. A timeout is a
// dropped connection: retried for the methods above, never for POST/DELETE.
export const GITHUB_REQUEST_TIMEOUT_MS = 30_000;

// The (method, route, body) shape the report scripts call, backed by
// GitHubClient so their reads and updates ride out 502/503/504 and dropped
// connections the same way: GET/HEAD/PUT/PATCH retry, POST/DELETE never do.
// The client is built on first use, so importing a script for its pure helpers
// needs no token.
export function repositoryApi({
  repository = () => process.env.GITHUB_REPOSITORY,
  token = () => process.env.GITHUB_TOKEN,
  apiUrl = () => process.env.GITHUB_API_URL || 'https://api.github.com',
  timeoutMs = GITHUB_REQUEST_TIMEOUT_MS,
  retryDelays = GITHUB_RETRY_DELAYS_MS,
} = {}) {
  let client;
  return async (method, route, body) => {
    client ??= new GitHubClient({
      token: typeof token === 'function' ? token() : token,
      repository: typeof repository === 'function' ? repository() : repository,
      apiUrl: typeof apiUrl === 'function' ? apiUrl() : apiUrl,
      timeoutMs,
      retryDelays,
    });
    return client.request(method, route, { body });
  };
}

export class GitHubClient {
  constructor({
    token,
    repository,
    apiUrl = 'https://api.github.com',
    retryDelays = GITHUB_RETRY_DELAYS_MS,
    timeoutMs = GITHUB_REQUEST_TIMEOUT_MS,
  }) {
    if (!token) throw new Error('GITHUB_TOKEN is required.');
    if (!repository?.includes('/'))
      throw new Error('GITHUB_REPOSITORY is invalid.');
    this.token = token;
    this.repository = repository;
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.retryDelays = retryDelays;
    this.timeoutMs = timeoutMs;
  }

  async request(
    method,
    route,
    {
      body,
      query,
      allow404 = false,
      timeoutMs = this.timeoutMs,
      contentAddressed = false,
    } = {},
  ) {
    if (
      contentAddressed &&
      (method !== 'POST' || !CONTENT_ADDRESSED_ROUTES.has(route))
    )
      throw new Error(
        `contentAddressed retries apply only to POST ${[...CONTENT_ADDRESSED_ROUTES].join(', ')}, not ${method} ${route}`,
      );
    const url = new URL(`${this.apiUrl}/repos/${this.repository}${route}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value != null) url.searchParams.set(key, String(value));
    }

    const delays =
      RETRYABLE_METHODS.has(method) || contentAddressed ? this.retryDelays : [];
    for (let attempt = 0; ; attempt++) {
      const retry = attempt < delays.length;
      // One deadline for the whole attempt, reading the body included.
      const signal = AbortSignal.timeout(timeoutMs);
      let response;
      try {
        response = await fetch(url, {
          method,
          signal,
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${this.token}`,
            'User-Agent': 'gchust-nb3-factory',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: body == null ? undefined : JSON.stringify(body),
        });
      } catch (error) {
        if (!retry) throw error;
        console.warn(
          `GitHub API ${method} ${route} unreachable (${error.cause?.code || error.name}); retrying.`,
        );
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
        continue;
      }

      if (allow404 && response.status === 404) return null;
      if (retry && RETRYABLE_STATUSES.has(response.status)) {
        await response.body?.cancel();
        console.warn(
          `GitHub API ${method} ${route} failed (${response.status}); retrying.`,
        );
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
        continue;
      }
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(
          `GitHub API ${method} ${route} failed (${response.status}): ${detail.slice(0, 1000)}`,
        );
      }
      if (response.status === 204) return null;
      try {
        return await response.json();
      } catch (error) {
        if (!retry || error.name !== 'TimeoutError') throw error;
        console.warn(
          `GitHub API ${method} ${route} timed out reading the response; retrying.`,
        );
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }
    }
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

    const taskLabels = {
      [BUILD_LABEL]: ['0075ca', 'Application build task managed by the factory'],
      ...STATUS_LABELS,
    };
    for (const [name, [color, description]] of Object.entries(taskLabels)) {
      if (existing.has(name)) continue;
      try {
        await this.request('POST', '/labels', {
          body: { name, color, description },
        });
      } catch (error) {
        // Sync and build workflows can initialize a label at the same time.
        // A label outside the first list page is also already initialized.
        if (!await this.request('GET', `/labels/${encodeURIComponent(name)}`, { allow404: true })) throw error;
      }
    }
  }

  async setIssueStatus(issue, status, comment) {
    if (!STATUS_LABELS[status])
      throw new Error(`Unknown status label: ${status}`);
    const current = (issue.labels ?? []).map((label) =>
      typeof label === 'string' ? label : label.name,
    );
    const labels = current.filter((name) => !isTaskStatus(name));
    if (!labels.includes(BUILD_LABEL)) labels.push(BUILD_LABEL);
    labels.push(status);

    const updated = await this.request('PATCH', `/issues/${issue.number}`, {
      body: { labels },
    });
    if (comment) await this.addComment(issue.number, comment);
    return updated;
  }
}
