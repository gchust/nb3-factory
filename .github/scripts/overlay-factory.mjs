import {
  cpSync,
  existsSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { assertCurrentTemplate } from './assert-current-template.mjs';

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

// Reject old templates before copying any factory controls.
assertCurrentTemplate(app);

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
writeFileSync(path.join(workspace, 'eslint.config.js'), factoryEslint);
// Keep the generated AGENTS.md and .agents tree untouched. Factory task rules
// live in .github/prompts; skills sync uses only the newly installed packages.
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
      tooling: '@nocobase/app-cli',
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
);
console.log(
  `Factory overlay applied to NocoBase template ${app.nocobase.defaultTemplateVersion}.`,
);
