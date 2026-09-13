import fs from 'node:fs';
import path from 'node:path';

import {
  defineSeed,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';

/**
 * Demo product gallery data.
 *
 * Every image listed here is a REAL file: the seed writes deterministic PNG
 * bytes into the `local` drive disk (`objects/<uuid>.png`) and inserts matching
 * rows in `product_image_files` / `product_images`, so the running application
 * shows the thumbnail, previews and downloads it exactly like an upload.
 *
 * The seed is idempotent: a second run skips products whose name already
 * exists and only re-writes the (unchanged) object bytes.
 */

export interface ProductSeedImage {
  readonly fileId: string;
  readonly filename: string;
  /** Base64-encoded PNG bytes. */
  readonly content: string;
}

export interface ProductSeedRow {
  readonly name: string;
  readonly description: string;
  readonly images: readonly ProductSeedImage[];
}

const RED_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAIAAABt+uBvAAAAjklEQVR42u3QMQ0AAAgDsAlDCe5xggNOriZV0EwXhygQJEiQIEGCBAlCkCBBggQJEiQIQYIECRIkSJAgBAkSJEiQIEGCBCFIkCBBggQJEoQgQYIECRIkSBCCBAkSJEiQIEGCECRIkCBBggQJQpAgQYIECRIkCEGCBAkSJEiQIEEIEiRIkCBBggQhSJCgPwtatr8Nu+HnaQAAAABJRU5ErkJggg==';
const BLUE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAIAAADajyQQAAAAWklEQVR42u3PAQ0AAAgDoMcxohGNZQ4dGwVI9bwUMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMbGrFmn3e6W8/hDXAAAAAElFTkSuQmCC';

const SEED_TIMESTAMP = '2026-09-13T00:00:00.000';

export function productSeedRows(): readonly ProductSeedRow[] {
  return [
    {
      name: '晨曦保温杯',
      description: '316 不锈钢内胆，24 小时长效保温，适合通勤与办公。',
      images: [
        {
          fileId: '20000000-0000-4000-8000-000000000001',
          filename: 'main.png',
          content: RED_PNG,
        },
        {
          fileId: '20000000-0000-4000-8000-000000000002',
          filename: 'detail.png',
          content: BLUE_PNG,
        },
      ],
    },
    {
      name: '云杉双肩包',
      description: '轻量防泼水面料，可容纳 16 英寸笔记本电脑。',
      images: [
        {
          fileId: '20000000-0000-4000-8000-000000000003',
          filename: 'front.png',
          content: BLUE_PNG,
        },
      ],
    },
  ];
}

/**
 * Where the `local` drive disk stores objects, derived from the SQLite
 * database file. The runtime config keeps them consistent in every flow:
 *
 * - Default (no config file): DB at `<root>/database.sqlite` and the `local`
 *   disk at `paths.storage()` = `<root>/storage`.
 * - Factory verification: DB at `<dir>/database.sqlite` and the `local` disk
 *   configured at `<dir>/storage/private`, so objects live one level deeper.
 */
export function resolveDriveLocalObjectsDir(databaseFile: string): string {
  const dbDir = path.dirname(databaseFile);
  return path.basename(dbDir) === 'storage'
    ? dbDir
    : path.join(dbDir, 'storage', 'private');
}

/** Parses the `local` disk root out of a runtime config's `drive:` section. */
export function readConfiguredObjectsDir(
  configFile: string,
): string | undefined {
  let text: string;
  try {
    text = fs.readFileSync(configFile, 'utf8');
  } catch {
    return undefined;
  }
  return extractDriveLocation(text);
}

/** Parses the `drive:` value from YAML text (inline JSON or block style). */
export function extractDriveLocation(yamlText: string): string | undefined {
  const inline = /(?:^|\n)[ \t]*drive:[ \t]*(\{)/.exec(yamlText);
  if (inline) {
    const open = yamlText.indexOf('{', inline.index);
    let depth = 0;
    for (let index = open; index < yamlText.length; index++) {
      const char = yamlText[index];
      if (char === '{') depth++;
      else if (char === '}' && --depth === 0) {
        return localDiskLocation(yamlText.slice(open, index + 1));
      }
    }
  }
  return blockDiskLocation(yamlText);
}

/** Reads `disks.local.location` from the inline JSON form of `drive:`. */
function localDiskLocation(json: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!isRecord(parsed) || !isRecord(parsed.disks)) return undefined;
    const disk = parsed.disks.local;
    return isRecord(disk) && typeof disk.location === 'string'
      ? disk.location
      : undefined;
  } catch {
    return undefined;
  }
}

