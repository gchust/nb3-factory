import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// plugin:register owns plugin entries, not the application's config composition.
// Use the package's public factory, including on published Mail versions that
// read config.get('mail') without supplying defaults themselves.
export function configureTemplateMail(appRoot) {
  const indexFile = path.join(appRoot, 'server/config/index.ts');
  const mailFile = path.join(appRoot, 'server/config/mail.ts');
  const source = readFileSync(indexFile, 'utf8');
  const declaration = 'const defaultConfigs: AppConfigFactory<{\n';
  const composition = '}> = defaultAppConfigs({\n';
  for (const anchor of [declaration, composition]) {
    assert.equal(
      source.split(anchor).length - 1,
      1,
      'Unsupported template config composition; update the Mail integration before refreshing.',
    );
  }
  const typeBody = source.split(declaration)[1].split(composition)[0];
  const valueBody = source.split(composition)[1];
  const wired = [
    /^import mail from ['"]\.\/mail\.js['"];$/m.test(source),
    /^  mail: ReturnType<typeof mail>;$/m.test(typeBody),
    /^  mail,$/m.test(valueBody),
  ];
  if (wired.every(Boolean)) {
    assert.ok(existsSync(mailFile), 'Mail config is registered but server/config/mail.ts is missing.');
    return false;
  }
  // This edits a newly generated template, not arbitrary application code. Fail
  // before writing either file if upstream changed or already owns this binding.
  assert.ok(
    !/\bmail\b/.test(source) && !existsSync(mailFile),
    'Conflicting or partial Mail config composition; refusing to overwrite it.',
  );
  const updated = source
    .replace(
      declaration,
      `import mail from './mail.js';\n\n${declaration}  mail: ReturnType<typeof mail>;\n`,
    )
    .replace(composition, `${composition}  mail,\n`);
  writeFileSync(
    mailFile,
    "import { mailConfig } from '@nocobase/app-plugin-mail/server';\n\nexport default mailConfig;\n",
  );
  writeFileSync(indexFile, updated);
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [appRoot, ...extra] = process.argv.slice(2);
  assert.ok(appRoot && extra.length === 0, 'Usage: template-mail-config.mjs APP_ROOT');
  configureTemplateMail(path.resolve(appRoot));
  console.log('Mail application config factory is registered in server/config/index.ts.');
}
