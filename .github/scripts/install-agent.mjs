import { spawnSync } from 'node:child_process';

import { resolveAgent } from './agent-registry.mjs';

const adapter = resolveAgent();
const result = spawnSync(
  'npm',
  [
    'install',
    '--global',
    '--ignore-scripts',
    `${adapter.package}@${adapter.version}`,
  ],
  { stdio: 'inherit' },
);
if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(
    `Code Agent installation failed (${result.status ?? result.signal}).`,
  );
}
