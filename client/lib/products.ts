import { useMemo } from 'react';
import {
  apiClientToken,
  ApiClientError,
  useClientApplication,
  type ApiClient,
} from '@nocobase/app-client';
import {
  clientFileRepositoryManagerToken,
  type ClientFileRepository,
  type FileRecord,
} from '@nocobase/app-plugin-file/client';

/** A product as the server returns it, with its images decorated. */
export interface ProductRecord {
  readonly id: number;
  readonly name: string;
  readonly description: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly images: readonly FileRecord[];
}

/** What the form submits when saving a product. */
export interface ProductSaveInput {
  readonly name: string;
  readonly description?: string | null;
  readonly imageFileIds?: readonly string[];
}

/** Client for the business endpoints of the product gallery. */
export class ProductsApi {
  constructor(private readonly api: ApiClient) {}

  async list(): Promise<readonly ProductRecord[]> {
    const payload = await this.api.request({
      path: '/products:list',
      method: 'POST',
    });
    return (payload as { data: ProductRecord[] }).data;
  }

  async get(id: number): Promise<ProductRecord> {
    const payload = await this.api.request({
      path: '/products:get',
      method: 'POST',
      json: { filter: { id } },
    });
    return (payload as { data: ProductRecord }).data;
  }

  async create(values: ProductSaveInput): Promise<ProductRecord> {
    const payload = await this.api.request({
      path: '/products:create',
      method: 'POST',
      json: { values },
    });
    return (payload as { data: ProductRecord }).data;
  }

  async update(id: number, values: ProductSaveInput): Promise<ProductRecord> {
    const payload = await this.api.request({
      path: '/products:update',
      method: 'POST',
      json: { filter: { id }, values },
    });
    return (payload as { data: ProductRecord }).data;
  }
}

/** Everything the pages need to talk to the product gallery. */
export interface ProductsClient {
  readonly api: ProductsApi;
  /** Repository powering the multi-image upload control. */
  readonly imageRepository: ClientFileRepository;
}

/** The shared product client of the running application. */
export function useProductsApi(): ProductsClient {
  const app = useClientApplication();
  return useMemo(() => {
    const apiClient = app.container.resolve(apiClientToken);
    const manager = app.container.resolve(clientFileRepositoryManagerToken);
    return {
      api: new ProductsApi(apiClient),
      imageRepository: manager.repository('productImages'),
    };
  }, [app]);
}

/**
 * Translates a business-code error to a user-facing message.
 *
 * Known codes resolve through the locale files; anything else falls back to the
 * server message (deliberately readable Chinese) or a generic string.
 */
export function productErrorMessage(
  error: unknown,
  t: (key: string) => string,
  fallbackKey = 'products.errors.INTERNAL_ERROR',
): string {
  if (error instanceof ApiClientError && error.code) {
    const key = `products.errors.${error.code}`;
    const translated = t(key);
    if (translated && translated !== key) return translated;
  }
  if (error instanceof Error && error.message) return error.message;
  return t(fallbackKey);
}
