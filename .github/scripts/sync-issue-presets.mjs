import { pathToFileURL } from 'node:url';

import { GitHubClient } from './factory-lib.mjs';
import { listAll } from './comment-queue.mjs';
import { PRESET_FORM_PATH, PRESET_LABEL, renderPresetForm } from './issue-presets.mjs';

export async function syncIssuePresets(client) {
  const repository = await client.getRepository();
  const branch = repository.default_branch;
  const label = await client.request('GET', `/labels/${encodeURIComponent(PRESET_LABEL)}`, { allow404: true });
  if (!label) {
    await client.request('POST', '/labels', { body: {
      name: PRESET_LABEL, color: '5319e7',
      description: 'Reusable human-authored build case; this Issue does not run itself',
    } });
  }
  const issues = await listAll(client, '/issues', { state: 'all', labels: PRESET_LABEL });
  const content = renderPresetForm(issues);
  const route = `/contents/${PRESET_FORM_PATH}`;
  const existing = await client.request('GET', route, { query: { ref: branch }, allow404: true });
  if (existing && Buffer.from(existing.content, 'base64').toString('utf8') === content) return false;
  await client.request('PUT', route, { body: {
    branch, message: 'chore: sync preset Issue choices',
    content: Buffer.from(content).toString('base64'),
    ...(existing ? { sha: existing.sha } : {}),
  } });
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const changed = await syncIssuePresets(new GitHubClient({
    token: process.env.GITHUB_TOKEN,
    repository: process.env.GITHUB_REPOSITORY,
    apiUrl: process.env.GITHUB_API_URL,
  }));
  console.log(changed ? 'Updated preset Issue choices.' : 'Preset Issue choices are unchanged.');
}
