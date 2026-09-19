// @vitest-environment node
//
// Vite bakes `process.env.NODE_ENV` into the client bundle
// (`JSON.stringify(process.env.NODE_ENV || mode)`), and React resolves its development build whenever
// that value is not `production`. The factory's verification step exports `NODE_ENV=test` before
// `pnpm build`, so the client build step must pin the environment itself. Without the pin the deployed
// client:
//   - logs React development warnings to the browser console, which browser acceptance records as page
//     errors, and
//   - keeps `import.meta.env.DEV` true, which pulls the dev tools layout and dev-only routes into the
//     production bundle and breaks the `defineDevRoutes()` build boundary.
//
// Only the build command's client step may override the inherited value; the server half keeps the
// environment it was handed.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const buildSource = readFileSync(
  path.resolve(__dirname, '../../scripts/build.mjs'),
  'utf8',
);

describe('client build environment', () => {
  it('pins NODE_ENV to production for the client build', () => {
    const clientBuild = buildSource.match(
      /run\('Build client'[\s\S]*?\n\}\);/,
    )?.[0];
    expect(clientBuild, 'client build step not found').toBeTruthy();
    expect(clientBuild).toMatch(/NODE_ENV:\s*'production'/);
  });

  it('spreads the inherited environment before the pin, so process.env cannot win', () => {
    const clientBuild =
      buildSource.match(/run\('Build client'[\s\S]*?\n\}\);/)?.[0] ?? '';
    const inheritedAt = clientBuild.indexOf('...process.env');
    const pinAt = clientBuild.indexOf("NODE_ENV: 'production'");
    expect(inheritedAt).toBeGreaterThanOrEqual(0);
    expect(pinAt).toBeGreaterThan(inheritedAt);
  });
});
