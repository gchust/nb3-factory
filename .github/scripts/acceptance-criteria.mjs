// One parser for prompts, coverage checks and retests. Never infer coverage from
// the number of report rows or from the position of an unrelated observation.
const marker = /^(\s*)(?:([-*])\s+|([A-Za-z][A-Za-z0-9_-]*\d|\d+)[.)、:：]\s+)(.*)$/u;
const optionalMarker = /^\[(?:optional|可选)\]\s*/iu;
const generatedId = (index) => `C${String(index + 1).padStart(2, '0')}`;

export function parseAcceptance(text) {
  const lines = String(text ?? '').split(/\r?\n/u);
  let fence = false;
  const entries = lines.map((line) => {
    if (/^\s*```|^\s*~~~/u.test(line)) fence = !fence;
    return { line, match: fence ? null : marker.exec(line) };
  });
  const indents = entries.filter((e) => e.match).map((e) => e.match[1].length);
  if (!indents.length) {
    const value = lines.join('\n').trim();
    if (!value) throw new Error('Acceptance criteria must not be empty.');
    return { preamble: '', criteria: [{ id: 'C01', text: value, optional: false }] };
  }
  const indent = Math.min(...indents);
  const preamble = [];
  const criteria = [];
  for (const { line, match } of entries) {
    if (match && match[1].length === indent) {
      const supplied = match[3];
      const id = supplied && !/^\d+$/u.test(supplied)
        ? supplied
        : generatedId(criteria.length);
      criteria.push({ id, text: match[4], optional: optionalMarker.test(match[4]) });
    } else if (criteria.length) {
      criteria.at(-1).text += `\n${line}`;
    } else {
      preamble.push(line);
    }
  }
  const seen = new Set();
  for (const criterion of criteria) {
    criterion.text = criterion.text.replace(optionalMarker, '').trim();
    if (!criterion.text || seen.has(criterion.id))
      throw new Error(`Empty or duplicate acceptance criterion: ${criterion.id}`);
    seen.add(criterion.id);
  }
  return { preamble: preamble.join('\n').trim(), criteria };
}

export function parseAcceptanceCriteria(text) {
  return parseAcceptance(text).criteria;
}

export function acceptanceCriteria(task) {
  const all = parseAcceptanceCriteria(task?.acceptanceCriteria);
  if (task?.qaScope !== 'focused') return all;
  // Focus is a selection of the ORIGINAL list, not a renumbered second list.
  if (!Array.isArray(task.qaCriteriaIds) || !task.qaCriteriaIds.length)
    throw new Error('Focused QA requires qaCriteriaIds.');
  const ids = new Set(task.qaCriteriaIds);
  if (ids.size !== task.qaCriteriaIds.length || [...ids].some((id) => !all.some((c) => c.id === id)))
    throw new Error('Focused QA contains duplicate or unknown criterion IDs.');
  return all.filter((c) => ids.has(c.id));
}

export function renderAcceptance(task) {
  const { preamble } = parseAcceptance(task?.acceptanceCriteria);
  return [preamble, ...acceptanceCriteria(task).map((c) =>
    `${c.id}. ${c.optional ? '[optional] ' : ''}${c.text}`,
  )].filter(Boolean).join('\n\n');
}

function normalizedText(value) {
  return String(value ?? '').trim().replace(/\s+/gu, ' ');
}

export function identifyCheck(check, criteria) {
  let id = check.id;
  if (id != null) {
    if (/^(?:criterion-)?\d+$/u.test(String(id))) {
      id = generatedId(Number(String(id).replace('criterion-', '')) - 1);
    }
    const found = criteria.find((c) => c.id === id);
    if (!found) throw new Error(`Unknown acceptance criterion ID: ${check.id}`);
    return found;
  }
  const text = normalizedText(check.criterion);
  const prefixed = marker.exec(text);
  const found = criteria.filter((c) =>
    normalizedText(c.text) === text ||
    (prefixed && (prefixed[3] === c.id || normalizedText(prefixed[4]) === normalizedText(c.text))),
  );
  if (found.length !== 1)
    throw new Error(`Missing or ambiguous acceptance criterion ID: ${text}`);
  return found[0];
}

export function validateCoverage(checks, criteria) {
  const seen = new Set();
  for (const check of checks) {
    const criterion = identifyCheck(check, criteria);
    if (seen.has(criterion.id)) throw new Error(`Duplicate acceptance result: ${criterion.id}`);
    seen.add(criterion.id);
    check.id = criterion.id;
    // Report and repair against the actual requirement, not an Agent's
    // abbreviated replacement which could omit e.g. the edit/prefill obligation.
    check.criterion = criterion.text;
  }
  const missing = criteria.filter((c) => !seen.has(c.id));
  if (missing.length) throw new Error(`Missing acceptance results: ${missing.map((c) => c.id).join(', ')}`);
}
