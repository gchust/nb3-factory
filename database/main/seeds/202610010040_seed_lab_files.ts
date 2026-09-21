import { deflateSync } from 'node:zlib';

import { defineSeed } from '@nocobase/db';

// ---------------------------------------------------------------------------
// Fixture byte builders
//
// Programmatic instead of checked-in binaries: a PNG, PDF, DOCX, CSV, plain-text notice
// and ZIP archive are all produced deterministically, so the seed is reviewable in a diff
// and re-runs produce identical bytes.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// CRC32 (shared by the PNG and ZIP writers below)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[n] = value >>> 0;
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

// ---------------------------------------------------------------------------
// PNG images
// ---------------------------------------------------------------------------

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, checksum]);
}

interface PngOptions {
  width: number;
  height: number;
  /** Base RGB colour of the plate. */
  rgb: [number, number, number];
  /** Draws a diagonal band so two images of the same colour still differ. */
  accent?: [number, number, number];
}

function makePng(options: PngOptions): Buffer {
  const { width, height, rgb, accent = rgb } = options;
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter: adaptive
  ihdr[12] = 0; // interlace: none

  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter byte
    for (let x = 0; x < width; x += 1) {
      const inBand = Math.abs(x - y) < Math.max(2, Math.round(width / 8));
      const [r, g, b] = inBand ? accent : rgb;
      const offset = rowStart + 1 + x * 3;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
    }
  }

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// PDF documents
// ---------------------------------------------------------------------------

