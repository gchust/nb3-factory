import assert from 'node:assert/strict';
import test from 'node:test';

import { GitHubClient, STATUS_LABELS } from '../factory-lib.mjs';
import { PRESET_FORM_PATH, renderPresetForm } from '../issue-presets.mjs';
import { syncIssuePresets } from '../sync-issue-presets.mjs';

const ROUTE = `/contents/${PRESET_FORM_PATH}`;
const encode = (text) => Buffer.from(text).toString('base64');

// The PUT fails with `putError`; reads of the form return `reads` in order.
function client({ reads, putError }) {
  const calls = [];
  return {
    calls,
    ensureStatusLabels: GitHubClient.prototype.ensureStatusLabels,
    async getRepository() {
      return { default_branch: 'develop' };
    },
    async request(method, route) {
      calls.push(`${method} ${route}`);
      if (method === 'GET' && route === '/labels')
        return Object.keys(STATUS_LABELS).map((name) => ({ name }));
      if (method === 'GET' && route.startsWith('/labels/')) return {};
      if (method === 'GET' && route === '/issues') return [];
      if (method === 'GET' && route === ROUTE) return reads.shift();
      if (method === 'PUT' && route === ROUTE) throw putError;
      throw new Error(`Unexpected ${method} ${route}`);
    },
  };
}

test('a 409 for a write that already landed counts as written', async (t) => {
  t.mock.method(console, 'log', () => {});
  const content = renderPresetForm([]);
  const c = client({
    reads: [
      { sha: 'old', content: encode('old choices') },
      { sha: 'new', content: encode(content) },
    ],
    putError: new Error(
      `GitHub API PUT ${ROUTE} failed (409): {"message":"does not match"}`,
    ),
  });
  assert.equal(await syncIssuePresets(c), true);
  assert.deepEqual(
    c.calls.filter((call) => call.endsWith(ROUTE)),
    [`GET ${ROUTE}`, `PUT ${ROUTE}`, `GET ${ROUTE}`],
  );
});

test('a 409 over different content, or any other failure, still fails', async () => {
  const conflict = new Error(`GitHub API PUT ${ROUTE} failed (409): conflict`);
  await assert.rejects(
    syncIssuePresets(
      client({
        reads: [
          { sha: 'old', content: encode('old choices') },
          { sha: 'other', content: encode('someone else') },
        ],
        putError: conflict,
      }),
    ),
    /failed \(409\)/,
  );
  await assert.rejects(
    syncIssuePresets(
      client({
        reads: [{ sha: 'old', content: encode('old choices') }],
        putError: new Error(`GitHub API PUT ${ROUTE} failed (422): bad`),
      }),
    ),
    /failed \(422\)/,
  );
});
