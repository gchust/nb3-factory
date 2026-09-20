import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

import {
  defineSeed,
  type SeedContext,
  type SeedDefinition,
} from '@nocobase/db';

/**
 * Sample bytes and their file records.
 *
 * The generators live in this file: the seed loader imports a seed module
 * directly, so a seed that reached into a shared helper module would only work
 * in one of the two ways this application runs (source with a TypeScript
 * loader, compiled). Everything here is deterministic, so a clean installation
 * rebuilds byte-identical samples from the seeds alone.
 *
 * The bytes are written into the local disk the application is configured with
 * (`paths.storage()`, which resolves to `<app>/storage` for both `pnpm seed`
 * and the standalone server) and the matching metadata rows are inserted
 * through the ordinary file Collections.
 */
/**
 * Deterministic sample file bytes for the seeded demonstration records.
 *
 * Everything here is generated from fixed inputs so a clean installation that
 * runs the seeds twice produces byte-identical files. No network access and no
 * checked-in binaries are involved.
 */
export interface SampleFile {
  readonly filename: string;
  readonly mimeType: string;
  readonly ext: string;
  readonly bytes: Buffer;
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(input: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBytes = Buffer.from(type, 'ascii');
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, checksum]);
}

type Pixel = readonly [number, number, number];

/** Encode a truecolour 8-bit PNG. */
export function createPng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => Pixel,
): Buffer {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // No filter.
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue] = pixel(x, y);
      const offset = rowStart + 1 + x * 3;
      raw[offset] = red;
      raw[offset + 1] = green;
      raw[offset + 2] = blue;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // Bit depth.
  header[9] = 2; // Colour type: truecolour.
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function escapePdfText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Build a small multipage PDF using the built-in Helvetica font, which needs no
 * embedded font file and renders identically in every viewer.
 */
