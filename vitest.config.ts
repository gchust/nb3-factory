import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createReactVitestConfig } from '@nocobase/dev-config/vitest/react';

const root = fileURLToPath(new URL('.', import.meta.url));

// In the NocoBase monorepo the alias below points at the app-client source tree. A generated application is a
// standalone workspace, where that path does not exist and the installed package must be used instead; without the
// fallback every test importing `@nocobase/app-client` fails to resolve.
const monorepoAppClient = fileURLToPath(
  new URL('../../app/app-client/src/index.ts', import.meta.url),
);
const appClientEntry = existsSync(monorepoAppClient)
  ? monorepoAppClient
  : fileURLToPath(
      new URL(
        './node_modules/@nocobase/app-client/dist/index.js',
        import.meta.url,
      ),
    );

export default createReactVitestConfig({
  resolve: {
    alias: [
      {
        find: /^@nocobase\/app-client$/,
        replacement: appClientEntry,
      },
      {
        find: '@/jobs',
        replacement: fileURLToPath(new URL('./server/jobs', import.meta.url)),
      },
      {
        find: '@',
        replacement: fileURLToPath(new URL('./client', import.meta.url)),
      },
    ],
  },
  test: {
    root,
    // A glob rather than a list of filenames. The list had to be edited by hand for every test added or removed and
    // silently drifted: it named a file that no longer existed while seven real test files were absent from it, so
    // those tests were never run at all.
    include: ['tests/**/*.test.{ts,tsx}'],
    // A generated application ships no `tests/` — the template's `files` field does not include it — so an empty run
    // is the expected outcome there rather than a failure on `pnpm test` before a line of code has been written.
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'html'],
    },
  },
});
