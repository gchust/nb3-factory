import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// AI Employee is the default-template prerequisite for the two Pro plugins.
// Keep this explicit: a refresh must not discover and install arbitrary packages.
export const templatePlugins = [
  '@nocobase/app-plugin-ai-employee',
  '@nocobase/app-plugin-ai-knowledge-base',
  '@nocobase/app-plugin-mail',
];

// Release channels a plugin may be installed from. NocoBase does not move
// `latest` with every prerelease: Mail and Knowledge Base kept `latest` on a
// 0.x line built for the previous core while their current releases went to
// `beta`, so `@latest` installed a plugin the template could not load.
export const pluginDistTags = ['latest', 'beta'];

// Core packages whose major line must match between the template and a plugin.
export const corePeerPackages = [
  '@nocobase/app-server',
  '@nocobase/app-client',
];

const versionPattern =
  /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u;

function parseVersion(version) {
  const match = versionPattern.exec(String(version));
  assert.ok(match, `Unusable version: ${JSON.stringify(version)}`);
  return {
    core: match.slice(1, 4).map(Number),
    pre: match[4] === undefined ? [] : match[4].split('.'),
  };
}

// Semver precedence (build metadata ignored).
export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] !== right.core[index])
      return left.core[index] < right.core[index] ? -1 : 1;
  }
  if (!left.pre.length || !right.pre.length)
    return Math.sign(right.pre.length - left.pre.length);
  for (let index = 0; ; index += 1) {
    if (index === left.pre.length || index === right.pre.length)
      return Math.sign(left.pre.length - right.pre.length);
    const [x, y] = [left.pre[index], right.pre[index]];
    if (x === y) continue;
    const [nx, ny] = [/^\d+$/u.test(x), /^\d+$/u.test(y)];
    if (nx && ny) return Number(x) < Number(y) ? -1 : 1;
    if (nx !== ny) return nx ? -1 : 1;
    return x < y ? -1 : 1;
  }
}

// The highest published release across the supported channels.
export function selectPluginVersion(distTags, packageName) {
  const candidates = pluginDistTags
    .filter((tag) => typeof distTags?.[tag] === 'string')
    .map((tag) => ({ tag, version: distTags[tag] }));
  assert.ok(
    candidates.length > 0,
    `${packageName}: none of the ${pluginDistTags.join('/')} dist-tags is published`,
  );
  return candidates.reduce((best, candidate) =>
    compareVersions(candidate.version, best.version) > 0 ? candidate : best,
  );
}

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
      `Check its ${pluginDistTags.join('/')} dist-tags; a compatible release must be published before the template can be refreshed.`,
  );
}

function commandResult(response, operation, statuses) {
  assert.ok(
    response?.schemaVersion === 1 &&
      response.ok === true &&
      response.command === operation &&
      response.operation === undefined &&
      statuses.includes(response.status),
    `${operation} did not complete successfully: ${JSON.stringify(response)}`,
  );
  return response.result;
}

export function validateInspection(response, packageName) {
  const result = commandResult(response, 'plugin inspect', ['success']);
  const check = (condition, message) =>
    assert.ok(condition, `${packageName}: ${message}`);
  check(result?.plugin?.packageName === packageName, 'unexpected package');
  check(result.plugin.installed === true, 'package is not installed');
  check(
    result.dependency?.field === 'dependencies' &&
      typeof result.dependency.range === 'string' &&
      result.dependency.range.length > 0,
    'production dependency is missing',
  );
  check(result.registration?.enabled === true, 'plugin is disabled');
  // inspect can report consistent=true for an installed but unregistered plugin.
  for (const [kind, exportKey] of [
    ['client', 'client'],
    ['server', 'serverPlugin'],
  ]) {
    check(
      result.plugin.exports?.[exportKey] === true,
      `${kind} export is missing`,
    );
    check(
      result.composition?.[kind]?.registered === true,
      `${kind} is not registered`,
    );
  }
  check(
    typeof result.plugin.exports.cli === 'boolean',
    'CLI export state is missing',
  );
  if (result.plugin.exports.cli) {
    check(
      result.composition?.cli?.registered === true,
      'CLI is not registered',
    );
  }
  check(
    result.consistent === true &&
      Array.isArray(result.issues) &&
      result.issues.length === 0,
    `inconsistent inspection: ${JSON.stringify(result.issues)}`,
  );
  const skill = packageName.replace('@nocobase/', 'nocobase-');
  check(
    result.skills?.checked === true &&
      result.skills.contentMatches === true &&
      Array.isArray(result.skills.source) &&
      result.skills.source.includes(skill) &&
      Array.isArray(result.skills.synchronized) &&
      result.skills.synchronized.includes(skill) &&
      Array.isArray(result.skills.missing) &&
      result.skills.missing.length === 0 &&
      Array.isArray(result.skills.stale) &&
      result.skills.stale.length === 0,
    'package-owned Skills are missing or out of date',
  );
}

