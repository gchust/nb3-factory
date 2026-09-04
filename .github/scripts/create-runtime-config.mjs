import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = parseArgs(process.argv.slice(2));
const database = path.resolve(args.database);
const secret = randomBytes(32).toString('hex');

mkdirSync(path.dirname(args.output), { recursive: true });
mkdirSync(path.dirname(database), { recursive: true });

writeFileSync(
  args.output,
  [
    'auth:',
    `  secret: ${JSON.stringify(secret)}`,
    '  emailAndPassword:',
    '    enabled: true',
    '    autoSignIn: false',
    '  session:',
    '    storeSessionInDatabase: true',
    'session:',
    `  secret: ${JSON.stringify(secret)}`,
    'database:',
    '  default: main',
    '  connections:',
    '    main:',
    '      dialect: sqlite',
    `      database: ${JSON.stringify(database)}`,
    '  migrations:',
    '    autoRun: false',
    '  seeds:',
    '    autoRun: false',
    'snowflake:',
    '  workerId: 0',
    '  epoch: 1605024000',
    '',
  ].join('\n'),
);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    parsed[argv[index]?.replace(/^--/, '')] = argv[index + 1];
  }
  if (!parsed.output || !parsed.database) {
    throw new Error(
      'Usage: create-runtime-config.mjs --output <path> --database <path>',
    );
  }
  return parsed;
}
