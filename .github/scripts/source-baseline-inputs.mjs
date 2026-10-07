// Fingerprints the files whose change starts the source baseline check on a
// pull request: exactly the `on.pull_request.paths` of source-baseline.yml,
// read from the checkout being verified. workflow-policy.test.mjs keeps every
// script the check runs inside those filters, and pull request runs verify the
// pinned source SHA that source-baseline-ref.mjs, one of those files, declares.
// It is not a complete description of a run: Node.js 24.x, the runner image,
// the npm registry and the overlay dependencies the portable job installs
// without a lockfile are outside it. Two runs of one pull request with the same
// fingerprint ran the same factory files against the same source, which is
// what a pull request check is for; a re-run still verifies in full.
//
// The workflow runs this file from the default branch, never from the pull
// request it fingerprints.
//
// Usage: node source-baseline-inputs.mjs <checkout>
// Prints a hex SHA-256 over the matching paths and their blob ids.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const WORKFLOW = '.github/workflows/source-baseline.yml';

// One list item: `- path`, `- 'path'` or `- "path"`, optionally followed by a
// comment. Escapes inside double quotes are not read.
const ITEM = /^ {6}- (?:'([^']*)'|"([^"\\]*)"|([^\s'"#][^\s#]*))(?:\s+#.*)?$/;

// The paths list of the pull_request trigger. A strict reading of the one
// block, not a YAML parser, since the checkout has no dependencies installed.
// Every line of the list must be blank, a comment or an item of one of the
// forms above. Anything else fails, so the fingerprint can never silently
// cover fewer files than the trigger does.
export function pullRequestPaths(workflow) {
  const lines = workflow.split(/\r?\n/);
  let index = lines.indexOf('  pull_request:');
  assert.ok(index >= 0, 'source-baseline.yml has no pull_request trigger');
  const insideTrigger = (line) =>
    line.trim() === '' || /^\s*#/.test(line) || /^ {4}/.test(line);
  for (index += 1; index < lines.length; index += 1)
    if (!insideTrigger(lines[index]) || lines[index] === '    paths:') break;
  assert.equal(
    lines[index],
    '    paths:',
    'the pull_request trigger has no paths',
  );
  const paths = [];
  for (index += 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '' || /^\s*#/.test(line)) continue;
    if (!/^ {6}/.test(line)) break;
    const item = ITEM.exec(line);
    assert.ok(item, `unreadable pull_request path entry: ${line.trim()}`);
    const value = item[1] ?? item[2] ?? item[3];
    assert.ok(value, `empty pull_request path entry: ${line.trim()}`);
    paths.push(value);
  }
  assert.ok(paths.length, 'the pull_request paths are empty');
  return paths;
}

// GitHub's filter syntax, limited to what the list uses: literal paths, `*`
// within one path segment and `**` across segments (zero or more of them). Anything else (`?`, `[`,
// `!` negations) is refused, so a new kind of pattern makes this fail loudly
// instead of hashing a different set than the trigger.
export function pathMatcher(patterns) {
  const expressions = patterns.map((pattern) => {
    assert.match(pattern, /^[\w./*-]+$/, `unsupported path filter: ${pattern}`);
    assert.doesNotMatch(
      pattern,
      /\*{3}/,
      `unsupported path filter: ${pattern}`,
    );
    // `/**/` also matches no directory at all (`a/**/b` matches `a/b`), as in
    // GitHub's filters; any other `**` matches across segments. Pattern and
    // path both get a leading slash, so a leading `**/` matches the root too.
    const source = `/${pattern}`
      .split('/**/')
      .map((section) =>
        section
          .split('**')
          .map((part) =>
            part
              .split('*')
              .map((literal) => literal.replace(/[.]/g, '\\.'))
              .join('[^/]*'),
          )
          .join('.*'),
      )
      .join('/(?:.*/)?');
    return new RegExp(`^${source}$`);
  });
  return (file) =>
    expressions.some((expression) => expression.test(`/${file}`));
}

export function inputFingerprint(checkout) {
  const matches = pathMatcher(
    pullRequestPaths(readFileSync(path.join(checkout, WORKFLOW), 'utf8')),
  );
  // Blob ids from the index of the checked-out commit: content-addressed, so
  // the line endings or timestamps of the working tree play no part.
  const entries = execFileSync(
    'git',
    ['-C', checkout, 'ls-files', '-s', '-z'],
    {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  )
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const [meta, file] = line.split('\t');
      const [mode, blob] = meta.split(' ');
      return { file, mode, blob };
    })
    .filter(({ file }) => matches(file))
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  assert.ok(
    entries.some(({ file }) => file === WORKFLOW),
    'the workflow itself must be one of its inputs',
  );
  const hash = createHash('sha256');
  for (const { file, mode, blob } of entries)
    hash.update(`${mode} ${blob}\t${file}\n`);
  return hash.digest('hex');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const checkout = process.argv[2];
  assert.ok(checkout, 'Usage: source-baseline-inputs.mjs <checkout>');
  console.log(inputFingerprint(checkout));
}
