import { defineSeed, type SeedDefinition } from '@nocobase/db';
import { deflateSync } from 'node:zlib';

/**
 * Sample attachments for the quality data set, plus the review history rows
 * that belong to the seeded rectifications.
 *
 * The metadata rows are seeded, but the bytes cannot be written here: a seed
 * only receives the database connection, while the objects live on whichever
 * disk the running application configures — and the factory runtime points that
 * disk outside the workspace. This module is therefore the single definition of
 * the sample content: it exports the descriptors and a deterministic renderer,
 * and `server/providers/quality-sample-objects.ts` imports them at startup to
 * write any missing object onto the configured drive and reconcile each row's
 * `size`. One definition, so a row can never disagree with the bytes served for
 * it.
 *
 * The bytes are generated locally — a PNG image, a multi-page PDF and plain
 * text — and contain no real personal information. Everything is keyed by fixed
 * ids and the whole seed is skipped once its first attachment exists, so a
 * re-run neither duplicates rows nor touches an object a user has replaced.
 */

const TRIAL_USER_IDS = {
  supervisor: 'qcuser00000000000000000000000001',
  inspector: 'qcuser00000000000000000000000002',
  inspectorTwo: 'qcuser00000000000000000000000003',
  productionLead: 'qcuser00000000000000000000000004',
} as const;

const pad = (value: number, width: number): string =>
  String(value).padStart(width, '0');
const itemId = (task: number, seq: number): string =>
  `qitem${pad(task, 24)}${pad(seq, 2)}`;
const batchId = (n: number): string => `qbatch${pad(n, 24)}`;
const ncId = (n: number): string => `qnc${pad(n, 27)}`;
const attachmentId = (n: number): string => `qatt${pad(n, 27)}`;
const reviewId = (n: number): string => `qreview${pad(n, 26)}`;

/** Object key prefix shared by every seeded sample attachment. */
export const SAMPLE_OBJECT_KEY_PREFIX = 'quality-seed';

export type SampleFileKind = 'image' | 'pdf' | 'text' | 'binary';

export interface SampleFile {
  readonly id: string;
  readonly targetType: 'item' | 'batch' | 'nonconformance';
  readonly targetId: string;
  readonly category: string;
  readonly round: number;
  readonly uploadedById: string;
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly createdAt: string;
  readonly kind: SampleFileKind;
  readonly text?: string;
  readonly pages?: readonly string[];
}

