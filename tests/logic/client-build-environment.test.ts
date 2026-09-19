// @vitest-environment node

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `verify.sh` exports NODE_ENV=test before `pnpm build`, and Vite bakes the
 * ambient NODE_ENV into the client bundle. When the client build inherits that
 * value React resolves to its development build, so the production bundle
 * carries development warnings (including the script-tag warning emitted on
 * every page), is larger, and runs slower. The client build must therefore pin
 * NODE_ENV=production for its own child process.
 */
describe('client build environment', () => {
  const script = readFileSync(path.resolve('scripts', 'build.mjs'), 'utf8');

  it('pins NODE_ENV=production for the client build', () => {
    const call = script.match(/run\(\s*'Build client'[\s\S]*?\n\}\);/u)?.[0];
    expect(call).toBeTruthy();
    expect(call).toMatch(/NODE_ENV:\s*'production'/u);
  });

  it('lets the pinned value win over the inherited environment', () => {
    const call = script.match(/run\(\s*'Build client'[\s\S]*?\n\}\);/u)?.[0];
    const spread = call?.indexOf('...process.env') ?? -1;
    const pinned = call?.indexOf("NODE_ENV: 'production'") ?? -1;
    expect(spread).toBeGreaterThanOrEqual(0);
    expect(pinned).toBeGreaterThan(spread);
  });
});
