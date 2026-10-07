// A bounded second look at candidate claims, not another module assessment.
// These checks validate traceable inputs and explicit reasoning, not semantic truth.
export const FEEDBACK_REVIEW_SECONDS = 180;
export const MAX_FEEDBACK_CANDIDATES = 12;
export const feedbackCheckKinds = [
  'contract',
  'behavior',
  'application',
  'environment',
  'factory',
  'existing-capability',
];
const owners = new Set(['framework', 'plugin', 'template', 'documentation']);
const need = (condition, message) => {
  if (!condition) throw new Error(message);
};
const object = (value) =>
  value && typeof value === 'object' && !Array.isArray(value);
const text = (value) =>
  typeof value === 'string' && value.trim() && value.length <= 2000;
export const isFeedbackCandidate = (finding) =>
  finding.kind !== 'strength' &&
  owners.has(finding.owner) &&
  !['resolved', 'not-applicable'].includes(finding.status);
export const insufficientFeedback = (reason) => ({
  status: 'insufficient',
  reason: String(reason).slice(0, 2000),
  checks: [],
});

export function feedbackReserve(seconds) {
  // Very short/terminal reviews still get time to save a useful module checkpoint.
  return seconds < 120
    ? 0
    : Math.min(FEEDBACK_REVIEW_SECONDS, Math.floor(seconds / 4));
}
export function selectFeedbackCandidates(evaluation) {
  const priority = { critical: 0, major: 1, minor: 2, info: 3 };
  return evaluation.findings
    .filter(isFeedbackCandidate)
    .sort((a, b) => priority[a.severity] - priority[b.severity])
    .slice(0, MAX_FEEDBACK_CANDIDATES);
}
export function validateFeedbackReview(review, evidence, finding) {
  need(
    object(review) &&
      ['supported', 'contradicted', 'insufficient'].includes(review.status),
    'Invalid feedback review status',
  );
  need(text(review.reason), 'Feedback review needs a reason');
  need(
    Array.isArray(review.checks) &&
      review.checks.length <= feedbackCheckKinds.length,
    'Invalid feedback checks',
  );
  const kinds = new Set();
  for (const check of review.checks) {
    need(
      object(check) &&
        feedbackCheckKinds.includes(check.kind) &&
        !kinds.has(check.kind),
      'Invalid or duplicate feedback check',
    );
    kinds.add(check.kind);
    need(text(check.reason), 'Feedback check needs a reason');
    need(
      Array.isArray(check.evidence) &&
        check.evidence.length <= 20 &&
        new Set(check.evidence).size === check.evidence.length,
      'Invalid feedback evidence refs',
    );
    need(
      check.evidence.every((id) => evidence.some((item) => item.id === id)),
      'Unknown feedback evidence id',
    );
    if (review.status === 'supported')
      need(check.evidence.length > 0, 'Supported feedback needs cited checks');
  }
  if (review.status === 'contradicted')
    need(
      review.checks.some((check) => check.evidence.length),
      'Contradiction needs source evidence',
    );
  if (review.status !== 'supported') return review;
  need(
    finding.diagnosis && kinds.size === feedbackCheckKinds.length,
    'Supported feedback needs diagnosis and every counter-evidence check',
  );
  const cited = (kind) =>
    review.checks
      .find((check) => check.kind === kind)
      .evidence.map((id) => evidence.find((item) => item.id === id));
  // Paths, not the model's claimed kind, identify the source. Manifest versions
  // and source inventories cannot establish the public contract or its behavior.
  const frameworkSource = (item) =>
    /^(packages\/@nocobase\/|app\/\.agents\/skills\/|app\/(?:AGENTS|CLAUDE)\.md$)/.test(
      item.path,
    ) && !/(?:\/package\.json|\.map)$/.test(item.path);
  need(
    cited('contract').some(frameworkSource),
    'Supported feedback needs a captured framework contract or guidance',
  );
  if (finding.diagnosis.category === 'runtime-defect') {
    need(
      cited('behavior').some(
        (item) =>
          (frameworkSource(item) &&
            /\.(?:[cm]?js|jsx|tsx?|sql)$/.test(item.path) &&
            !/\.d\.(?:[cm]?ts)$/.test(item.path)) ||
          /^artifacts\/(?:agent-history\/.+\/part-[0-9]+\.txt$|verify-)/.test(
            item.path,
          ),
      ),
      'Runtime defect needs implementation or original observed behavior, not declarations alone',
    );
  }
  return review;
}

