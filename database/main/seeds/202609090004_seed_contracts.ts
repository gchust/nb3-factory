import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import {
  defineSeed,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';

/**
 * Demo contract archive data.
 *
 * Every attachment listed here is a REAL file: the seed writes deterministic
 * bytes into the drive's `local` disk location (`objects/<uuid>.txt`) and
 * inserts matching rows in `contract_files` / `contract_attachments`, so the
 * running application can preview and download them exactly like uploaded
 * files. Body files stay empty, which the feature permits.
 *
 * The seed is idempotent: a second run skips rows whose contract number
 * already exists and only re-writes the (unchanged) object bytes.
 */

export interface ContractSeedAttachment {
  readonly fileId: string;
  readonly filename: string;
}

export interface ContractSeedRow {
  readonly contractNo: string;
  readonly name: string;
  readonly party: string;
  readonly signedAt: string | null;
  readonly amount: string | null;
  readonly status: 'draft' | 'active' | 'expired' | 'terminated';
  readonly remark: string | null;
  readonly attachments: readonly ContractSeedAttachment[];
}

const FILE_IDS = [
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000006',
] as const;

const SEED_TIMESTAMP = '2026-09-09T00:00:00.000';

export function contractSeedRows(): readonly ContractSeedRow[] {
  return [
    {
      contractNo: 'HT-2026-001',
      name: '杭州云栖办公场地租赁合同',
      party: '杭州云栖置业有限公司',
      signedAt: '2026-03-01',
      amount: '360000.00',
      status: 'active',
      remark: '租赁期限三年，按季度支付。',
      attachments: [
        { fileId: FILE_IDS[0], filename: '租赁合同补充协议.txt' },
        { fileId: FILE_IDS[1], filename: '办公场地交付说明.txt' },
      ],
    },
    {
      contractNo: 'HT-2026-002',
      name: '西湖区门店装修工程合同',
      party: '杭州启明装饰工程有限公司',
      signedAt: '2026-05-20',
      amount: '128000.00',
      status: 'draft',
      remark: '待法务复核后生效。',
      attachments: [{ fileId: FILE_IDS[2], filename: '装修图纸清单.txt' }],
    },
    {
      contractNo: 'HT-2025-103',
      name: '年度办公设备采购框架合同',
      party: '杭州智汇办公设备有限公司',
      signedAt: '2025-11-08',
      amount: '980000.00',
      status: 'expired',
      remark: '采购框架已于 2026 年 11 月到期，未续签。',
      attachments: [
        { fileId: FILE_IDS[3], filename: '设备价格明细表.txt' },
        { fileId: FILE_IDS[4], filename: '服务等级说明.txt' },
      ],
    },
    {
      contractNo: 'HT-2024-077',
      name: '数据中心运维服务合同',
      party: '杭州恒信信息技术服务有限公司',
      signedAt: '2024-06-15',
      amount: '560000.00',
      status: 'terminated',
      remark: '因服务商违约提前终止。',
      attachments: [{ fileId: FILE_IDS[5], filename: '终止协议备忘.txt' }],
    },
  ];
}

/**
 * Where the `local` drive disk stores objects, derived from the SQLite
 * database file. The runtime config keeps them consistent in every flow:
 *
 * - Default (no config file): DB at `<root>/storage/database.sqlite` and the
 *   `local` disk at `paths.storage()` = `<root>/storage`, so objects live next
 *   to the database file.
 * - Factory verification: DB at `<dir>/database.sqlite` and the `local` disk
 *   configured at `<dir>/storage/private`, so objects live one level deeper.
 */
export function resolveDriveLocalObjectsDir(databaseFile: string): string {
  const dbDir = path.dirname(databaseFile);
  // Default flow: DB and disk both live at `<root>/storage`, so the disk root
  // is the DB's directory. Factory flow: DB at `<dir>/database.sqlite`, disk
  // root configured at `<dir>/storage/private`.
  return path.basename(dbDir) === 'storage'
    ? dbDir
    : path.join(dbDir, 'storage', 'private');
}

/**
 * Best-effort reader for the `drive` section of a runtime config YAML, for
 * hand-written configs whose `local` disk lives somewhere custom. Returns the
 * disk root, or undefined when the config is not readable.
 */
export function readConfiguredObjectsDir(
  configFile: string,
): string | undefined {
  let text: string;
  try {
    text = fs.readFileSync(configFile, 'utf8');
  } catch {
    return undefined;
  }
  const location = extractDriveLocation(text);
  return location ?? undefined;
}

/** Parses the `drive:` value from YAML text (inline JSON or block style). */
export function extractDriveLocation(yamlText: string): string | undefined {
  const location = findDriveLocationFromBlock(yamlText);
  if (location) return location;
  const inline = /(?:^|\n)\s*drive:\s*(\{)/.exec(yamlText);
  if (inline) {
    const open = yamlText.indexOf('{', inline.index + inline[0].indexOf('{'));
    let depth = 0;
    let end = -1;
    for (let i = open; i < yamlText.length; i++) {
      const char = yamlText[i];
      if (char === '{') depth++;
      else if (char === '}') {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end > open) {
      const parsed = parseDriveJson(yamlText.slice(open, end));
      if (parsed) return parsed;
    }
  }
  return undefined;
}

/**
 * Indentation-aware block scan for the standard YAML shape:
 *
 * ```yaml
 * drive:
 *   default: local
 *   disks:
 *     local:
 *       location: /data/objects
 * ```
 */
function findDriveLocationFromBlock(yamlText: string): string | undefined {
  const lines = yamlText.split(/\r?\n/);
  const driveIndex = lines.findIndex((line) => {
    const trimmed = line.trim();
    return !trimmed.startsWith('#') && trimmed.startsWith('drive:');
  });
  if (driveIndex < 0) return undefined;
  const driveIndent = indentOf(lines, driveIndex) ?? 0;
  let defaultDisk = 'local';
  let disksLine = -1;
  for (let i = driveIndex + 1; i < lines.length; i++) {
    const indent = indentOf(lines, i);
    if (indent === undefined || indent <= driveIndent) break;
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('default:')) {
      const value = readYamlValue(trimmed, /^default:/);
      if (value) defaultDisk = value;
    } else if (trimmed.startsWith('disks:')) {
      disksLine = i;
      break;
    }
  }
  if (disksLine < 0) return undefined;
  const disksIndent = indentOf(lines, disksLine) ?? 0;
  let inDisk = false;
  for (let i = disksLine + 1; i < lines.length; i++) {
    const indent = indentOf(lines, i);
    if (indent === undefined || indent <= disksIndent) break;
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (indent === disksIndent + 2) {
      inDisk = trimmed.startsWith(`${defaultDisk}:`);
      continue;
    }
    if (inDisk && trimmed.startsWith('location:')) {
      const value = readYamlValue(trimmed, /^location:/);
      if (value) return value;
    }
  }
  return undefined;
}

function parseDriveJson(value: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed)) return undefined;
    const disks = parsed.disks;
    if (!isRecord(disks)) return undefined;
    const diskName =
      typeof parsed.default === 'string' ? parsed.default : 'local';
    const disk = disks[diskName];
    if (!isRecord(disk)) return undefined;
    return typeof disk.location === 'string' ? disk.location : undefined;
  } catch {
    return undefined;
  }
}

