import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

/**
 * Complete the extension of the application's relative ESM imports for the modules Node resolves itself.
 *
 * `server/`, `database/` and `cli/` are written with extensionless relative imports, which `tsx` resolves in
 * development and `tsc-alias` completes at build time. Vitest transforms the application's TypeScript but leaves
 * resolution to Node — and a module the application loads natively rather than through the test's own import graph,
 * such as a migration or seed that `@nocobase/db` imports to run, cannot reach its siblings that way. Rewriting those
 * specifiers to the source file that exists keeps the test on the same sources the application runs, and is a no-op
 * for every import that already resolves.
 */
function sourceTargets(specifier: string, parentURL: string): string[] {
  if (!specifier.startsWith('.')) return [];
  const candidates: string[] = [];
  const rewritten = specifier.replace(
    /\.([cm]?)jsx?$/u,
    (_match, module: string) => {
      return module === 'c' ? '.cts' : module === 'm' ? '.mts' : '.ts';
    },
  );
  if (rewritten !== specifier) {
    candidates.push(rewritten);
    if (rewritten.endsWith('.ts')) candidates.push(`${rewritten}x`);
    return candidates;
  }
  // No extension to replace: a JavaScript sibling must win, so only offer the source files when it is absent.
  const existing = new URL(specifier, parentURL);
  if (existsSync(fileURLToPath(existing))) return [];
  candidates.push(
    `${specifier}.ts`,
    `${specifier}x`,
    `${specifier}/index.ts`,
    `${specifier}/index.tsx`,
  );
  return candidates;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const { parentURL } = context;
    if (!parentURL?.startsWith('file:')) return nextResolve(specifier, context);
    for (const target of sourceTargets(specifier, parentURL)) {
      const candidate = new URL(target, parentURL);
      if (existsSync(fileURLToPath(candidate))) {
        return { url: candidate.href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});