function runTemplatePlugins(mode, appDirectory, diagnosticsDirectory) {
  assert.ok(
    ['install', 'inspect'].includes(mode),
    'Expected install or inspect',
  );
  const appRoot = path.resolve(appDirectory);
  const diagnostics = path.resolve(diagnosticsDirectory, 'template-plugins');
  const metadataFile = path.join(appRoot, 'factory-template.json');
  const metadata = JSON.parse(readFileSync(metadataFile, 'utf8'));
  assert.equal(metadata.template, '@nocobase/app-template-default');
  mkdirSync(diagnostics, { recursive: true });

  const run = (args, reportName) => {
    const result = spawnSync('pnpm', args, {
      cwd: appRoot,
      encoding: 'utf8',
      stdio: ['ignore', reportName ? 'pipe' : 'inherit', 'inherit'],
      maxBuffer: 8 * 1024 * 1024,
      timeout: 20 * 60 * 1000,
    });
    // Save the actual CLI response even when it reports failure or malformed JSON.
    if (reportName)
      writeFileSync(path.join(diagnostics, reportName), result.stdout ?? '');
    if (result.error) throw result.error;
    assert.equal(
      result.status,
      0,
      `pnpm ${args.join(' ')} failed (${result.signal ?? result.status})`,
    );
    return reportName ? JSON.parse(result.stdout) : undefined;
  };

  if (mode === 'install') {
    const selected = templatePlugins.map((packageName) => ({
      packageName,
      ...selectPluginVersion(
        run(
          ['--silent', 'view', packageName, 'dist-tags', '--json'],
          `${packageName.split('/')[1]}.dist-tags.json`,
        ),
        packageName,
      ),
    }));
    writeFileSync(
      path.join(diagnostics, 'selected-versions.json'),
      `${JSON.stringify(selected, null, 2)}\n`,
    );
    // One dependency resolution instead of an install for every registration.
    // --no-install below still performs the official Client/Server/CLI wiring.
    run([
      'add',
      ...selected.map(
        ({ packageName, version }) => `${packageName}@${version}`,
      ),
    ]);
    // Fail on a core mismatch here rather than as an import error at build time.
    const appManifest = JSON.parse(
      readFileSync(path.join(appRoot, 'package.json'), 'utf8'),
    );
    for (const { packageName } of selected) {
      checkCorePeers(
        appManifest,
        JSON.parse(
          readFileSync(
            path.join(appRoot, 'node_modules', packageName, 'package.json'),
            'utf8',
          ),
        ),
      );
    }
    for (const packageName of templatePlugins) {
      const response = run(
        [
          '--silent',
          'exec',
          'nocobase',
          'plugin',
          'register',
          packageName,
          '--no-install',
          '--no-skills',
          '--json',
        ],
        `${packageName.split('/')[1]}.register.json`,
      );
      const result = commandResult(response, 'plugin register', [
        'success',
        'success-noop',
      ]);
      assert.equal(
        result?.packageName,
        packageName,
        'Registration returned an unexpected package',
      );
    }
    return;
  }

  const plugins = [];
  for (const packageName of templatePlugins) {
    const response = run(
      [
        '--silent',
        'exec',
        'nocobase',
        'plugin',
        'inspect',
        packageName,
        '--json',
      ],
      `${packageName.split('/')[1]}.inspect.json`,
    );
    validateInspection(response, packageName);
    const installed = JSON.parse(
      readFileSync(
        path.join(appRoot, 'node_modules', packageName, 'package.json'),
        'utf8',
      ),
    );
    assert.equal(installed.name, packageName);
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
      registered: true,
      skillsSynchronized: true,
    });
  }
  // Do not stamp a successful inventory until every required plugin passes.
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
          ({ packageName, version }) =>
            `- ${packageName}@${version}: registered; Skills synchronized`,
        ),
        '',
        'Static plugin checks passed. Application build, database and browser verification still run before publication.',
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
    appRoot && diagnosticsRoot && extra.length === 0,
    'Usage: template-plugins.mjs install|inspect APP_ROOT DIAGNOSTICS_ROOT',
  );
  runTemplatePlugins(mode, appRoot, diagnosticsRoot);
}