export const SAMPLE_FILES: readonly SampleFile[] = [
  {
    id: attachmentId(1),
    targetType: 'item',
    targetId: itemId(1, 1),
    category: 'item_photo',
    round: 1,
    uploadedById: TRIAL_USER_IDS.inspector,
    filename: '现场照片-轴承外径.png',
    ext: 'png',
    mimeType: 'image/png',
    createdAt: '2026-08-01T09:10:00.000Z',
    kind: 'image',
  },
  {
    id: attachmentId(2),
    targetType: 'item',
    targetId: itemId(1, 1),
    category: 'item_report',
    round: 1,
    uploadedById: TRIAL_USER_IDS.inspector,
    filename: '测量报告-QC-20260801-001.pdf',
    ext: 'pdf',
    mimeType: 'application/pdf',
    createdAt: '2026-08-01T09:12:00.000Z',
    kind: 'pdf',
    pages: [
      'Measurement report (sample)',
      'Task QC-20260801-001 / Batch B-2026-001',
      'Outer diameter 20.004 mm - within tolerance',
    ],
  },
  {
    id: attachmentId(3),
    targetType: 'item',
    targetId: itemId(1, 1),
    category: 'item_note',
    round: 1,
    uploadedById: TRIAL_USER_IDS.inspector,
    filename: '检验记录-QC-20260801-001.txt',
    ext: 'txt',
    mimeType: 'text/plain',
    createdAt: '2026-08-01T09:15:00.000Z',
    kind: 'text',
    text: [
      '检验记录（演示用虚构数据，不含真实个人信息）',
      '任务号：QC-20260801-001',
      '批次号：B-2026-001',
      '检查项：外径尺寸 / 内径尺寸 / 宽度 / 外观',
      '结论：全部合格。',
    ].join('\n'),
  },
  {
    id: attachmentId(4),
    targetType: 'item',
    targetId: itemId(1, 1),
    category: 'item_report',
    round: 1,
    uploadedById: TRIAL_USER_IDS.inspector,
    filename: '原始数据-外径.dat',
    ext: 'dat',
    mimeType: 'application/octet-stream',
    createdAt: '2026-08-01T09:16:00.000Z',
    kind: 'binary',
  },
  {
    id: attachmentId(5),
    targetType: 'batch',
    targetId: batchId(1),
    category: 'batch_factory_report',
    round: 1,
    uploadedById: TRIAL_USER_IDS.supervisor,
    filename: '出厂报告-B-2026-001.pdf',
    ext: 'pdf',
    mimeType: 'application/pdf',
    createdAt: '2026-08-02T01:00:00.000Z',
    kind: 'pdf',
    pages: [
      'Factory release report (sample)',
      'Batch B-2026-001 / Product P-1001',
    ],
  },
  {
    id: attachmentId(6),
    targetType: 'nonconformance',
    targetId: ncId(4),
    category: 'nc_problem',
    round: 1,
    uploadedById: TRIAL_USER_IDS.productionLead,
    filename: '问题证据-硬度偏低.png',
    ext: 'png',
    mimeType: 'image/png',
    createdAt: '2026-08-17T09:35:00.000Z',
    kind: 'image',
  },
  {
    id: attachmentId(7),
    targetType: 'nonconformance',
    targetId: ncId(4),
    category: 'nc_after',
    round: 1,
    uploadedById: TRIAL_USER_IDS.productionLead,
    filename: '处理后记录-复检结果.txt',
    ext: 'txt',
    mimeType: 'text/plain',
    createdAt: '2026-08-17T10:05:00.000Z',
    kind: 'text',
    text: [
      '处理后记录（演示用虚构数据，不含真实个人信息）',
      '措施：校准热处理炉温控系统，返工重新热处理。',
      '复检硬度：HRC 27，符合 HRC 22-32。',
    ].join('\n'),
  },
  {
    id: attachmentId(8),
    targetType: 'nonconformance',
    targetId: ncId(5),
    category: 'nc_problem',
    round: 1,
    uploadedById: TRIAL_USER_IDS.productionLead,
    filename: '问题证据-螺纹超差.png',
    ext: 'png',
    mimeType: 'image/png',
    createdAt: '2026-08-21T02:10:00.000Z',
    kind: 'image',
  },
  {
    id: attachmentId(9),
    targetType: 'nonconformance',
    targetId: ncId(5),
    category: 'nc_after',
    round: 1,
    uploadedById: TRIAL_USER_IDS.productionLead,
    filename: '第一轮处理说明.txt',
    ext: 'txt',
    mimeType: 'text/plain',
    createdAt: '2026-08-21T02:20:00.000Z',
    kind: 'text',
    text: [
      '第一轮处理说明（演示用虚构数据）',
      '措施：更换螺纹加工刀具。',
      '本文件属于第 1 轮资料，退回后仍会保留。',
    ].join('\n'),
  },
  {
    id: attachmentId(10),
    targetType: 'nonconformance',
    targetId: ncId(5),
    category: 'nc_after',
    round: 2,
    uploadedById: TRIAL_USER_IDS.productionLead,
    filename: '第二轮补充说明.txt',
    ext: 'txt',
    mimeType: 'text/plain',
    createdAt: '2026-08-22T01:30:00.000Z',
    kind: 'text',
    text: [
      '第二轮补充说明（演示用虚构数据）',
      '补充：说明复检方案与责任工序。',
      '本文件属于第 2 轮资料，与第 1 轮资料分开存放。',
    ].join('\n'),
  },
];

/** The object key an attachment's bytes are stored under. */
export function sampleObjectKey(file: Pick<SampleFile, 'id' | 'ext'>): string {
  return `${SAMPLE_OBJECT_KEY_PREFIX}/${file.id}.${file.ext}`;
}

/** Deterministic bytes for one sample attachment; no real personal data. */
export function renderSampleFile(file: SampleFile): Buffer {
  switch (file.kind) {
    case 'image':
      return samplePng();
    case 'pdf':
      return samplePdf(file.pages ?? ['Sample document']);
    case 'text':
      return Buffer.from(file.text ?? '', 'utf8');
    default:
      return Buffer.from(
        'RAW,SAMPLE,20.004,47.006,14.01,no-personal-data\n',
        'utf8',
      );
  }
}

const SAMPLE_REVIEWS = [
  {
    id: reviewId(1),
    nonconformanceId: ncId(4),
    round: 1,
    decision: 'close',
    comment: '措施有效，复检结果合格，同意关闭。',
    reviewedById: TRIAL_USER_IDS.supervisor,
    reviewedAt: '2026-08-18T01:00:00.000Z',
  },
  {
    id: reviewId(2),
    nonconformanceId: ncId(5),
    round: 1,
    decision: 'return',
    comment: '措施过于笼统，未说明复检方案与责任工序，退回补充。',
    reviewedById: TRIAL_USER_IDS.supervisor,
    reviewedAt: '2026-08-21T09:00:00.000Z',
  },
] as const;