/** Indentation-aware scan of the block form:
 *
 * ```yaml
 * drive:
 *   default: local
 *   disks:
 *     local:
 *       location: /data/objects
 * ```
 */
function blockDiskLocation(yamlText: string): string | undefined {
  const lines = yamlText.split(/\r?\n/);
  const driveIndex = lines.findIndex(
    (line) => !line.trimStart().startsWith('#') && /^\s*drive:/.test(line),
  );
  if (driveIndex < 0) return undefined;
  const driveIndent = indentOf(lines, driveIndex) ?? 0;
  let disksLine = -1;
  for (let index = driveIndex + 1; index < lines.length; index++) {
    const indent = indentOf(lines, index);
    if (indent === undefined || indent <= driveIndent) break;
    if (/^\s*disks:/.test(lines[index])) {
      disksLine = index;
      break;
    }
  }
  if (disksLine < 0) return undefined;
  const disksIndent = indentOf(lines, disksLine) ?? 0;
  let inLocal = false;
  for (let index = disksLine + 1; index < lines.length; index++) {
    const indent = indentOf(lines, index);
    if (indent === undefined || indent <= disksIndent) break;
    const trimmed = lines[index].trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (indent === disksIndent + 2) {
      inLocal = /^local:/.test(trimmed);
      continue;
    }
    if (inLocal && /^location:/.test(trimmed)) {
      const value = trimmed.slice('location:'.length).trim();
      return value ? unquote(value) : undefined;
    }
  }
  return undefined;
}

function indentOf(lines: readonly string[], index: number): number | undefined {
  const line = lines[index];
  return line === undefined
    ? undefined
    : (/^[ \t]*/.exec(line)?.[0].length ?? 0);
}

function unquote(value: string): string {
  const first = value[0];
  const last = value[value.length - 1];
  return (first === '"' && last === '"') || (first === "'" && last === "'")
    ? value.slice(1, -1)
    : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function objectKey(fileId: string): string {
  return `objects/${fileId}.png`;
}

interface SqliteClient {
  readonly client?: unknown;
}

const run = async ({ query, connection }: SeedContext): Promise<void> => {
  const rows = productSeedRows();

  const client = await connection.client<SqliteClient>();
  const databaseFile = sqliteDatabaseFile(client);
  if (!databaseFile) {
    throw new Error(
      'The product seed requires a SQLite database file to locate the drive storage.',
    );
  }
  const configFiles = process.env.APP_CONFIG_FILE
    ? [process.env.APP_CONFIG_FILE, 'config.yml']
    : ['config.yml'];
  const configured = configFiles
    .map((file) => readConfiguredObjectsDir(file))
    .find((location): location is string => Boolean(location));
  const objectsDir = configured ?? resolveDriveLocalObjectsDir(databaseFile);
  fs.mkdirSync(path.join(objectsDir, 'objects'), { recursive: true });

  const existing = new Set(
    await query
      .selectFrom('products')
      .select(['name'])
      .execute()
      .then((items) => items.map((item) => item.name as string)),
  );

  for (const row of rows) {
    // Keep every object present and current on each run, even when the product
    // row was already seeded.
    for (const image of row.images) {
      fs.writeFileSync(
        path.join(objectsDir, objectKey(image.fileId)),
        Buffer.from(image.content, 'base64'),
      );
    }
    if (existing.has(row.name)) continue;

    for (const image of row.images) {
      const bytes = Buffer.from(image.content, 'base64');
      await query
        .insertInto('productImageFiles')
        .values({
          id: image.fileId,
          disk: 'local',
          key: objectKey(image.fileId),
          filename: image.filename,
          ext: 'png',
          mimeType: 'image/png',
          size: bytes.byteLength,
          createdAt: SEED_TIMESTAMP,
          updatedAt: SEED_TIMESTAMP,
        })
        .execute();
    }

    const inserted = await query
      .insertInto('products')
      .values({
        name: row.name,
        description: row.description,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      })
      .execute();
    const productId = Number(inserted.insertId ?? inserted.rows?.[0]?.id);

    let sort = 0;
    for (const image of row.images) {
      await query
        .insertInto('productImages')
        .values({
          productId,
          fileId: image.fileId,
          sort,
          createdAt: SEED_TIMESTAMP,
        })
        .execute();
      sort += 1;
    }
  }
};

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
  name: '202609130004_seed_products',
  run,
});

export default seed;
