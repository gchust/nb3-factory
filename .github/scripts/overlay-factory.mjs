import {
  cpSync,
  existsSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { applyBeta34Compatibility } from './template-beta34-compat.mjs';
import { adaptTemplateTests } from './adapt-template-tests.mjs';

const [controlArg, workspaceArg, controlSha] = process.argv.slice(2);
if (!controlArg || !workspaceArg || !/^[a-f0-9]{40}$/.test(controlSha ?? '')) {
  throw new Error(
    'Usage: overlay-factory.mjs <control> <fresh-workspace> <control-sha>',
  );
}
const control = realpathSync(controlArg);
const workspace = realpathSync(workspaceArg);
if (
  control === workspace ||
  control.startsWith(`${workspace}/`) ||
  workspace.startsWith(`${control}/`)
) {
  throw new Error(
    'Control and generated workspace must be separate directories.',
  );
}
if (existsSync(path.join(workspace, '.git')))
  throw new Error('Expected a fresh application without Git history.');
const read = (root, file) => readFileSync(path.join(root, file), 'utf8');
const app = JSON.parse(read(workspace, 'package.json'));
const factory = JSON.parse(read(control, 'package.json'));
if (
  app.nocobase?.templateKind !== 'app' ||
  !app.nocobase.defaultTemplateVersion
) {
  throw new Error(
    'Generated directory is not a versioned NocoBase application template.',
  );
}

function section(file, name) {
  const text = read(control, file);
  const start = `<!-- factory:${name}:start -->`;
  const end = `<!-- factory:${name}:end -->`;
  const from = text.indexOf(start);
  const to = text.indexOf(end);
  if (from < 0 || to <= from)
    throw new Error(`Missing factory section in ${file}.`);
  return text.slice(from, to + end.length);
}

const readme = `${section('README.MD', 'readme')}\n\n${read(workspace, 'README.MD')}`;
const agentGuide = read(workspace, 'AGENTS.md');
const headingEnd = agentGuide.indexOf('\n');
if (headingEnd < 0) throw new Error('Generated AGENTS.md has no heading.');
const agents = `${agentGuide.slice(0, headingEnd)}\n\n${section('AGENTS.md', 'boundary')}\n${agentGuide.slice(headingEnd)}`;
const eslint = read(workspace, 'eslint.config.js');
if ([...eslint.matchAll(/^export default /gm)].length !== 1) {
  throw new Error(
    'Unsupported template ESLint export; update the factory overlay before refreshing.',
  );
}
const factoryEslint = `import factoryConfig from './.github/scripts/factory-eslint.mjs';\n\n${eslint.replace(/^export default /m, 'const applicationConfig = ')}\n\nexport default [...(Array.isArray(applicationConfig) ? applicationConfig : [applicationConfig]), factoryConfig];\n`;

rmSync(path.join(workspace, '.github'), { recursive: true, force: true });
cpSync(path.join(control, '.github'), path.join(workspace, '.github'), {
  recursive: true,
});
cpSync(path.join(control, '.npmrc'), path.join(workspace, '.npmrc'));
writeFileSync(path.join(workspace, 'README.MD'), readme);
writeFileSync(path.join(workspace, 'AGENTS.md'), agents);
writeFileSync(path.join(workspace, 'eslint.config.js'), factoryEslint);
// Preserve repository-owned agent guidance; plugin sync subsequently refreshes installed skills.
if (existsSync(path.join(control, '.agents'))) {
  cpSync(path.join(control, '.agents'), path.join(workspace, '.agents'), {
    recursive: true,
  });
}
// Generated skills and root configuration belong to the refresh baseline.
const ignorePath = path.join(workspace, '.gitignore');
const ignore = read(workspace, '.gitignore');
writeFileSync(
  ignorePath,
  `${ignore.trimEnd()}\n\n# Keep agent guidance and generated configuration in refreshed baselines.\n!/.agents/\n!/.agents/**\n!/config.yml\n`,
);
app.scripts = {
  ...app.scripts,
  'factory:test': factory.scripts['factory:test'],
};
app.devDependencies = {
  ...app.devDependencies,
  '@playwright/test':
    app.devDependencies?.['@playwright/test'] ||
    factory.devDependencies['@playwright/test'],
};
const compatibilityFixes = adaptTemplateTests(workspace, app);
compatibilityFixes.push(...applyBeta34Compatibility(workspace, app));
// Published beta.15 plugins import these two undeclared client dependencies.
// Scope fixes to this template; future baselines keep their dependency choices.
if (app.nocobase.defaultTemplateVersion === '1.0.0-beta.15') {
  for (const [plugin, dependency, version] of [
    ['@nocobase/app-plugin-notification-provider', 'sonner', '2.0.8'],
    ['@nocobase/app-plugin-workflow', '@xyflow/react', '12.11.3'],
  ]) {
    if (
      (app.devDependencies[plugin] || app.dependencies?.[plugin]) &&
      !app.devDependencies[dependency] &&
      !app.dependencies?.[dependency]
    ) {
      app.devDependencies[dependency] = version;
      compatibilityFixes.push(
        `beta.15 ${plugin}: add missing ${dependency}@${version}`,
      );
    }
  }
}
// Production installation runs in dist and needs the factory scoped registry.
// Preserve upstream support when present, regardless of the template version.
const build = read(workspace, 'scripts/build.mjs');
if (!build.includes("path.join(rootDir, '.npmrc')")) {
  const install = "run(\n  'Install server production dependencies',";
  if (!build.includes(install))
    throw new Error('Cannot apply production registry fix to this template.');
  writeFileSync(
    path.join(workspace, 'scripts/build.mjs'),
    build.replace(
      install,
      `fs.copyFileSync(path.join(rootDir, '.npmrc'), path.join(distDir, '.npmrc'));\n${install}`,
    ),
  );
  compatibilityFixes.push('build: copy scoped registry into dist');
}
// A plugin declares its migrations, seeds and collections as paths under `./database` and publishes those TypeScript
// sources next to the compiled `dist/database` mirror, and the resolver prefers the sources — which plain `node`
// cannot load from inside `node_modules` on a deployment. The template prunes files by extension, which cannot see a
// directory, so it calls the factory's own rule at the one place that happens to be walking the tree. The anchors
// below are the template's own lines: a template that rearranges them fails this refresh instead of quietly
// generating a deployment that boots without its tables.
const prune = read(workspace, 'scripts/utils/prune-dist-artifacts.mjs');
if (!prune.includes('prune-superseded-sources.mjs')) {
  const prunePatches = [
    [
      'import',
      "import { formatMegabytes } from './server-deps.mjs';",
      "import { formatMegabytes } from './server-deps.mjs';\nimport { removeSupersededDatabaseDirectory } from '../../.github/scripts/prune-superseded-sources.mjs';",
    ],
    [
      'walk',
      `    if (entry.isDirectory()) {\n      prune(entryPath, treeRoot, removed);`,
      `    if (entry.isDirectory()) {\n      // Checked before descending: the directory itself is what has to go, so walking into it first would be\n      // wasted work and a second pass.\n      if (removeSupersededDatabaseDirectory(entryPath, removed)) continue;\n      prune(entryPath, treeRoot, removed);`,
    ],
    [
      'report',
      '`Removed ${removed.count} declaration, source map, and documentation files from the deployment tree (${formatMegabytes(removed.bytes)}).`',
      '`Removed ${removed.count} declaration, source map, documentation, and superseded source files from the deployment tree (${formatMegabytes(removed.bytes)}).`',
    ],
  ];
  const unpatched = prunePatches
    .filter(([, anchor]) => !prune.includes(anchor))
    .map(([what]) => what);
  if (unpatched.length > 0)
    throw new Error(
      `Cannot apply superseded-database pruning to this template; unrecognised: ${unpatched.join(', ')}`,
    );
  writeFileSync(
    path.join(workspace, 'scripts/utils/prune-dist-artifacts.mjs'),
    prunePatches.reduce(
      (source, [, anchor, replacement]) => source.replace(anchor, replacement),
      prune,
    ),
  );
  compatibilityFixes.push(
    'build: prune plugin database sources superseded by their compiled mirror',
  );
}
writeFileSync(
  path.join(workspace, 'package.json'),
  `${JSON.stringify(app, null, 2)}\n`,
);
writeFileSync(
  path.join(workspace, 'factory-template.json'),
  `${JSON.stringify(
    {
      template: '@nocobase/app-template-default',
      templateVersion: app.nocobase.defaultTemplateVersion,
      creator: '@nocobase/create-app@latest',
      controlSha,
      compatibilityFixes,
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
);
console.log(
  `Factory overlay applied to NocoBase template ${app.nocobase.defaultTemplateVersion}.`,
);
