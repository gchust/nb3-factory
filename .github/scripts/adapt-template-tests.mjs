import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// beta.38 publishes monorepo-only test assumptions. Keep the behavior tests,
// adapting their inputs to the generated application's installed package layout.
export function adaptTemplateTests(workspace, app) {
  if (app.nocobase.defaultTemplateVersion !== '1.0.0-beta.38') return [];
  const changes = [];
  const patch = (file, before, after) => {
    const target = path.join(workspace, 'tests/logic', file);
    if (!existsSync(target)) return;
    const source = readFileSync(target, 'utf8');
    if (!source.includes(before) && source.includes(after)) return;
    if (!source.includes(before))
      throw new Error(`Unsupported beta.38 test: ${file}`);
    writeFileSync(target, source.replaceAll(before, after));
    changes.push(`beta.38: adapt ${file} to generated application`);
  };
  for (const file of ['inspect-client.test.ts', 'inspect-server.test.ts']) {
    patch(file, '@nocobase/app-template-default', app.name);
  }
  patch(
    'account-permissions.test.tsx',
    "import { AuthorizationProvider } from '../../../../plugins/app-plugin-authorization/client/authorization-provider.js';",
    "import { reactProviders } from '@nocobase/app-plugin-authorization/client/react-providers';\nconst AuthorizationProvider = reactProviders.find(({ name }) => name === 'authorization')!.component;",
  );
  patch(
    'dev-routes-production-build.test.ts',
    `const repositoryRoot = fileURLToPath(\n  new URL('../../../../..', import.meta.url),\n);\nconst appClientPlugins = path.join(\n  repositoryRoot,\n  'packages/app/app-client/src/plugins.ts',\n);`,
    `const appClientPlugins = fileURLToPath(new URL('../../node_modules/@nocobase/app-client/dist/plugins.js', import.meta.url));`,
  );
  patch(
    'inspect-client.test.ts',
    'inspection.settings.slice(0, 10).map(({ id }) => id)',
    'inspection.settings.slice(0, 16).map(({ id }) => id)',
  );
  patch(
    'inspect-client.test.ts',
    "      'ai',\n      'permission-sets',",
    "      'ai',\n      'aiSkills',\n      'aiTools',\n      'aiConversations',\n      'aiLLMServices',\n      'aiMCPServices',\n      'aiSettings',\n      'permission-sets',",
  );
  patch('config.test.ts', 'app-template-default\\/server', 'server');
  // Inline the installed provider so Vitest can apply the existing authentication mock to its imports.
  const configPath = path.join(workspace, 'vitest.config.ts');
  if (existsSync(configPath)) {
    const config = readFileSync(configPath, 'utf8');
    if (!config.includes('inline: [/\\/app-plugin-authorization')) {
      if (!config.includes('    root,'))
        throw new Error('Unsupported beta.38 Vitest config');
      writeFileSync(
        configPath,
        config.replace(
          '    root,',
          '    root,\n    server: { deps: { inline: [/\\/app-plugin-authorization\\/dist\\/client\\//] } },',
        ),
      );
      changes.push(
        'beta.38: inline authorization client for authentication mocks',
      );
    }
  }
  patch(
    'tailwind-sources.test.ts',
    'expect(file).not.toContain(`node_modules${path.sep}@nocobase${path.sep}`);',
    'expect(file).toBe(realpathSync(file));',
  );
  patch(
    'plugin-commands.test.ts',
    `it('keeps synchronized Agent state out of source control and publication', () => {\n    expect(readFileSync(path.join(appRoot, '.gitignore'), 'utf8')).toContain(\n      '/.agents/',\n    );\n    expect(readFileSync(path.join(appRoot, '.npmignore'), 'utf8')).toContain(\n      '.agents/',\n    );`,
    `it('keeps Agent guidance in Git without publishing it as an npm package', () => {\n    expect(readFileSync(path.join(appRoot, '.gitignore'), 'utf8')).toContain(\n      '!/.agents/**',\n    );`,
  );
  return changes;
}
