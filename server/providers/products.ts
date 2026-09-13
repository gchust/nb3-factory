import type { DatabaseManager, QueryAdapter } from '@nocobase/db';
import type {
  FileRecord,
  ServerFileRepository,
} from '@nocobase/app-plugin-file/server';
import type { driveManagerToken } from '@nocobase/app-server/drive';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

type AppDriveManager =
  typeof driveManagerToken extends ServiceToken<infer T> ? T : never;

/** Editable business fields of a product, as the UI submits them. */
export interface ProductSaveInput {
  readonly name: string;
  readonly description?: string | null;
  /** Ids of already-uploaded `product_image_files` records, in display order. */
  readonly imageFileIds?: readonly string[];
}

export interface ProductRow {
  readonly id: number;
  readonly name: string;
  readonly description: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProductWithImages extends ProductRow {
  /** Upload order preserved; the first entry is the list thumbnail. */
  readonly images: readonly FileRecord[];
}

export interface ProductsServiceDependencies {
  /** Query adapter for the default 'main' connection. */
  readonly query: QueryAdapter;
  readonly transaction: DatabaseManager['transaction'];
  /** Repository over `product_image_files` for reads, URLs and cleanup. */
  readonly files: ServerFileRepository;
  /** Drive manager used to remove physical objects. */
  readonly drive: AppDriveManager;
  /** Builds the app-hosted content URL for an image record. */
  readonly urlFor: (record: FileRecord) => string;
}

/** Business error surfaced to the API with a stable code and HTTP status. */
export class ProductError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'ProductError';
    this.code = code;
    this.status = status;
  }
}

export const productsServiceToken: ServiceToken<ProductsService> =
  createServiceToken<ProductsService>('app/products/service');

export class ProductsService {
  constructor(private readonly deps: ProductsServiceDependencies) {}

  async list(): Promise<ProductWithImages[]> {
    const rows = await this.deps.query
      .selectFrom('products')
      .selectAll()
      .orderBy('id', 'asc')
      .execute();
    return this.attachImages(rows as unknown as ProductRow[]);
  }

  async get(id: number): Promise<ProductWithImages> {
    const row = await requireProductRow(this.deps.query, id);
    const [product] = await this.attachImages([row]);
    return product;
  }