const seed: SeedDefinition = defineSeed({
  name: '202609190006_seed_quality_sample_files_and_reviews',
  transaction: true,

  async run({ query, connection }) {
    const client = await connection.client<TableSchemaClient>();
    // `schema.hasTable` reads physical names, which the naming strategy derives
    // from the logical ones (`qualityAttachments` -> `quality_attachments`).
    if (
      !(await client.schema.hasTable('nonconformances')) ||
      !(await client.schema.hasTable('quality_attachments')) ||
      !(await client.schema.hasTable('nonconformance_reviews'))
    ) {
      return;
    }

    const marker = await query
      .selectFrom('qualityAttachments')
      .select('id')
      .where('id', '=', SAMPLE_FILES[0].id)
      .executeTakeFirst();
    if (marker) return;

    // Only decorate the sample data set; skip when it is not present.
    const sampleNonconformance = await query
      .selectFrom('nonconformances')
      .select('id')
      .where('id', '=', ncId(5))
      .executeTakeFirst();
    if (!sampleNonconformance) return;

    for (const file of SAMPLE_FILES) {
      const bytes = renderSampleFile(file);
      const createdAt = new Date(file.createdAt);
      await query
        .insertInto('qualityAttachments')
        .values({
          id: file.id,
          disk: 'local',
          key: sampleObjectKey(file),
          filename: file.filename,
          ext: file.ext,
          mimeType: file.mimeType,
          size: bytes.length,
          createdAt,
          updatedAt: createdAt,
          targetType: file.targetType,
          targetId: file.targetId,
          category: file.category,
          round: file.round,
          uploadedById: file.uploadedById,
        })
        .execute();
    }

    // The seeded returned rectification is already in its second handling
    // round, and the closed one keeps its first-round review.
    await query
      .updateTable('nonconformances')
      .set({ round: 2 })
      .where('id', '=', ncId(5))
      .execute();
    await query
      .insertInto('nonconformanceReviews')
      .values(
        SAMPLE_REVIEWS.map((review) => ({
          ...review,
          reviewedAt: new Date(review.reviewedAt),
          createdAt: new Date(review.reviewedAt),
        })),
      )
      .execute();
  },
});

// --- deterministic sample bytes -------------------------------------------

/** A small PNG with a border and diagonal bands, so zooming is visible. */
function samplePng(): Buffer {
  const width = 320;
  const height = 200;
  const bands: readonly (readonly [number, number, number])[] = [
    [59, 130, 246],
    [16, 185, 129],
    [245, 158, 11],
  ];
  const border: readonly [number, number, number] = [31, 41, 55];
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0; // filter: none
    offset += 1;
    for (let x = 0; x < width; x += 1) {
      const edge = x < 6 || y < 6 || x >= width - 6 || y >= height - 6;
      const [r, g, b]: readonly [number, number, number] = edge
        ? border
        : bands[Math.floor((x + y) / 24) % bands.length];
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = 255;
      offset += 4;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])) >>> 0, 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** A valid multi-page PDF with one text line per page (standard Type1 font). */
function samplePdf(pages: readonly string[]): Buffer {
  const pageNumbers = pages.map((_, index) => 3 + index * 2);
  const fontNumber = 3 + pages.length * 2;
  const objects = new Map<number, string>();
  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objects.set(
    2,
    `<< /Type /Pages /Kids [${pageNumbers
      .map((number) => `${number} 0 R`)
      .join(' ')}] /Count ${pages.length} >>`,
  );
  pages.forEach((line, index) => {
    const pageNumber = 3 + index * 2;
    const contentNumber = pageNumber + 1;
    objects.set(
      pageNumber,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontNumber} 0 R >> >> /Contents ${contentNumber} 0 R >>`,
    );
    const stream = `BT /F1 24 Tf 72 760 Td (${escapePdfText(line)}) Tj ET`;
    objects.set(
      contentNumber,
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    );
  });
  objects.set(
    fontNumber,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  );

  const maxObject = fontNumber;
  let pdf = '%PDF-1.4\n';
  const offsets = new Array<number>(maxObject + 1).fill(0);
  for (let number = 1; number <= maxObject; number += 1) {
    offsets[number] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${number} 0 obj\n${objects.get(number) ?? ''}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${maxObject + 1}\n0000000000 65535 f \n`;
  for (let number = 1; number <= maxObject; number += 1) {
    pdf += `${String(offsets[number]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${maxObject + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

function escapePdfText(value: string): string {
  return value.replace(/[\\()]/g, (char) => `\\${char}`);
}

interface TableSchemaClient {
  readonly schema: {
    hasTable(table: string): Promise<boolean>;
  };
}

export default seed;
