import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { defineSeed } from '@nocobase/db';

// Two materials owned by 资料员甲, each already carrying the three shapes the preview has to explain: a valid PNG photo,
// a valid DOCX document, and a PNG whose bytes are not a decodable image. The bytes are written beside the records so
// the seeded attachments are immediately openable in a fresh installation; a disk that is not a local filesystem gets
// the records without the objects, which is what a later upload supplies. Idempotent by owner, so a user who deletes a
// sample material does not have it silently recreated, and no sample ever overwrites a material the user edited.
const SAMPLE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAbElEQVR42g3JQQEAMAgDMZRUCUqqpEp4nwiUoGjLN1WFii5cpJhiiyuqhEQLi4gRK04/GjXduEkzzTbXP4xMG5uYMWvOP4JCB4eECRsuPwYNPXjIMMMONz8WLb14yTLLLrc/Dh19+Mgxxx53PMhZXIGg5EVJAAAAAElFTkSuQmCC';
const BROKEN_PNG =
  'iVBORw0KGgoAESIzABEiMwARIjMAESIzABEiMwARIjMAESIzABEiMwARIjMAESIzABEiMwARIjMAESIzABEiMwARIjMAESIzABEiMwARIjMAESIzABEiMw==';
const SAMPLE_DOCX =
  'UEsDBAoAAAAIAFYASV3JTxqw6wAAAK4BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QvU7DMBDeeQrLK4odGBBCSTrwMwJDeYCTfUks7LPlc0v79jht6YAK4933q69b7YIXW8zsIvXyRrVSIJloHU29/Fi/NPdScAGy4CNhL/fIcjVcdet9QhZVTNzLuZT0oDWbGQOwigmpImPMAUo986QTmE+YUN+27Z02kQpSacriIYfuCUfY+CKed/V9LJLRsxSPR+KS1UtIyTsDpeJ6S/ZXSnNKUFV54PDsEl9XgtQXExbk74CT7q0uk51F8Q65vEKoLP0Vs9U2mk2oSvW/zYWecRydwbN+cUs5GmSukwevzkgARz/99WHu4RtQSwMECgAAAAAAVgBJXQAAAAAAAAAAAAAAAAYAAABfcmVscy9QSwMECgAAAAgAVgBJXbmBRHGwAAAAKgEAAAsAAABfcmVscy8ucmVsc43POw7CMAwG4J1TRN5pWgaEUJMuCKkrKgeIEjeNaB5KwqO3JwMDIAZG278/y233sDO5YUzGOwZNVQNBJ70yTjM4D8f1DkjKwikxe4cMFkzQ8VV7wlnkspMmExIpiEsMppzDntIkJ7QiVT6gK5PRRytyKaOmQciL0Eg3db2l8d0A/mGSXjGIvWqADEvAf2w/jkbiwcurRZd/nPhKFFlEjZnB3UdF1atdFRYob+nHi/wJUEsDBAoAAAAAAFYASV0AAAAAAAAAAAAAAAAFAAAAd29yZC9QSwMECgAAAAgAVgBJXfZ17RUzAQAAwAEAABEAAAB3b3JkL2RvY3VtZW50LnhtbG1QTUsDMRC9+ytC7jZbLaWW7vbmTSioPyDdne5GNpmQjK715LmCIAgePKgH8SD03h/Ulv4Lk0opiJeXmTcvbz4Gw1tdsxtwXqFJebuVcAYmx0KZMuWXF6eHPc48SVPIGg2kfAqeD7ODQdMvML/WYIgFB+P7TcorItsXwucVaOlbaMGE2gSdlhRSV4oGXWEd5uB9aKBrcZQkXaGlMjwLlmMspvG1EVwEylYvX8u3x9XzYnP/vvlYrF/n6++HEKxmn8un2UBETUS3Rfv3+8jhFeTElFGkJIUtmQOLjliYi1EFDOuCETaRN9DImoUBSye1hta/7j7Yjbbutjy/Y03cvN0+Sbo8xFWIu73jHhe/gjPpAktoA9/pJFHiVFnRPh0jEep9XsNkVxXbprt+Yncfsb999gNQSwECFAAKAAAACABWAEldyU8asOsAAACuAQAAEwAAAAAAAAAAAAAAAAAAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUAAoAAAAAAFYASV0AAAAAAAAAAAAAAAAGAAAAAAAAAAAAEAAAABwBAABfcmVscy9QSwECFAAKAAAACABWAElduYFEcbAAAAAqAQAACwAAAAAAAAAAAAAAAABAAQAAX3JlbHMvLnJlbHNQSwECFAAKAAAAAABWAEldAAAAAAAAAAAAAAAABQAAAAAAAAAAABAAAAAZAgAAd29yZC9QSwECFAAKAAAACABWAEld9nXtFTMBAADAAQAAEQAAAAAAAAAAAAAAAAA8AgAAd29yZC9kb2N1bWVudC54bWxQSwUGAAAAAAUABQAgAQAAngMAAAAA';

