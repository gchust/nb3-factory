import {
  cpSync,
  existsSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

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
writeFileSync(
  path.join(workspace, '.gitignore'),
  `${read(workspace, '.gitignore').trimEnd()}\n\n# Factory runtime files must never enter the refreshed baseline.\n/config.yml\n/.env\n/.env.*\n/node_modules/\n/dist/\n/storage/\n/.agents/\n/.nocobase/\n/.nb3/\n*.log\n`,
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
const compatibilityFixes = [];
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
  const build = read(workspace, 'scripts/build.mjs');
  if (!build.includes("path.join(rootDir, '.npmrc')")) {
    const install = "run(\n  'Install server production dependencies',";
    if (!build.includes(install))
      throw new Error('Cannot apply beta.15 production registry fix.');
    writeFileSync(
      path.join(workspace, 'scripts/build.mjs'),
      build.replace(
        install,
        `fs.copyFileSync(path.join(rootDir, '.npmrc'), path.join(distDir, '.npmrc'));\n${install}`,
      ),
    );
    compatibilityFixes.push('beta.15 build: copy scoped registry into dist');
  }
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
