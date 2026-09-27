import { createHash } from 'node:crypto';
import { stripVTControlCharacters } from 'node:util';
import {
  identifyCheck,
  parseAcceptanceCriteria,
} from './acceptance-criteria.mjs';

// Trusted control-plane policy. Issue text and checkpoint fields cannot raise it.
export const TASK_LIMITS = Object.freeze({
  maxRepairAttempts: 5,
  maxActiveSeconds: 36_000,
  maxContinuations: 1,
  maxIdenticalFailures: 3,
});

export function effectiveBudget(state) {
  return Object.fromEntries(
    Object.entries(TASK_LIMITS).map(([key, ceiling]) => [
      key,
      Number.isSafeInteger(state.budget?.[key])
        ? Math.min(ceiling, state.budget[key])
        : ceiling,
    ]),
  );
}

// Conservative textual identity, not an LLM root-cause verdict. Preserve error
// codes, field names and status codes; remove only volatile execution details.
export function normalizeFailure(value) {
  return stripVTControlCharacters(String(value ?? ''))
    .normalize('NFKC')
    .replace(/\b\d{4}-\d{2}-\d{2}T[\d:.]+Z\b/gu, '<time>')
    .replace(/\b[\da-f]{8}-[\da-f-]{27,}\b/giu, '<uuid>')
    .replace(/\/home\/runner\/work\/[^/\s:'"]+\/[^/\s:'"]+\//gu, '<workspace>/')
    .replace(/\/(?:private\/)?tmp\/[^/\s:'"]+\//gu, '<runtime-path>/')
    .replace(/:\d+:\d+\b/gu, ':<line>:<column>')
    .replace(/\b\d+(?:\.\d+)?\s*(?:ms|milliseconds|seconds)\b/giu, '<duration>')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}

export function observedFailures(kind, report, log, metadata, stage = 'build') {
  if (kind === 'browser') {
    const criteria = parseAcceptanceCriteria(metadata.task.acceptanceCriteria);
    return (report?.checks ?? [])
      .filter((check) => check.status === 'failed')
      .map((check) => ({
        criterion: identifyCheck(check, criteria).id,
        // Actions and screenshot names are not a failure identity.
        symptom: normalizeFailure(
          [check.reason, ...(check.evidence ?? [])].filter(Boolean).join(' '),
        ),
      }))
      .filter((item) => item.symptom);
  }
  const lines = stripVTControlCharacters(String(log)).split(/\r?\n/u);
  const diagnostics = [];
  const wrapper = (line) =>
    /ELIFECYCLE|Command failed|^\s+at\s|^\s*(?:FAIL|not ok|×|✖)\s/iu.test(
      line,
    ) ||
    /\b(?:build|transform) failed with \d+ errors?:?\s*$/iu.test(line) ||
    /^\s*(?:error:\s*)?(?:build|compilation) failed[.!:]?\s*$/iu.test(line);
  for (const [index, line] of lines.entries()) {
    // Vite's common heading is not a failure identity. Include the following
    // diagnostic and file, otherwise unrelated missing modules look identical.
    if (/^\s*error during build:\s*$/iu.test(line)) {
      const details = [];
      for (const next of lines.slice(index + 1, index + 7)) {
        if (/^\s+at\s/u.test(next)) break;
        if (next.trim() && !wrapper(next)) details.push(next);
      }
      if (details.length) diagnostics.push(details.join(' '));
    } else if (
      !wrapper(line) &&
      /error TS\d+|\b(?:[A-Za-z]*Error)(?:\s*\[[^\]]+\])?:\s*\S|\berror\s+\S/iu.test(
        line,
      )
    ) {
      diagnostics.push(line);
    }
  }
  return [...new Set(diagnostics.map(normalizeFailure).filter(Boolean))]
    .slice(0, 100)
    .map((symptom) => ({ criterion: stage, symptom }));
}

export function recordFailures(state, failures, evidence) {
  state.failureHistory ??= [];
  for (const { criterion, symptom } of failures) {
    const fingerprint = createHash('sha256')
      .update(JSON.stringify([state.failureKind, criterion, symptom]))
      .digest('hex');
    let item = state.failureHistory.find(
      (entry) => entry.fingerprint === fingerprint,
    );
    if (!item) {
      // Keep observations in original reports/logs, not public progress state.
      item = {
        fingerprint,
        kind: state.failureKind,
        criterion,
        occurrences: [],
      };
      state.failureHistory.push(item);
    }
    if (
      !item.occurrences.some(
        (entry) => entry.round === state.verificationAttempts,
      )
    ) {
      item.occurrences.push({
        round: state.verificationAttempts,
        repairAttempts: state.repairAttempts,
        runId: process.env.GITHUB_RUN_ID || null,
        attempt: Number(process.env.GITHUB_RUN_ATTEMPT || 1),
        ...evidence,
      });
    }
  }
  return (
    state.failureHistory.find(
      (item) => item.occurrences.length >= TASK_LIMITS.maxIdenticalFailures,
    ) ?? null
  );
}

export function diagnostic(state, reason, code) {
  return {
    version: 1,
    status: 'needs-diagnosis',
    code,
    reason,
    limits: effectiveBudget(state),
    verificationAttempts: state.verificationAttempts,
    repairAttempts: state.repairAttempts,
    activeSeconds: state.activeSeconds ?? 0,
    priorExecutions: state.priorExecutions ?? 0,
    failures: state.failureHistory ?? [],
    rootCause: {
      owner: 'unknown',
      confidence: 'unknown',
      reason:
        '达到停止条件只证明任务未完成，不能据失败次数认定 NocoBase3 存在缺陷。',
    },
    investigation: [
      '按失败指纹逐轮读取原始操作、观察及修复日志，说明修复为何未解决问题；缺证据写未确认。',
      '只从已有证据记录最小复现、预期与实际结果；不编造复现成功。',
      '核对冻结版本公共 API、Skill 和应用用法，区分 framework/plugin/documentation/template/application/factory/environment/unknown。',
      '给出建议修改位置和下一轮回归标准；保持停止状态，不继续修复、验收或发布业务 PR。',
    ],
  };
}

export function renderDiagnostic(report) {
  const lines = [
    '## 已停止自动修复，待诊断',
    '',
    report.reason,
    '',
    '累计验证 ' +
      report.verificationAttempts +
      ' 轮，修复 ' +
      report.repairAttempts +
      ' 轮。',
    '',
    '### 重复失败与修复证据',
    '',
    '| 验收项 / 检查 | 出现轮次 | 原始证据（所属 Run 内） |',
    '| --- | --- | --- |',
  ];
  for (const item of report.failures) {
    lines.push(
      '| ' +
        item.criterion +
        ' | ' +
        item.occurrences.map((entry) => entry.round).join(', ') +
        ' | ' +
        item.occurrences
          .map(
            (entry) =>
              'Run ' +
              (entry.runId ?? 'local') +
              '：' +
              (entry.report || entry.log) +
              '；修复 ' +
              entry.repairAttempts,
          )
          .join('<br>') +
        ' |',
    );
  }
  if (!report.failures.length)
    lines.push('| 未记录 | — | 超时或预算触发；不能补造业务失败 |');
  lines.push(
    '',
    '### 归因与下一步',
    '',
    report.rootCause.reason,
    '',
    ...report.investigation.map((item) => '- ' + item),
    '',
    '代码补丁、各轮日志和截图保留在 Actions Artifacts；独立只读分析见 build-review.json。若评审未运行或材料不足，根因仍为 unknown。',
    '',
  );
  return lines.join('\n');
}
