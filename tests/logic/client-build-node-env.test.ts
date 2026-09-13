import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const buildScript = readFileSync(
  path.resolve(process.cwd(), 'scripts/build.mjs'),
  'utf8',
);

describe('client build environment', () => {
  it('builds the client with NODE_ENV=production', () => {
    // Vite selects React's runtime from `NODE_ENV` alone, not from the build mode. Verification exports
    // `NODE_ENV=test` while it runs `pnpm build`, so without this override the client ships React's
    // development runtime and its dev-only console warnings, which acceptance reads as application errors.
    const clientBuild = buildScript.match(/run\(\s*'Build client'[\s\S]*?\);/u);

    expect(clientBuild, 'the client build step is present').not.toBeNull();
    expect(clientBuild?.[0]).toMatch(/NODE_ENV:\s*'production'/u);
  });
});
