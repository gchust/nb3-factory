// Redact strings before JSON encoding, so quoted credentials cannot corrupt a
// prompt snapshot/result. Non-JSON diagnostic lines remain readable text.
export function scrubSecrets(text) {
  return String(text)
    .replaceAll(/Factory-QA-[A-Za-z0-9-]+/gu, '[REDACTED]')
    .replaceAll(/\b((?:[A-Z0-9_]+)?(?:PASSWORD|TOKEN|SECRET|API_KEY|APIKEY))\s*[=:]\s*["']?[^\s"',}]{4,}/giu, '$1=[REDACTED]');
}

export function scrubHistoryFile(text, name, redact = value => value) {
  const scrub = value => scrubSecrets(redact(value));
  const replacer = (key, value) => typeof value !== 'string' ? value
    : /^(?:.*[_-])?(?:password|token|secret|api[_-]?key)$/i.test(key) ? '[REDACTED]' : scrub(value);
  if (name.endsWith('.json')) {
    try { return `${JSON.stringify(JSON.parse(text), replacer, 2)}\n`; }
    catch { return scrub(text); }
  }
  if (name.endsWith('.jsonl')) {
    return text.split('\n').map(line => {
      try { return JSON.stringify(JSON.parse(line), replacer); }
      catch { return scrub(line); }
    }).join('\n');
  }
  return scrub(text);
}
