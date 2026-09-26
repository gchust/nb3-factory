// Model output only assigns existing findings to groups. Original assessments,
// severities and evidence remain authoritative; this module never calls a model.
import { createHash } from 'node:crypto';

const hash = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const object = (value) =>
  value && typeof value === 'object' && !Array.isArray(value);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const text = (value, max = 4000) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const digest = (value) => /^[a-f0-9]{64}$/.test(value ?? '');
const sourcesOf = (findings) =>
  findings.map(({ id, report, fingerprint }) => ({ id, report, fingerprint }));
const fingerprintOf = (sources) => hash({ version: 1, sources });
export const occurrenceId = (item) => `${item.report}:${item.finding.id}`;

export function createClassificationInput(occurrences) {
  const findings = occurrences
    .map((item) => {
      const value = {
        id: occurrenceId(item),
        report: item.report,
        issue: item.issue,
        taskTitle: item.taskTitle,
        appVersion: item.appVersion ?? null,
        appTemplate: item.appTemplate ?? null,
        finding: item.finding,
        targets: [...item.targets].sort(),
        paths: [...item.paths].sort(),
        evidence: item.evidence ?? [],
      };
      return { ...value, fingerprint: hash(value) };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  const input = {
    version: 1,
    inputHash: fingerprintOf(sourcesOf(findings)),
    findings,
  };
  validateClassificationInput(input);
  return input;
}

export function validateClassificationInput(input) {
  assert(
    input?.version === 1 && Array.isArray(input.findings),
    'Invalid classification input',
  );
  const ids = new Set();
  for (const item of input.findings) {
    assert(object(item), 'Invalid classification finding');
    const { fingerprint, ...value } = item;
    assert(
      text(item.id, 300) &&
        text(item.report, 200) &&
        object(item.finding) &&
        item.id === `${item.report}:${item.finding.id}`,
      'Invalid finding identity',
    );
    assert(!ids.has(item.id), 'Duplicate finding identity');
    ids.add(item.id);
    assert(
      digest(fingerprint) && hash(value) === fingerprint,
      'Finding fingerprint mismatch',
    );
  }
  assert(
    input.inputHash === fingerprintOf(sourcesOf(input.findings)),
    'Classification input fingerprint mismatch',
  );
  return input;
}

export function validateClassification(classification, input) {
  assert(
    classification?.version === 1 &&
      Array.isArray(classification.sources) &&
      Array.isArray(classification.groups),
    'Invalid classification document',
  );
  const sources = new Map();
  for (const source of classification.sources) {
    assert(
      object(source) &&
        text(source.id, 300) &&
        text(source.report, 200) &&
        source.id.startsWith(`${source.report}:`) &&
        digest(source.fingerprint),
      'Invalid classification source',
    );
    assert(!sources.has(source.id), 'Duplicate classification source');
    sources.set(source.id, source);
  }
  assert(
    classification.inputHash === fingerprintOf(classification.sources),
    'Classification fingerprint mismatch',
  );
  if (input) {
    validateClassificationInput(input);
    assert(
      classification.inputHash === input.inputHash &&
        JSON.stringify(classification.sources) ===
          JSON.stringify(sourcesOf(input.findings)),
      'Stale classification input',
    );
  }
  const seen = new Set();
  for (const group of classification.groups) {
    assert(
      object(group) &&
        text(group.title, 300) &&
        text(group.reason) &&
        Array.isArray(group.members) &&
        group.members.length > 0,
      'Invalid classification group',
    );
    const reports = new Set();
    for (const id of group.members) {
      assert(sources.has(id), 'Unknown finding in classification');
      assert(!seen.has(id), 'Finding appears in multiple groups');
      const report = sources.get(id).report;
      assert(
        !reports.has(report),
        'Two findings from the same report cannot merge',
      );
      reports.add(report);
      seen.add(id);
    }
  }
  assert(seen.size === sources.size, 'Classification omits findings');
  return classification;
}

export function finalizeClassification(draft, input, classifier = {}) {
  validateClassificationInput(input);
  assert(
    draft?.version === 1 &&
      draft.inputHash === input.inputHash &&
      Array.isArray(draft.groups),
    'Classification output does not match input',
  );
  const result = {
    version: 1,
    inputHash: input.inputHash,
    sources: sourcesOf(input.findings),
    groups: draft.groups.map((group) => ({
      title: group?.title,
      reason: group?.reason,
      members: group?.members,
    })),
    classifier,
  };
  return validateClassification(result, input);
}

// Preserve decisions only for unchanged source findings. New/revised findings
// remain separate until an Agent finishes; never fall back to lexical merging.
export function projectClassification(input, classification) {
  validateClassificationInput(input);
  let accepted = null;
  try {
    if (classification) accepted = validateClassification(classification);
  } catch {
    /* invalid cache is not a decision */
  }
  const current = new Map(input.findings.map((item) => [item.id, item]));
  const previous = new Map(
    (accepted?.sources ?? []).map((item) => [item.id, item]),
  );
  const assigned = new Set();
  const groups = [];
  for (const group of accepted?.groups ?? []) {
    const members = group.members.filter(
      (id) => current.get(id)?.fingerprint === previous.get(id)?.fingerprint,
    );
    if (!members.length) continue;
    members.forEach((id) => assigned.add(id));
    groups.push({ ...group, members, reviewed: true });
  }
  const pending = input.findings.filter((item) => !assigned.has(item.id));
  groups.push(
    ...pending.map((item) => ({
      title: item.finding.title,
      reason: '',
      members: [item.id],
      reviewed: false,
    })),
  );
  return {
    groups,
    pending: pending.length,
    current: accepted?.inputHash === input.inputHash,
  };
}
