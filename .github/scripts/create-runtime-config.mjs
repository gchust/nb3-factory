import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = parseArgs(process.argv.slice(2));
const database = path.resolve(args.database);
const secret = randomBytes(32).toString('hex');
// Keep verification storage outside the generated application and its bundle.
const storage = path.join(path.dirname(database), 'storage');
const drive = {
  default: 'local',
  disks: {
    local: {
      driver: 'fs',
      location: path.join(storage, 'private'),
      visibility: 'private',
    },
    public: {
      driver: 'fs',
      location: path.join(storage, 'public'),
      visibility: 'public',
      url: '/storage',
    },
  },
  links: {
    [path.join(storage, 'links', 'public')]: path.join(storage, 'public'),
  },
};

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
    `drive: ${JSON.stringify(drive)}`,
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
