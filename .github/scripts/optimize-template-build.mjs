import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Reapply only our narrow hooks after a template refresh; never replace upstream build logic.
export function optimizeTemplateBuild(root) {
  const file = path.join(root, 'scripts/build.mjs');
  let source = readFileSync(file, 'utf8');
  if (source.includes("import('../.github/scripts/deployment-cache.mjs')"))
    return [];
  const replace = (before, after) => {
    if (!source.includes(before))
      throw new Error(`Unsupported template build hook: ${before}`);
    source = source.replace(before, after);
  };
  replace(
    "const { default: spawn } = await import('cross-spawn');",
    "const { default: spawn } = await import('cross-spawn');\nconst { recordTiming } = await import('../.github/scripts/timing.mjs');\nconst { deploymentCache, preserveDeploymentDependencies } = await import('../.github/scripts/deployment-cache.mjs');",
  );
  replace(
    'fs.rmSync(distDir, { recursive: true, force: true });',
    'preserveDeploymentDependencies(rootDir);\nfs.rmSync(distDir, { recursive: true, force: true });',
  );
  replace(
    '  const result = spawn.sync(command, args, {',
    '  const started = Date.now();\n  const result = spawn.sync(command, args, {',
  );
  replace(
    '  if (result.error) {',
    '  recordTiming(`build:${label}`, started, result.status ?? 1);\n  if (result.error) {',
  );
  replace(
    "run(\n  'Install server production dependencies',",
    "const dependencyCache = deploymentCache(rootDir, process.argv.slice(2).filter((arg) => arg !== '--tar'));\nconst cacheStarted = Date.now();\nconst cacheHit = dependencyCache?.restore() ?? false;\nrecordTiming('build:dependency-cache-restore', cacheStarted);\nif (!cacheHit) {\nrun(\n  'Install server production dependencies',",
  );
  replace(
    '// Removes type declarations, third-party source maps',
    '}\n// Removes type declarations, third-party source maps',
  );
  replace(
    "runHookStage(buildHooks, 'afterBuild', run);",
    "runHookStage(buildHooks, 'afterBuild', run);\ndependencyCache?.save();",
  );
  writeFileSync(file, source);
  return ['factory-build-timing-and-dependency-cache'];
}
