// Fingerprints the files whose change starts the source baseline check on a
// pull request: exactly the `on.pull_request.paths` of source-baseline.yml,
// read from the same checkout. The check verifies nothing else from this
// repository (workflow-policy.test.mjs keeps every script it runs inside those
// filters), and pull request runs verify the pinned source SHA that
// source-baseline-ref.mjs, one of those files, declares. Two runs of one pull
// request with the same fingerprint therefore verify the same thing.
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

// The paths list of the pull_request trigger. A plain reading of the one
// block, not a YAML parser: the checkout has no dependencies installed, and an
// unexpected shape fails rather than guessing.
export function pullRequestPaths(workflow) {
  const block = /^ {2}pull_request:\n((?: {4}.*\n|\s*\n)+)/m.exec(
    workflow,
  )?.[1];
  assert.ok(block, 'source-baseline.yml has no pull_request trigger');
  const list = /^ {4}paths:\n((?: {6}.*\n|\s*\n)+)/m.exec(block)?.[1];
  assert.ok(list, 'the pull_request trigger has no paths');
  const paths = [...list.matchAll(/^ {6}- '([^']+)'$/gm)].map(
    ([, value]) => value,
  );
  assert.ok(paths.length, 'the pull_request paths are empty');
  return paths;
}

// GitHub's filter syntax, limited to what the list uses: literal paths and `*`
// within one path segment. Anything else is refused, so a new pattern makes
// this fail loudly instead of hashing a different set than the trigger.
export function pathMatcher(patterns) {
  const expressions = patterns.map((pattern) => {
    assert.match(pattern, /^[\w./*-]+$/, `unsupported path filter: ${pattern}`);
    assert.doesNotMatch(pattern, /\*\*/, `unsupported path filter: ${pattern}`);
    const source = pattern
      .split('*')
      .map((part) => part.replace(/[.]/g, '\\.'))
      .join('[^/]*');
    return new RegExp(`^${source}$`);
  });
  return (file) => expressions.some((expression) => expression.test(file));
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