export function createPdf(pageLines: readonly (readonly string[])[]): Buffer {
  const objects: string[] = [];
  const pageCount = pageLines.length;
  const firstPageObject = 3;
  const kids = pageLines
    .map((_, index) => `${firstPageObject + index * 2} 0 R`)
    .join(' ');

  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>\nendobj\n`,
  );

  pageLines.forEach((lines, index) => {
    const pageObject = firstPageObject + index * 2;
    const contentObject = pageObject + 1;
    const commands = ['BT /F1 22 Tf 64 780 Td 26 TL'];
    lines.forEach((line, lineIndex) => {
      if (lineIndex === 0) {
        commands.push(`(${escapePdfText(line)}) Tj`);
      } else {
        commands.push(`T* (${escapePdfText(line)}) Tj`);
      }
    });
    commands.push('ET');
    const content = `${commands.join('\n')}\n`;
    objects.push(
      `${pageObject} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
        `/Resources << /Font << /F1 ${firstPageObject + pageCount * 2} 0 R >> >> ` +
        `/Contents ${contentObject} 0 R >>\nendobj\n`,
    );
    objects.push(
      `${contentObject} 0 obj\n<< /Length ${Buffer.byteLength(content, 'latin1')} >>\n` +
        `stream\n${content}endstream\nendobj\n`,
    );
  });

  const fontObject = firstPageObject + pageCount * 2;
  objects.push(
    `${fontObject} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica ` +
      `/Encoding /WinAnsiEncoding >>\nendobj\n`,
  );

  const header = '%PDF-1.4\n';
  let body = '';
  const offsets: number[] = [];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(header + body, 'latin1'));
    body += object;
  }
  const totalObjects = objects.length + 1;
  const xrefOffset = Buffer.byteLength(header + body, 'latin1');
  const xrefLines = [`xref\n0 ${totalObjects}\n`, '0000000000 65535 f \n'];
  for (const offset of offsets) {
    xrefLines.push(`${offset.toString().padStart(10, '0')} 00000 n \n`);
  }
  const trailer =
    `trailer\n<< /Size ${totalObjects} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(header + body + xrefLines.join('') + trailer, 'latin1');
}

/** A valid empty ZIP archive: the format used for "no online preview" samples. */
function createZip(): Buffer {
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 8);
  endOfCentralDirectory.writeUInt16LE(0, 10);
  return endOfCentralDirectory;
}

export const SAMPLE_IMAGES: readonly SampleFile[] = [
  {
    filename: 'site-survey-photo.png',
    mimeType: 'image/png',
    ext: 'png',
    bytes: createPng(640, 360, (x, y) => [
      30 + Math.round((x / 640) * 120),
      90 + Math.round((y / 360) * 90),
      180,
    ]),
  },
  {
    filename: 'acceptance-signature-board.png',
    mimeType: 'image/png',
    ext: 'png',
    bytes: createPng(640, 360, (x, y) => {
      const inBoard = x > 80 && x < 560 && y > 70 && y < 290;
      return inBoard ? [245, 232, 160] : [40, 60, 110];
    }),
  },
];

export const SAMPLE_PDF: SampleFile = {
  filename: 'milestone-acceptance-report.pdf',
  mimeType: 'application/pdf',
  ext: 'pdf',
  bytes: createPdf([
    [
      'Milestone Acceptance Report - Page 1 of 3',
      '',
      'Contract: CD-2026-003  Milestone: M1 Kickoff package',
      'Deliverable: requirements specification (version 2)',
      '',
      'Section 1 - Scope of the accepted delivery.',
      'This page describes what the customer received and',
      'which parts of the statement of work are complete.',
    ],
    [
      'Milestone Acceptance Report - Page 2 of 3',
      '',
      'Section 2 - Review findings.',
      'The acceptance specialist verified the delivery against',
      'each clause of the signed contract and recorded two',
      'returned items that were corrected in version 2.',
    ],
    [
      'Milestone Acceptance Report - Page 3 of 3',
      '',
      'Section 3 - Signature and follow up.',
      'Accepted by the customer representative on the recorded',
      'date. Payment is due against the confirmed receivable',
      'for this milestone.',
    ],
  ]),
};

/** The returned first version of the same acceptance report, still three pages. */
export const SAMPLE_PDF_V1: SampleFile = {
  filename: 'milestone-acceptance-report-draft.pdf',
  mimeType: 'application/pdf',
  ext: 'pdf',
  bytes: createPdf([
    [
      'Milestone Acceptance Report - Draft V1 - Page 1 of 3',
      '',
      'Reviewer note: this draft was returned because the interface',
      'list and the acceptance criteria were still missing.',
      'Page one only restates the delivery scope.',
    ],
    [
      'Milestone Acceptance Report - Draft V1 - Page 2 of 3',
      '',
      'Page two is intentionally different from page one and from',
      'the final version so reviewers can tell which version they',
      'are looking at before approving anything.',
    ],
    [
      'Milestone Acceptance Report - Draft V1 - Page 3 of 3',
      '',
      'Page three closes the draft with an empty signature block.',
      'It must not be approved; use the final version instead.',
    ],
  ]),
};

export const SAMPLE_TEXT: SampleFile = {
  filename: 'delivery-notes-zh.txt',
  mimeType: 'text/plain',
  ext: 'txt',
  bytes: Buffer.from(
    [
      '交付说明（中文）',
      '',
      '本次交付包含需求规格说明书第二版，已根据验收意见补充了接口约定与验收标准。',
      '一、修订内容：补充第 3 章接口清单，明确数据字段与返回码。',
      '二、遗留问题：生产环境的第三方证书需要客户在部署前提供。',
      '三、联系人：项目经理 张伟；验收专员 李娜。',
      '',
      '本文件由合同履约与交付验收系统生成，仅用于演示，不包含任何真实客户信息。',
      '',
    ].join('\n'),
    'utf8',
  ),
};

export const SAMPLE_CSV: SampleFile = {
  filename: 'milestone-payment-plan.csv',
  mimeType: 'text/csv',
  ext: 'csv',
  bytes: Buffer.from(
    [
      '里程碑编号,里程碑名称,应收金额,已收金额,状态,收款日期',
      'M1,启动与需求确认,180000.00,180000.00,已收,2026-03-18',
      'M2,方案设计评审,240000.00,120000.00,部分收,2026-04-22',
      'M3,系统上线验收,260000.00,0.00,未收,',
      '',
    ].join('\n'),
    'utf8',
  ),
};

export const SAMPLE_UNSUPPORTED: SampleFile = {
  filename: 'source-package-archive.zip',
  mimeType: 'application/zip',
  ext: 'zip',
  bytes: createZip(),
};

export const SAMPLE_FILES: readonly SampleFile[] = [
  ...SAMPLE_IMAGES,
  SAMPLE_PDF,
  SAMPLE_PDF_V1,
  SAMPLE_TEXT,
  SAMPLE_CSV,
  SAMPLE_UNSUPPORTED,
];

const MANAGER = 'demo-user-0000-4000-8000-000000000001';
const FINANCE = 'demo-user-0000-4000-8000-000000000003';

const USER_NAMES: Readonly<Record<string, string>> = {
  [MANAGER]: '张伟',
  [FINANCE]: '王芳',
};

const TIMESTAMP = '2026-01-05T09:00:00.000';

const [sitePhoto, signatureBoard] = SAMPLE_IMAGES;

interface SeedFileRecord {
  readonly id: string;
  readonly fileKind: 'contract' | 'deliverable' | 'payment';
  readonly targetType: 'contract' | 'version' | 'payment';
  readonly targetId: number;
  readonly uploadedById: string;
  readonly sample: SampleFile;
}

/** Deterministic UUID for each seeded file record. */
export const FILE_IDS: readonly string[] = [
  '1f0a0000-0000-4000-8000-000000000001',
  '1f0a0000-0000-4000-8000-000000000002',
  '1f0a0000-0000-4000-8000-000000000003',
  '1f0a0000-0000-4000-8000-000000000004',
  '1f0a0000-0000-4000-8000-000000000005',
  '1f0a0000-0000-4000-8000-000000000006',
  '1f0a0000-0000-4000-8000-000000000007',
  '1f0a0000-0000-4000-8000-000000000008',
  '1f0a0000-0000-4000-8000-000000000009',
  '1f0a0000-0000-4000-8000-000000000010',
];

/**
 * Contract 3 carries two images and an archive; milestone 5 version 1 (returned)
 * carries a draft PDF, an image and an archive; version 2 (approved) carries the
 * final PDF, a Chinese text note and a CSV; payment 1 carries a CSV receipt.
 */
export const SEED_FILE_RECORDS: readonly SeedFileRecord[] = [
  {
    id: FILE_IDS[0],
    fileKind: 'contract',
    targetType: 'contract',
    targetId: 3,
    uploadedById: MANAGER,
    sample: sitePhoto,
  },
  {
    id: FILE_IDS[1],
    fileKind: 'contract',
    targetType: 'contract',
    targetId: 3,
    uploadedById: MANAGER,
    sample: signatureBoard,
  },
  {
    id: FILE_IDS[2],
    fileKind: 'contract',
    targetType: 'contract',
    targetId: 3,
    uploadedById: MANAGER,
    sample: SAMPLE_UNSUPPORTED,
  },
  {
    id: FILE_IDS[3],
    fileKind: 'deliverable',
    targetType: 'version',
    targetId: 4,
    uploadedById: MANAGER,
    sample: SAMPLE_PDF_V1,
  },
  {
    id: FILE_IDS[4],
    fileKind: 'deliverable',
    targetType: 'version',
    targetId: 4,
    uploadedById: MANAGER,
    sample: sitePhoto,
  },
  {
    id: FILE_IDS[5],
    fileKind: 'deliverable',
    targetType: 'version',
    targetId: 4,
    uploadedById: MANAGER,
    sample: SAMPLE_UNSUPPORTED,
  },
  {
    id: FILE_IDS[6],
    fileKind: 'deliverable',
    targetType: 'version',
    targetId: 5,
    uploadedById: MANAGER,
    sample: SAMPLE_PDF,
  },
  {
    id: FILE_IDS[7],
    fileKind: 'deliverable',
    targetType: 'version',
    targetId: 5,
    uploadedById: MANAGER,
    sample: SAMPLE_TEXT,
  },
  {
    id: FILE_IDS[8],
    fileKind: 'deliverable',
    targetType: 'version',
    targetId: 5,
    uploadedById: MANAGER,
    sample: SAMPLE_CSV,
  },
  {
    id: FILE_IDS[9],
    fileKind: 'payment',
    targetType: 'payment',
    targetId: 1,
    uploadedById: FINANCE,
    sample: SAMPLE_CSV,
  },
];

const FILE_COLLECTION_BY_KIND: Readonly<
  Record<SeedFileRecord['fileKind'], string>
> = {
  contract: 'cdContractFiles',
  deliverable: 'cdDeliverableFiles',
  payment: 'cdPaymentFiles',
};

/**
 * The directory keys are resolved against — that is, the location of the
 * configured `local` disk, which is where the file plugin reads content from.
 *
 * It is not simply `<app>/storage`: a deployment and factory verification both
 * replace `drive.disks.local.location` in the configuration with a directory
 * outside the application, so writing to a guessed path would store bytes the
 * running server never looks at. `CD_LOCAL_DISK_DIR` is published by the seed
 * command from the configuration it resolves (see `cli/commands/seed.ts`). The
 * fallback keeps a direct run — including `seeds.autoRun` inside the server,
 * where the default `drive` config points at `<app>/storage` — working.
 */
function storageDirectory(): string {
  return (
    process.env.CD_LOCAL_DISK_DIR ??
    process.env.APP_STORAGE_DIR ??
    path.resolve(process.cwd(), 'storage')
  );
}

async function insertMissing(
  { query }: SeedContext,
  table: string,
  id: number | string,
  values: Record<string, unknown>,
): Promise<void> {
  const existing = await query
    .selectFrom(table)
    .select('id')
    .where('id', '=', id)
    .limit(1)
    .executeTakeFirst();
  if (existing) return;
  await query
    .insertInto(table)
    .values({ id, ...values })
    .execute();
}

const seed: SeedDefinition = defineSeed({
  name: '202609200011_seed_contract_delivery_sample_files',

  async run(context) {
    const objectsDirectory = path.join(storageDirectory(), 'objects');
    await mkdir(objectsDirectory, { recursive: true });

    let linkId = 401;
    for (const record of SEED_FILE_RECORDS) {
      const collection = FILE_COLLECTION_BY_KIND[record.fileKind];
      const key = `objects/${record.id}.${record.sample.ext}`;
      await writeFile(path.join(storageDirectory(), key), record.sample.bytes);
      await insertMissing(context, collection, record.id, {
        disk: 'local',
        key,
        filename: record.sample.filename,
        ext: record.sample.ext,
        mimeType: record.sample.mimeType,
        size: record.sample.bytes.length,
        uploadedById: record.uploadedById,
        uploadedByName: USER_NAMES[record.uploadedById] ?? 'nocobase',
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      });
      await insertMissing(context, 'cdFileLinks', linkId, {
        fileKind: record.fileKind,
        fileId: record.id,
        targetType: record.targetType,
        targetId: record.targetId,
        createdById: record.uploadedById,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
      });
      linkId += 1;
    }
  },
});

export default seed;