function escapePdfText(value: string): string {
  return value
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Builds a valid multi-page PDF using the built-in Helvetica font, so no font
 * program has to be embedded. Content is deliberately ASCII: the standard 14
 * fonts only cover WinAnsi, and shipping a Unicode font would bloat the seed.
 */
function buildPdf(pages: string[][]): Buffer {
  const pageCount = pages.length;
  const objects: string[] = [];

  const kids = pages.map((_, index) => `${4 + index * 2} 0 R`).join(' ');
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  pages.forEach((lines, index) => {
    const pageObject = 4 + index * 2;
    const contentObject = 5 + index * 2;
    objects[pageObject] =
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ' +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`;

    const stream = lines
      .map((line, lineIndex) => {
        const size = lineIndex === 0 ? 20 : 12;
        const y = 780 - lineIndex * 34;
        return `BT /F1 ${size} Tf 60 ${y} Td (${escapePdfText(line)}) Tj ET`;
      })
      .join('\n');
    objects[contentObject] =
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = pdf.length;
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const size = objects.length;
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let index = 1; index < size; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

// ---------------------------------------------------------------------------
// DOCX documents (a ZIP with an Office Open XML payload, stored uncompressed)
// ---------------------------------------------------------------------------

interface ZipEntry {
  name: string;
  data: Buffer;
}

function zipStore(entries: ZipEntry[]): Buffer {
  // 1980-01-01, so the archive is byte-identical between runs.
  const dosTime = 0;
  const dosDate = 0x21;

  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const checksum = crc32(entry.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(0, 38); // external attributes
    central.writeUInt32LE(offset, 42);

    localParts.push(local, name, entry.data);
    centralParts.push(central, name);
    offset += local.length + name.length + entry.data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Builds a minimal but valid `.docx` whose body is one paragraph per string. */
function buildDocx(paragraphs: string[]): Buffer {
  const contentTypes = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    '</Types>',
  ].join('');

  const relationships = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>',
    '</Relationships>',
  ].join('');

  const body = paragraphs
    .map(
      (paragraph) =>
        `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(paragraph)}</w:t></w:r></w:p>`,
    )
    .join('');

  const document = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
    `<w:body>${body}</w:body>`,
    '</w:document>',
  ].join('');

  return zipStore([
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(relationships, 'utf8') },
    { name: 'word/document.xml', data: Buffer.from(document, 'utf8') },
  ]);
}

// ---------------------------------------------------------------------------
// Text fixtures
// ---------------------------------------------------------------------------

/** A risk notice long enough to exceed the preview's truncation threshold. */
function buildLongRiskNotice(): Buffer {
  const heading = [
    '实验室安全风险告知书',
    '实验室：物理测量实验室（LAB-A）',
    '适用范围：进入本实验室开展教学、科研与设备维护的所有人员。',
    '',
  ].join('\n');

  const clauses = [
    '一、进入实验室必须穿好实验服，长发须束起，禁止佩戴宽松饰物靠近旋转设备。',
    '二、使用电子天平时应避免震动与气流，称量前后须关闭防风罩并记录读数。',
    '三、离心机运行时严禁开盖，出现异常噪音应立即断电并报告设备管理员。',
    '四、高温设备、激光设备与高压气瓶必须由取得培训合格记录的人员操作。',
    '五、发现漏电、异味、冒烟或液体泄漏，应第一时间按下急停并通知安全员。',
    '六、设备校准有效期届满时不得开展影响量值准确性的实验，须先申请复校。',
    '七、维修作业前必须挂牌上锁，确认设备已断电、卸压、降至常温后方可拆装。',
    '八、危险化学品须分类存放于专用柜中，使用后及时归还并登记台账。',
    '九、实验结束后须关闭水、电、气与门窗，确认无遗留样品后方可离开。',
    '十、任何人不得绕过安全联锁装置，不得私自改装实验室供电与通风线路。',
  ];

  const repeated: string[] = [];
  // Repeat the clauses until well past the truncation threshold so the preview
  // demonstrates its "content is truncated" notice on a realistically long file.
  for (let round = 0; round < 28; round += 1) {
    repeated.push(`———— 第 ${round + 1} 次宣讲记录 ————`);
    repeated.push(...clauses, '');
  }

  return Buffer.from(`${heading}${repeated.join('\n')}\n`, 'utf8');
}

/** A training roster whose columns match the records seeded alongside it. */
function buildTrainingRoster(): Buffer {
  const rows = [
    ['姓名', '工号', '角色', '培训课程', '培训日期', '考核结果'],
    ['张伟', 'S2024001', '学生', '电子天平安全操作', '2026-03-02', '合格'],
    ['李娜', 'S2024002', '学生', '电子天平安全操作', '2026-03-02', '合格'],
    ['王强', 'S2024003', '学生', '离心机安全操作', '2026-03-05', '合格'],
    ['赵敏', 'S2024004', '学生', '离心机安全操作', '2026-03-05', '补考合格'],
    ['陈刚', 'T2023001', '技术员', '维修挂牌上锁流程', '2026-03-08', '合格'],
    ['周涛', 'T2023002', '技术员', '维修挂牌上锁流程', '2026-03-08', '合格'],
    ['孙芳', 'F2022001', '教师', '实验室应急处置演练', '2026-03-12', '合格'],
    ['吴磊', 'F2022002', '教师', '实验室应急处置演练', '2026-03-12', '合格'],
  ];
  return Buffer.from(
    `${rows.map((row) => row.join(',')).join('\r\n')}\r\n`,
    'utf8',
  );
}

function buildUnsupportedArchive(): Buffer {
  return zipStore([
    {
      name: 'readme.txt',
      data: Buffer.from(
        '本压缩包用于演示无法在线预览的文件只能下载。\n',
        'utf8',
      ),
    },
    {
      name: 'archive-index.csv',
      data: Buffer.from('编号,说明\nA-001,历史归档资料\n', 'utf8'),
    },
  ]);
}

/**
 * The seeded attachments.
 *
 * Filenames are fixed, so a re-run recognises an existing file by
 * `(targetType, targetId, filename)` and does not insert a duplicate. The byte
 * bodies are generated in `fixtures/file-bytes.ts`, which keeps them reviewable
 * and avoids checking binaries into the repository.
 */

const CREATED_AT = new Date('2026-03-20T08:00:00.000Z');

interface FileSeed {
  targetType:
    | 'laboratory'
    | 'equipment'
    | 'calibration'
    | 'work_order'
    | 'training_record';
  targetKey: string;
  purpose: string;
  filename: string;
  mimeType: string;
  remark: string;
  uploadedBy: string;
  content: Buffer;
}

const CALIBRATION_PDF = buildPdf([
  [
    'Calibration Certificate',
    'Asset: EQ-2026-001',
    'Certificate No: CAL-2026-0630-001',
  ],
  ['Page 2 - Measurement Results', 'Nominal 100.0000 g  Indicated 100.0002 g'],
  ['Page 3 - Conclusion', 'Result: PASSED. Next due date: 2027-06-30.'],
]);

const BALANCE_MANUAL = buildPdf([
  ['Electronic Balance BSA224S', 'Operating Manual (abridged)'],
  [
    'Section 3 - Leveling and Warm-up',
    'Level the balance and warm up for 30 minutes.',
  ],
]);

const PH_CERTIFICATE = buildPdf([
  [
    'Calibration Certificate',
    'Asset: EQ-2026-101',
    'Certificate No: CAL-2026-0120-118',
  ],
  ['Page 2 - Buffer Check', 'pH 4.00 / 6.86 / 9.18 within tolerance.'],
]);

const FAULT_REPORT = buildDocx([
  '设备故障分析报告',
  '设备名称：高速离心机（EQ-2026-003）',
  '故障现象：升速阶段出现周期性异响，转速稳定后异响减弱。',
  '检查过程：断电挂牌后拆检转子，发现驱动端轴承滚道点蚀。',
  '原因分析：轴承达到使用寿命，长期高频次使用加速磨损。',
  '处理措施：更换驱动端轴承并做动平衡复检，复检合格后恢复使用。',
  '审核意见：同意按上述措施维修，维修完成后需由安全员确认无未闭环高风险隐患。',
]);

const FILE_SEEDS: FileSeed[] = [
  {
    targetType: 'equipment',
    targetKey: 'EQ-2026-001',
    purpose: 'nameplate',
    filename: '电子天平-铭牌.png',
    mimeType: 'image/png',
    remark: '设备铭牌照片，含型号与出厂编号。',
    uploadedBy: 'demo-labadmin',
    content: makePng({
      width: 480,
      height: 320,
      rgb: [37, 99, 235],
      accent: [147, 197, 253],
    }),
  },
  {
    targetType: 'equipment',
    targetKey: 'EQ-2026-001',
    purpose: 'manual',
    filename: '电子天平-使用说明书.pdf',
    mimeType: 'application/pdf',
    remark: '厂家说明书节选，含调平与预热要求。',
    uploadedBy: 'demo-labadmin',
    content: BALANCE_MANUAL,
  },
  {
    targetType: 'equipment',
    targetKey: 'EQ-2026-004',
    purpose: 'nameplate',
    filename: '分光光度计-铭牌.png',
    mimeType: 'image/png',
    remark: '设备铭牌照片，用于核对资产编号。',
    uploadedBy: 'demo-labadmin',
    content: makePng({
      width: 420,
      height: 300,
      rgb: [124, 58, 237],
      accent: [221, 214, 254],
    }),
  },
  {
    targetType: 'equipment',
    targetKey: 'EQ-2026-101',
    purpose: 'nameplate',
    filename: '酸度计-铭牌.png',
    mimeType: 'image/png',
    remark: '分析化学实验室酸度计铭牌。',
    uploadedBy: 'demo-lab2admin',
    content: makePng({
      width: 460,
      height: 300,
      rgb: [13, 148, 136],
      accent: [153, 246, 228],
    }),
  },
  {
    targetType: 'calibration',
    targetKey: 'CAL-2026-0630-001',
    purpose: 'certificate',
    filename: '电子天平-校准证书-2026.pdf',
    mimeType: 'application/pdf',
    remark: '三页校准证书，含结论与下次到期日。',
    uploadedBy: 'demo-labadmin',
    content: CALIBRATION_PDF,
  },
  {
    targetType: 'calibration',
    targetKey: 'CAL-2026-0120-118',
    purpose: 'certificate',
    filename: '酸度计-校准证书-2026.pdf',
    mimeType: 'application/pdf',
    remark: '分析化学实验室酸度计校准证书。',
    uploadedBy: 'demo-lab2admin',
    content: PH_CERTIFICATE,
  },
  {
    targetType: 'work_order',
    targetKey: 'WO-2026-001',
    purpose: 'before_repair',
    filename: '离心机-维修前-异响部位.png',
    mimeType: 'image/png',
    remark: '拆检前拍摄的驱动端位置。',
    uploadedBy: 'demo-tech1',
    content: makePng({
      width: 500,
      height: 360,
      rgb: [220, 38, 38],
      accent: [254, 202, 202],
    }),
  },
  {
    targetType: 'work_order',
    targetKey: 'WO-2026-001',
    purpose: 'after_repair',
    filename: '离心机-维修后-更换轴承.png',
    mimeType: 'image/png',
    remark: '更换轴承并完成动平衡复检后拍摄。',
    uploadedBy: 'demo-tech1',
    content: makePng({
      width: 500,
      height: 360,
      rgb: [22, 163, 74],
      accent: [187, 247, 208],
    }),
  },
  {
    targetType: 'work_order',
    targetKey: 'WO-2026-001',
    purpose: 'fault_report',
    filename: '离心机-故障分析报告.docx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    remark: '故障原因分析与处理措施，不支持在线预览，请下载后查看。',
    uploadedBy: 'demo-tech1',
    content: FAULT_REPORT,
  },
  {
    targetType: 'training_record',
    targetKey: '电子天平安全操作培训',
    purpose: 'roster',
    filename: '电子天平培训-签到表.csv',
    mimeType: 'text/csv',
    remark: '参训人员签到表，含角色与考核结果。',
    uploadedBy: 'demo-teacher1',
    content: buildTrainingRoster(),
  },
  {
    targetType: 'laboratory',
    targetKey: 'LAB-A',
    purpose: 'risk_notice',
    filename: '物理测量实验室-安全风险告知书.txt',
    mimeType: 'text/plain',
    remark: '超长风险告知书，用于演示长文本截断提示。',
    uploadedBy: 'demo-safety1',
    content: buildLongRiskNotice(),
  },
  {
    targetType: 'laboratory',
    targetKey: 'LAB-A',
    purpose: 'archive',
    filename: '实验室历史资料归档.zip',
    mimeType: 'application/zip',
    remark: '压缩归档文件，不支持在线预览，只能下载。',
    uploadedBy: 'demo-labadmin',
    content: buildUnsupportedArchive(),
  },
  {
    targetType: 'laboratory',
    targetKey: 'LAB-B',
    purpose: 'risk_notice',
    filename: '分析化学实验室-安全风险告知书.txt',
    mimeType: 'text/plain',
    remark: '分析化学实验室风险告知摘要。',
    uploadedBy: 'demo-lab2admin',
    content: Buffer.from(
      [
        '分析化学实验室安全风险告知书',
        '一、进入实验室必须穿实验服并佩戴护目镜。',
        '二、强酸强碱操作必须在通风柜内进行。',
        '三、废液按类别收集，禁止倒入下水道。',
        '',
      ].join('\n'),
      'utf8',
    ),
  },
];

const seed = defineSeed({
  name: '202610010040_seed_lab_files',
  async run({ query }) {
    const labIds = new Map<string, number>();
    for (const code of ['LAB-A', 'LAB-B']) {
      const lab = await query
        .selectFrom('laboratories')
        .select('id')
        .where('code', '=', code)
        .executeTakeFirstOrThrow();
      labIds.set(code, Number(lab.id));
    }

    const equipmentIds = new Map<string, number>();
    for (const assetNo of [
      'EQ-2026-001',
      'EQ-2026-003',
      'EQ-2026-004',
      'EQ-2026-101',
    ]) {
      const equipment = await query
        .selectFrom('equipment')
        .select('id')
        .where('assetNo', '=', assetNo)
        .executeTakeFirstOrThrow();
      equipmentIds.set(assetNo, Number(equipment.id));
    }

    const calibrationIds = new Map<string, number>();
    for (const certificateNo of ['CAL-2026-0630-001', 'CAL-2026-0120-118']) {
      const calibration = await query
        .selectFrom('calibration_records')
        .select('id')
        .where('certificateNo', '=', certificateNo)
        .executeTakeFirstOrThrow();
      calibrationIds.set(certificateNo, Number(calibration.id));
    }

    const workOrderIds = new Map<string, number>();
    for (const code of ['WO-2026-001']) {
      const order = await query
        .selectFrom('work_orders')
        .select('id')
        .where('code', '=', code)
        .executeTakeFirstOrThrow();
      workOrderIds.set(code, Number(order.id));
    }

    const trainingIds = new Map<string, number>();
    for (const title of ['电子天平安全操作培训']) {
      const training = await query
        .selectFrom('training_records')
        .select('id')
        .where('title', '=', title)
        .executeTakeFirstOrThrow();
      trainingIds.set(title, Number(training.id));
    }

    /** Resolves a seeded natural key to the row id the file is attached to. */
    const resolveTargetId = (file: FileSeed): string => {
      const lookup = (map: Map<string, number>, label: string): string => {
        const found = map.get(file.targetKey);
        if (found === undefined) {
          throw new Error(
            `Seed file ${file.filename} references missing ${label} ${file.targetKey}`,
          );
        }
        return String(found);
      };
      switch (file.targetType) {
        case 'laboratory':
          return lookup(labIds, 'laboratory');
        case 'equipment':
          return lookup(equipmentIds, 'equipment');
        case 'calibration':
          return lookup(calibrationIds, 'calibration record');
        case 'work_order':
          return lookup(workOrderIds, 'work order');
        default:
          return lookup(trainingIds, 'training record');
      }
    };

    for (const file of FILE_SEEDS) {
      const targetId = resolveTargetId(file);

      const existing = await query
        .selectFrom('lab_files')
        .select('id')
        .where('targetType', '=', file.targetType)
        .where('targetId', '=', targetId)
        .where('filename', '=', file.filename)
        .executeTakeFirst();
      if (existing) {
        continue;
      }

      await query
        .insertInto('lab_files')
        .values({
          id: crypto.randomUUID(),
          filename: file.filename,
          ext: file.filename.includes('.')
            ? file.filename.split('.').pop()!.toLowerCase()
            : null,
          mimeType: file.mimeType,
          size: file.content.length,
          purpose: file.purpose,
          targetType: file.targetType,
          targetId,
          remark: file.remark,
          content: file.content,
          uploadedById: file.uploadedBy,
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
        })
        .execute();
    }
  },
});

export default seed;