interface AttachmentFixture {
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly base64: string;
}

interface MaterialFixture {
  readonly title: string;
  readonly description: string;
  readonly attachments: readonly AttachmentFixture[];
}

const materials: readonly MaterialFixture[] = [
  {
    title: '旧城改造项目现场照片',
    description: '现场勘查照片，可用于核对施工进度与现场情况。',
    attachments: [
      {
        filename: 'site-photo.png',
        ext: 'png',
        mimeType: 'image/png',
        base64: SAMPLE_PNG,
      },
    ],
  },
  {
    title: '项目立项报告与扫描件',
    description:
      '立项报告正文、随附扫描件，以及一个无法预览的图片用于验证异常提示。',
    attachments: [
      {
        filename: 'report.docx',
        ext: 'docx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        base64: SAMPLE_DOCX,
      },
      {
        filename: 'broken-photo.png',
        ext: 'png',
        mimeType: 'image/png',
        base64: BROKEN_PNG,
      },
    ],
  },
];

/** The local disk's directory, when the configured disk is the filesystem driver. */
function localDiskLocation(config: {
  get<T = unknown>(key: string): T | undefined;
}): string | undefined {
  try {
    if (config.get<string>('drive.disks.local.driver') !== 'fs')
      return undefined;
    const location = config.get<string>('drive.disks.local.location');
    return typeof location === 'string' && location ? location : undefined;
  } catch {
    return undefined;
  }
}

const seed = defineSeed({
  name: '202609050004_project_materials_sample_data',
  async run({ query, config }) {
    const owner = await query
      .selectFrom('user')
      .select('id')
      .where('username', '=', 'materiala')
      .limit(1)
      .executeTakeFirst();
    if (!owner) return;
    const ownerId = String(owner.id);

    const existing = await query
      .selectFrom('projectMaterials')
      .select('id')
      .where('createdById', '=', ownerId)
      .limit(1)
      .executeTakeFirst();
    if (existing) return;

    const now = new Date();
    const materialIds = materials.map(() => crypto.randomUUID());
    await query
      .insertInto('projectMaterials')
      .values(
        materials.map((material, index) => ({
          id: materialIds[index],
          title: material.title,
          description: material.description,
          createdById: ownerId,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .execute();

    const location = localDiskLocation(config);
    if (!location) return;
    const directory = path.join(location, 'objects');
    try {
      await mkdir(directory, { recursive: true });
    } catch {
      return;
    }

    const rows: Record<string, unknown>[] = [];
    for (const [index, material] of materials.entries()) {
      for (const attachment of material.attachments) {
        const bytes = Buffer.from(attachment.base64, 'base64');
        const id = crypto.randomUUID();
        const key = `objects/${id}.${attachment.ext}`;
        try {
          await writeFile(path.join(location, key), bytes);
        } catch {
          continue;
        }
        rows.push({
          id,
          disk: 'local',
          key,
          filename: attachment.filename,
          ext: attachment.ext,
          mimeType: attachment.mimeType,
          size: bytes.length,
          materialId: materialIds[index],
          createdById: ownerId,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    if (rows.length) {
      await query.insertInto('projectMaterialFiles').values(rows).execute();
    }
  },
});

export default seed;
