// @vitest-environment node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../..',
);

/**
 * The factory runs the verification build with `NODE_ENV=test`. Vite reads that ambient value at build
 * time for two decisions that must agree — React's CJS entry (production vs development build) and
 * esbuild's JSX runtime (jsx-runtime vs jsx-dev-runtime). Inheriting `test` selected both development
 * halves, so the accepted client printed dev-only console errors (React's inline `<script>` warning
 * from the theme provider fired on every page). Forcing only one half mismatches them and crashes at
 * runtime with `jsxDEV is not a function`. The client build must therefore pin `NODE_ENV=production`.
 */
describe('client build environment', () => {
  const source = readFileSync(path.join(appRoot, 'scripts/build.mjs'), 'utf8');

  it('pins NODE_ENV=production for the client build', () => {
    const start = source.indexOf("run('Build client'");
    expect(start).toBeGreaterThanOrEqual(0);

    const end = source.indexOf('});', start);
    expect(end).toBeGreaterThan(start);

    const clientBuildStep = source.slice(start, end);
    expect(clientBuildStep).toMatch(/NODE_ENV:\s*'production'/);
  });
});
