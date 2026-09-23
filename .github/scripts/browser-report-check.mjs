import { Buffer } from 'node:buffer';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

function throwInvalid(message) {
  throw new Error(message);
}
function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim())
    throwInvalid(`${label} must be a non-empty string.`);
}
function requireTexts(value, label) {
  if (!Array.isArray(value) || !value.length)
    throwInvalid(`${label} must be a non-empty array.`);
  value.forEach((item) => requireText(item, label));
}
export function validateCheck(check, index, evidenceRoot) {
  if (!check || typeof check !== 'object') {
    throwInvalid(`checks[${index}] must be an object.`);
  }
  requireText(check.criterion, `checks[${index}].criterion`);
  if (!['passed', 'failed', 'blocked', 'not_run'].includes(check.status)) {
    throwInvalid(`checks[${index}].status must be passed, failed, blocked or not_run.`);
  }
  const incomplete = ['blocked', 'not_run'].includes(check.status);
  if (incomplete) requireText(check.reason, `checks[${index}].reason`);
  requireTexts(check.actions, `checks[${index}].actions`);
  requireTexts(check.evidence, `checks[${index}].evidence`);
  if (!incomplete || check.screenshots?.length) {
    requireTexts(check.screenshots, `checks[${index}].screenshots`);
  } else if (!Array.isArray(check.screenshots)) {
    throwInvalid(`checks[${index}].screenshots must be an array.`);
  }

  for (const screenshot of check.screenshots) {
    const screenshotPath = path.resolve(evidenceRoot, screenshot);
    const relative = path.relative(evidenceRoot, screenshotPath);
    if (
      relative.startsWith('..') ||
      path.isAbsolute(relative) ||
      !/^[A-Za-z0-9][A-Za-z0-9-]*\.png$/u.test(screenshot)
    ) {
      throwInvalid(`Unsafe screenshot path in checks[${index}]: ${screenshot}`);
    }
    let stat;
    try {
      stat = statSync(screenshotPath);
    } catch {
      throwInvalid(`Screenshot does not exist: ${screenshot}`);
    }
    if (!stat.isFile() || stat.size < 1_000) {
      throwInvalid(`Screenshot is empty or invalid: ${screenshot}`);
    }
    const signature = readFileSync(screenshotPath).subarray(0, 8);
    if (!signature.equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
      throwInvalid(`Screenshot is not a PNG file: ${screenshot}`);
    }
  }
  return check.screenshots.length;
}
