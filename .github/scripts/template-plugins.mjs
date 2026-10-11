import assert from 'node:assert/strict';
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The published template owns its plugin set and dependency ranges. Inspect
// its production dependencies without installing or re-registering older extras.
export function templatePlugins(manifest) {
  return Object.keys(manifest.dependencies ?? {})
    .filter((name) => name.startsWith('@nocobase/app-plugin-'))
    .sort();
}

export const corePeerPackages = [
  '@nocobase/app-server',
  '@nocobase/app-client',
];

// The release line a range admits, the way a caret range reads it: the major
// version, or the minor version within 0.x.
function releaseLine(range) {
  const match = /(\d+)\.(\d+)/u.exec(String(range));
  if (!match) return undefined;
  return match[1] === '0' ? `0.${match[2]}` : match[1];
}

export function checkCorePeers(appManifest, pluginManifest) {
  const declared = {
    ...appManifest.devDependencies,
    ...appManifest.dependencies,
  };
  const problems = [];
  for (const core of corePeerPackages) {
    const peer = pluginManifest.peerDependencies?.[core];
    if (peer === undefined) continue;
    const own = declared[core];
    if (own === undefined) {
      problems.push(
        `requires ${core} ${peer}, which the template does not declare`,
      );
      continue;
    }
    const [pluginLine, templateLine] = [releaseLine(peer), releaseLine(own)];
    if (!pluginLine || pluginLine !== templateLine)
      problems.push(
        `requires ${core} ${peer}, but the template declares ${own}`,
      );
  }
  assert.ok(
    problems.length === 0,
    `${pluginManifest.name}@${pluginManifest.version} is built for a different NocoBase core: ${problems.join('; ')}. ` +
      'The published beta template must declare compatible plugin and core versions.',
  );
}

export function recordTemplatePlugins(appDirectory, diagnosticsDirectory) {
  const appRoot = path.resolve(appDirectory);
  const diagnostics = path.resolve(diagnosticsDirectory, 'template-plugins');
  const metadataFile = path.join(appRoot, 'factory-template.json');
  const metadata = JSON.parse(readFileSync(metadataFile, 'utf8'));
  assert.equal(metadata.template, '@nocobase/app-template-default');
  mkdirSync(diagnostics, { recursive: true });

  const appManifest = JSON.parse(
    readFileSync(path.join(appRoot, 'package.json'), 'utf8'),
  );
  const plugins = [];
  for (const packageName of templatePlugins(appManifest)) {
    const installed = JSON.parse(
      readFileSync(
        path.join(appRoot, 'node_modules', packageName, 'package.json'),
        'utf8',
      ),
    );
    assert.equal(installed.name, packageName);
    checkCorePeers(appManifest, installed);
    assert.ok(
      typeof installed.version === 'string' &&
        /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(
          installed.version,
        ),
      `Missing installed version for ${packageName}`,
    );
    plugins.push({
      packageName,
      version: installed.version,
    });
  }
  // Do not stamp a successful inventory until every template plugin passes.
  metadata.plugins = plugins;
  writeFileSync(metadataFile, `${JSON.stringify(metadata, null, 2)}\n`);
  writeFileSync(
    path.join(diagnostics, 'inventory.json'),
    `${JSON.stringify(plugins, null, 2)}\n`,
  );
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [
        '### Template plugin baseline',
        '',
        ...plugins.map(
          ({ packageName, version }) => `- ${packageName}@${version}`,
        ),
        '',
        'Template dependency checks passed. Application build, database and browser verification still run before publication.',
        '',
      ].join('\n'),
    );
  }
  return plugins;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [mode, appRoot, diagnosticsRoot, ...extra] = process.argv.slice(2);
  assert.ok(
    mode === 'record' && appRoot && diagnosticsRoot && extra.length === 0,
    'Usage: template-plugins.mjs record APP_ROOT DIAGNOSTICS_ROOT',
  );
  recordTemplatePlugins(appRoot, diagnosticsRoot);
}