function readYamlValue(text: string, pattern: RegExp): string | undefined {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const match = pattern.exec(line);
    if (!match) continue;
    const value = line.slice(match[0].length).trim();
    if (!value || value.startsWith('#')) return undefined;
    return unquote(value);
  }
  return undefined;
}

function indentOf(lines: readonly string[], index: number): number | undefined {
  const line = lines[index];
  if (line === undefined) return undefined;
  const match = /^[ \t]*/.exec(line);
  return match ? match[0].length : 0;
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function attachmentContent(
  contract: ContractSeedRow,
  attachment: ContractSeedAttachment,
): string {
  return [
    `合同附件：${attachment.filename}`,
    `合同编号：${contract.contractNo}`,
    `合同名称：${contract.name}`,
    `签约对方：${contract.party}`,
    '',
    '附件说明：本附件由演示数据自动生成，用于验证附件的预览与下载功能。',
  ].join('\n');
}

function attachmentObjectKey(fileId: string): string {
  return `objects/${fileId}.txt`;
}

interface SqliteClient {
  readonly client?: unknown;
}

const run = async ({ query, connection }: SeedContext): Promise<void> => {
  const rows = contractSeedRows();

  const client = await connection.client<SqliteClient>();
  const databaseFile = sqliteDatabaseFile(client);
  if (!databaseFile) {
    throw new Error(
      'The contract seed requires a SQLite database file to locate the drive storage.',
    );
  }
  const configured =
    readConfiguredObjectsDir(configFileCandidates()[0] ?? '') ??
    readConfiguredObjectsDir(configFileCandidates()[1] ?? '');
  const objectsDir = configured ?? resolveDriveLocalObjectsDir(databaseFile);
  fs.mkdirSync(objectsDir, { recursive: true });
  // Keys point into `objects/`; make sure that nested directory exists too on
  // a fresh install that has never uploaded a file.
  fs.mkdirSync(path.join(objectsDir, 'objects'), { recursive: true });

  const existing = new Set(
    await query
      .selectFrom('contracts')
      .select(['contractNo'])
      .execute()
      .then((items) => items.map((item) => item.contractNo as string)),
  );

  for (const row of rows) {
    // Keep the object bytes present and current on every run, even when the
    // contract row was already seeded.
    for (const attachment of row.attachments) {
      const content = attachmentContent(row, attachment);
      fs.writeFileSync(
        path.join(objectsDir, attachmentObjectKey(attachment.fileId)),
        Buffer.from(content, 'utf8'),
      );
    }
    if (existing.has(row.contractNo)) continue;

    for (const attachment of row.attachments) {
      const content = attachmentContent(row, attachment);
      await query
        .insertInto('contractFiles')
        .values({
          id: attachment.fileId,
          disk: 'local',
          key: attachmentObjectKey(attachment.fileId),
          filename: attachment.filename,
          ext: 'txt',
          mimeType: 'text/plain',
          size: Buffer.byteLength(content, 'utf8'),
          createdAt: SEED_TIMESTAMP,
          updatedAt: SEED_TIMESTAMP,
        })
        .execute();
    }

    const inserted = await query
      .insertInto('contracts')
      .values({
        contractNo: row.contractNo,
        name: row.name,
        party: row.party,
        signedAt: row.signedAt,
        amount: row.amount,
        status: row.status,
        remark: row.remark,
        bodyFileId: null,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      })
      .execute();
    const contractId = Number(inserted.insertId ?? inserted.rows?.[0]?.id);

    for (const attachment of row.attachments) {
      await query
        .insertInto('contractAttachments')
        .values({
          contractId,
          fileId: attachment.fileId,
          createdAt: SEED_TIMESTAMP,
        })
        .execute();
    }
  }
};

function configFileCandidates(): readonly string[] {
  const fromEnv = process.env.APP_CONFIG_FILE;
  return fromEnv ? [fromEnv, 'config.yml'] : ['config.yml'];
}

function sqliteDatabaseFile(client: unknown): string | undefined {
  // The knex instance keeps its effective connection options on the Client
  // object (`connectionSettings`), not on the knex proxy itself.
  const inner = (client as { client?: unknown })?.client as
    { connectionSettings?: unknown } | undefined;
  const settings = inner?.connectionSettings;
  if (typeof settings === 'string') return settings;
  if (settings && typeof settings === 'object') {
    const filename = (settings as { filename?: unknown }).filename;
    if (typeof filename === 'string') return filename;
  }
  return undefined;
}

const seed: SeedDefinition = defineSeed({
  name: '202609090004_seed_contracts',
  run,
});

export default seed;