// A malformed item cannot discard other candidates. The caller validates and
// materializes each item's new evidence against the frozen snapshot before merge.
export function applyFeedbackReview(
  evaluation,
  draft,
  candidates,
  validateEvidence,
) {
  const selected = new Set(candidates.map((finding) => finding.id));
  const result = {
    ...evaluation,
    evidence: [...evaluation.evidence],
    findings: evaluation.findings.map((finding) =>
      isFeedbackCandidate(finding)
        ? {
            ...finding,
            feedbackReview: insufficientFeedback(
              selected.has(finding.id)
                ? '定向证据复核未返回本条结论。'
                : `超出本轮最多 ${MAX_FEEDBACK_CANDIDATES} 条定向复核预算；保留待核实。`,
            ),
          }
        : { ...finding },
    ),
  };
  if (
    !object(draft) ||
    draft.version !== 1 ||
    draft.inputHash !== evaluation.inputHash ||
    !Array.isArray(draft.findings) ||
    draft.findings.length > MAX_FEEDBACK_CANDIDATES ||
    !Array.isArray(draft.evidence) ||
    draft.evidence.length > 40
  )
    throw new Error('Invalid candidate review envelope or input identity');
  for (const finding of result.findings.filter((item) =>
    selected.has(item.id),
  )) {
    try {
      const entries = draft.findings.filter(
        (item) => item?.findingId === finding.id,
      );
      if (!entries.length) continue;
      need(entries.length === 1, 'Duplicate candidate result');
      const entry = entries[0];
      const review = {
        status: entry.status,
        reason: entry.reason,
        checks: entry.checks,
      };
      need(Array.isArray(review.checks), 'Invalid feedback checks');
      const ids = [
        ...new Set(
          review.checks.flatMap((check) =>
            Array.isArray(check?.evidence) ? check.evidence : [],
          ),
        ),
      ];
      const extra = ids.flatMap((id) => {
        const original = evaluation.evidence.find((item) => item.id === id);
        const additions = draft.evidence.filter((item) => item?.id === id);
        need(
          additions.length <= 1 && !(original && additions.length),
          'Candidate evidence shadows an existing or duplicate id',
        );
        need(original || additions.length, 'Unknown feedback evidence id');
        return original ? [] : additions;
      });
      const combined = [...evaluation.evidence, ...extra];
      validateFeedbackReview(review, combined, finding);
      const verified = validateEvidence(combined);
      for (const item of verified) {
        const existing = result.evidence.find((prior) => prior.id === item.id);
        need(
          !existing || JSON.stringify(existing) === JSON.stringify(item),
          'Conflicting candidate evidence',
        );
      }
      const additions = verified.filter(
        (item) => !result.evidence.some((prior) => prior.id === item.id),
      );
      need(
        result.evidence.length + additions.length <= 100,
        'Candidate evidence exceeds report budget',
      );
      result.evidence.push(...additions);
      finding.feedbackReview = review;
    } catch (error) {
      finding.feedbackReview = insufficientFeedback(
        `本条定向复核未通过校验：${error.message}`,
      );
    }
  }
  return result;
}

// The finding is model-authored; the wrapper is written only by the trusted
// runner. Legacy drafts could carry arbitrary extra fields, so a nested status
// alone must never turn a re-export into evidence-reviewed formal feedback.
export function feedbackEvaluation(report) {
  const evaluation = report?.evaluation;
  if (!evaluation) return evaluation;
  const record = report.execution?.feedbackReview;
  const recorded =
    report.execution?.feedbackReviewCalls === 1 &&
    record?.version === 1 &&
    record.completed === true &&
    record.inputHash === report.basis?.inputHash &&
    Array.isArray(record.candidateIds) &&
    record.candidateIds.length <= MAX_FEEDBACK_CANDIDATES;
  return {
    ...evaluation,
    findings: evaluation.findings.map((finding) => {
      if (
        !['supported', 'contradicted'].includes(
          finding.feedbackReview?.status,
        ) ||
        (recorded && record.candidateIds.includes(finding.id))
      )
        return finding;
      return {
        ...finding,
        feedbackReview: insufficientFeedback(
          '缺少与本次输入绑定的工厂定向复核完成记录；保留为待核实候选。',
        ),
      };
    }),
  };
}