  async create(input: ProductSaveInput): Promise<ProductWithImages> {
    const value = normalizeProductValue(input);
    const imageFileIds = uniqueIds(input.imageFileIds);
    let productId: number | undefined;
    await this.deps.transaction(async (connection) => {
      const query = connection.query;
      await assertFilesAvailable(query, imageFileIds, undefined);
      const now = toDbTimestamp(new Date());
      const inserted = await query
        .insertInto('products')
        .values({
          name: value.name,
          description: value.description,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      productId = Number(inserted.insertId ?? inserted.rows?.[0]?.id);
      await insertImageLinks(query, productId, imageFileIds);
    });
    return this.get(productId as number);
  }

  async update(
    id: number,
    input: ProductSaveInput,
  ): Promise<ProductWithImages> {
    await this.get(id);
    const value = normalizeProductValue(input);
    const requested = uniqueIds(input.imageFileIds);
    await this.deps.transaction(async (connection) => {
      const query = connection.query;
      await assertFilesAvailable(query, requested, id);
      await query
        .updateTable('products')
        .set({
          name: value.name,
          description: value.description,
          updatedAt: toDbTimestamp(new Date()),
        })
        .where('id', '=', id)
        .execute();

      const current = await imageFileIds(query, id);
      const requestedSet = new Set(requested);
      for (const fileId of requested) {
        if (current.includes(fileId)) continue;
        await query
          .insertInto('productImages')
          .values({
            productId: id,
            fileId,
            sort: requested.indexOf(fileId),
            createdAt: toDbTimestamp(new Date()),
          })
          .execute();
      }
      for (const fileId of current) {
        if (requestedSet.has(fileId)) continue;
        await query
          .deleteFrom('productImages')
          .where('productId', '=', id)
          .where('fileId', '=', fileId)
          .execute();
        await this.removeFileRecord(query, fileId);
      }
      // Keep the first-image ordering stable after a reorder or removal.
      let sort = 0;
      for (const fileId of requested) {
        await query
          .updateTable('productImages')
          .set({ sort })
          .where('productId', '=', id)
          .where('fileId', '=', fileId)
          .execute();
        sort += 1;
      }
    });
    return this.get(id);
  }

  // ── internal helpers ───────────────────────────────────────────────────────

  private async attachImages(
    rows: readonly ProductRow[],
  ): Promise<ProductWithImages[]> {
    if (!rows.length) return [];
    const productIds = new Set(rows.map((row) => row.id));
    const links = await this.deps.query
      .selectFrom('productImages')
      .select(['productId', 'fileId', 'sort'])
      .orderBy('sort', 'asc')
      .orderBy('id', 'asc')
      .execute();
    const fileIdsByProduct = new Map<number, string[]>();
    for (const link of links) {
      const productId = Number(link.productId);
      if (!productIds.has(productId)) continue;
      const ids = fileIdsByProduct.get(productId) ?? [];
      ids.push(String(link.fileId));
      fileIdsByProduct.set(productId, ids);
    }
    const records = await this.loadFileRecords([
      ...new Set([...fileIdsByProduct.values()].flat()),
    ]);
    return rows.map((row) => ({
      ...row,
      images: (fileIdsByProduct.get(row.id) ?? [])
        .map((fileId) => records.get(fileId))
        .filter((record): record is FileRecord => record !== undefined)
        .map((record) => ({
          ...record,
          contentUrl: this.deps.urlFor(record),
        })),
    }));
  }

  private async loadFileRecords(
    ids: readonly string[],
    query: QueryAdapter = this.deps.query,
  ): Promise<Map<string, FileRecord>> {
    const records = new Map<string, FileRecord>();
    if (!ids.length) return records;
    const rows = await query
      .selectFrom('productImageFiles')
      .selectAll()
      .where('id', 'in', ids)
      .execute();
    for (const row of rows) {
      records.set(row.id as string, row as unknown as FileRecord);
    }
    return records;
  }

  /** Deletes a file record and its physical object, tolerating drive errors. */
  private async removeFileRecord(
    query: QueryAdapter,
    fileId: string,
  ): Promise<void> {
    const record = (await this.loadFileRecords([fileId], query)).get(fileId);
    if (!record) return;
    await query
      .deleteFrom('productImageFiles')
      .where('id', '=', fileId)
      .execute();
    try {
      await this.deps.drive.use(record.disk).delete(record.key);
    } catch (cause) {
      console.error(
        `[products] Failed to remove stored object ${record.key}:`,
        cause,
      );
    }
  }
}

function normalizeProductValue(input: ProductSaveInput): {
  name: string;
  description: string | null;
} {
  const name = String(input.name ?? '').trim();
  if (!name) {
    throw new ProductError('PRODUCT_NAME_REQUIRED', '产品名称不能为空。');
  }
  const description =
    input.description == null ? null : String(input.description).trim() || null;
  return { name, description };
}

async function requireProductRow(
  query: QueryAdapter,
  id: number,
): Promise<ProductRow> {
  const row = await query
    .selectFrom('products')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
  if (!row) throw new ProductError('PRODUCT_NOT_FOUND', '产品不存在。', 404);
  return row as unknown as ProductRow;
}

async function assertFilesAvailable(
  query: QueryAdapter,
  fileIds: readonly string[],
  exceptProductId: number | undefined,
): Promise<void> {
  if (!fileIds.length) return;
  const rows = await query
    .selectFrom('productImageFiles')
    .select(['id'])
    .where('id', 'in', fileIds)
    .execute();
  const existing = new Set(rows.map((row) => String(row.id)));
  const missing = fileIds.filter((fileId) => !existing.has(fileId));
  if (missing.length) {
    throw new ProductError(
      'PRODUCT_IMAGE_NOT_FOUND',
      `所选图片不存在或已失效：${missing.join('、')}。`,
    );
  }
  const taken = await query
    .selectFrom('productImages')
    .select(['productId', 'fileId'])
    .where('fileId', 'in', fileIds)
    .execute();
  const conflict = taken.find(
    (link) => Number(link.productId) !== exceptProductId,
  );
  if (conflict) {
    throw new ProductError(
      'PRODUCT_IMAGE_IN_USE',
      '部分图片已属于其他产品，一张图片只能归属一个产品。',
      409,
    );
  }
}

async function insertImageLinks(
  query: QueryAdapter,
  productId: number,
  fileIds: readonly string[],
): Promise<void> {
  let sort = 0;
  for (const fileId of fileIds) {
    await query
      .insertInto('productImages')
      .values({
        productId,
        fileId,
        sort,
        createdAt: toDbTimestamp(new Date()),
      })
      .execute();
    sort += 1;
  }
}

async function imageFileIds(
  query: QueryAdapter,
  productId: number,
): Promise<readonly string[]> {
  const links = await query
    .selectFrom('productImages')
    .select(['fileId'])
    .where('productId', '=', productId)
    .orderBy('sort', 'asc')
    .orderBy('id', 'asc')
    .execute();
  return links.map((link) => String(link.fileId));
}

function uniqueIds(values: readonly string[] | undefined): readonly string[] {
  return [...new Set(values ?? [])];
}

function toDbTimestamp(date: Date): string {
  return date.toISOString().slice(0, -1);
}
