import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// beta.34 accidentally ships tests that assume the upstream monorepo. Keep the
// tests and their behavioral assertions, but resolve the installed application.
// Hashes pin this repair to the published inputs, not just their version label.
const hashes = {
  'account-permissions.test.tsx':
    '2af19d5f75f58adc58733d6475c5aebd540cbeffdfd626683ba9fbb33441e8d2',
  'dev-routes-production-build.test.ts':
    '5c9abf3e20ea01cc911683b17c5e33b2f3e8d1fb4bde5bd12ed47ae3ead6794d',
  'config.test.ts':
    'd3fa94f191b4c48b1041ac5a0a97a42e96c66f9ddc002a251d61af4e5319e2ba',
  'inspect-client.test.ts':
    '793d4c39e059f1c28fe0919e51fdeb01411feeaa2cf6faf040d6e84c5a6a9ad5',
  'inspect-server.test.ts':
    '54d1899bd18d03d2f90a6d148ef052518a761e4ce5cc294c88f87e2e3fb6f010',
  'tailwind-sources.test.ts':
    '40d19ac44e13ad779f7e309b27acee94d38acb258daaca2622279a240ff6c1d8',
  '../../vitest.config.ts':
    'df345f6744cac2150fa73e3d4100282c378051eb24f0506f670e4b2cd10eb067',
  'user-roles.test.ts':
    '6fd456c5ccaa8f2fe0e29ba0b7126f625c45b6c1de9027436f4449d9e179b048',
};

export function applyBeta34Compatibility(workspace, app) {
  if (
    app.nocobase?.templatePackage !== '@nocobase/app-template-default' ||
    app.nocobase?.defaultTemplateVersion !== '1.0.0-beta.34'
  )
    return [];

  const updates = [];
  for (const [file, hash] of Object.entries(hashes)) {
    const target = path.join(workspace, 'tests/logic', file);
    const source = readFileSync(target, 'utf8');
    if (createHash('sha256').update(source).digest('hex') !== hash) {
      throw new Error(
        `Cannot apply beta.34 compatibility: unexpected contents in ${file}.`,
      );
    }
    let result = source;
    switch (file) {
      case 'account-permissions.test.tsx':
        result = result.replace(
          "import { AuthorizationProvider } from '../../../../plugins/app-plugin-authorization/client/authorization-provider.js';",
          "import authorizationProviders from '@nocobase/app-plugin-authorization/client/react-providers';\nconst AuthorizationProvider = authorizationProviders.find(({ name }) => name === 'authorization')!.component;",
        );
        break;
      case 'dev-routes-production-build.test.ts':
        result = result.replace(
          "import { fileURLToPath } from 'node:url';",
          "import { fileURLToPath } from 'node:url';\nimport { execFileSync } from 'node:child_process';",
        );
        result = result.replace(
          /const repositoryRoot = [\s\S]*?(?=const DEV_PAGE_MARKER)/,
          "const appClientPlugins = fileURLToPath(execFileSync(process.execPath, ['--input-type=module', '-e', \"console.log(import.meta.resolve('@nocobase/app-client/plugins'))\"], { cwd: fileURLToPath(new URL('../..', import.meta.url)), encoding: 'utf8' }).trim());\n\n",
        );
        break;
      case 'config.test.ts':
        result = result.replace(
          /expect\.stringMatching\(\s*\/app-template-default[^\n]+\n\s*\)/,
          "path.join(templateRootDir, 'server/jobs/**/*.{ts,js}')",
        );
        break;
      case 'inspect-client.test.ts':
      case 'inspect-server.test.ts':
        result = result.replace(
          /'@nocobase\/app-template-default([^']*)'/g,
          (_, suffix) => JSON.stringify(app.name + suffix),
        );
        break;
      case 'tailwind-sources.test.ts':
        result = result
          .replace(
            "// Every path must be resolved, not merely reachable. A path still routed through `node_modules/@nocobase/<pkg>`\n    // is one Tailwind's scanner would refuse to expand a wildcard through, which is exactly how this broke before.",
            "// Compare the actual filesystem resolution: pnpm's real store paths also contain node_modules/@nocobase.",
          )
          .replace(
            'expect(file).not.toContain(`node_modules${path.sep}@nocobase${path.sep}`);',
            'expect(file).toBe(realpathSync(file));',
          );
        break;
      case '../../vitest.config.ts':
        // Native external dependencies bypass Vitest mocks; transform these two
        // published packages so the existing session mocks reach the provider.
        result = result.replace(
          '  resolve: {',
          "  resolve: {\n    dedupe: ['@nocobase/app-plugin-authentication', '@nocobase/app-client'],",
        );
        result = result.replace(
          '    root,',
          '    root,\n    server: { deps: { inline: [/@nocobase\\/app-plugin-(authorization|authentication)\\/dist\\/client\\//] } },',
        );
        break;
      case 'user-roles.test.ts':
        result = result.replace(
          "import { fileURLToPath } from 'node:url';",
          "import path from 'node:path';",
        );
        result = result.replace(
          / {6}'\.\.\/\.\.\/\.\.\/\.\.\/plugins\/app-plugin-(?:authentication|authorization)\/database\/migrations',\n/g,
          '',
        );
        result = result
          .replace(
            '  directory: string,\n) {\n  await createMigrator({',
            "  // Resolve the public plugin descriptor, which points at the published migrations.\n) {\n  const { default: plugin } = await import(packageName + '/server');\n  if (!plugin.baseDir || !plugin.database?.migrations) throw new Error('Missing plugin migrations: ' + packageName);\n  await createMigrator({",
          )
          .replace(
            'directory: fileURLToPath(new URL(directory, import.meta.url)),',
            'directory: path.resolve(plugin.baseDir, plugin.database.migrations),',
          );
        break;
    }
    if (result === source) throw new Error(`Unmatched beta.34 patch: ${file}`);
    updates.push([target, result]);
  }

  // npm does not include .npmignore in the published template tarball. Restore
  // the exclusion tested by plugin-commands; do not remove the publication check.
  const ignore = path.join(workspace, '.npmignore');
  if (existsSync(ignore)) {
    throw new Error(
      'Cannot apply beta.34 compatibility: unexpected .npmignore.',
    );
  }
  updates.push([ignore, '/.agents/\n']);
  // Validate all published sources before writing any patch.
  for (const [target, source] of updates) writeFileSync(target, source);
  return [
    'beta.34: resolve test components and migrations through published plugin exports',
    'beta.34: inspect generated application identity and paths',
    'beta.34: verify real pnpm paths and restore Agent publication exclusion',
  ];
}
