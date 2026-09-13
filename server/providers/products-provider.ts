import type { Application } from '@nocobase/app-server/application';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { serverFileRepositoryManagerToken } from '@nocobase/app-plugin-file/server';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';

import { ProductsService, productsServiceToken } from './products.js';

const IMAGES_ACCESS_PATH = '/uploads/product-images';

/**
 * Wires the product gallery service: the default database connection, the
 * drive manager (for physical cleanup) and the File plugin repository over
 * `product_image_files` that powers uploads and content URLs.
 */
export default class ProductsProvider extends ServiceProvider<Application> {
  public readonly name = 'app/products';

  public override boot(): Promise<void> {
    if (this.app.container.has(productsServiceToken)) return Promise.resolve();
    const database = this.app.container.resolve(databaseManagerToken);
    const drive = this.app.container.resolve(driveManagerToken);
    const manager = this.app.container.resolve(
      serverFileRepositoryManagerToken,
    );
    const base = (this.app.publicBasePath ?? '').replace(/\/+$/, '');
    const files = manager.repository('product_image_files', {
      disk: 'local',
      accessPath: IMAGES_ACCESS_PATH,
    });
    this.app.container.instance(
      productsServiceToken,
      new ProductsService({
        query: database.query(),
        transaction: (fn) => database.transaction(fn),
        files,
        drive,
        urlFor: (record) => `${base}${files.getUrl(record)}`,
      }),
    );
    return Promise.resolve();
  }
}
