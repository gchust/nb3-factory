import { defineSeed, type SeedDefinition } from '@nocobase/db';

/**
 * Sample catalogue so a fresh installation is usable immediately: a few products across the
 * three categories with stock and an in-store barcode.
 *
 * The seed is idempotent by barcode: running it twice never duplicates a product, and an
 * existing row that a user has since edited is never overwritten.
 */
interface SampleProduct {
  readonly name: string;
  readonly barcode: string;
  readonly category: 'food' | 'household' | 'clothing';
  readonly price: number;
  readonly cost: number;
  readonly stock: number;
  readonly images?: readonly string[];
}

const products: readonly SampleProduct[] = [
  {
    name: '可口可乐 330ml',
    barcode: '6901001000011',
    category: 'food',
    price: 3.5,
    cost: 2,
    stock: 120,
  },
  {
    name: '农夫山泉 550ml',
    barcode: '6901001000028',
    category: 'food',
    price: 2,
    cost: 1,
    stock: 200,
  },
  {
    name: '奥利奥饼干',
    barcode: '6901001000035',
    category: 'food',
    price: 9.9,
    cost: 6,
    stock: 60,
  },
  {
    name: '维达抽纸',
    barcode: '6901002000010',
    category: 'household',
    price: 6.5,
    cost: 3.8,
    stock: 80,
  },
  {
    name: '海飞丝洗发水',
    barcode: '6901002000027',
    category: 'household',
    price: 29.9,
    cost: 18,
    stock: 45,
  },
  {
    name: '纯棉圆领 T 恤',
    barcode: '6901003000019',
    category: 'clothing',
    price: 59,
    cost: 30,
    stock: 40,
  },
  {
    name: '运动棉袜',
    barcode: '6901003000026',
    category: 'clothing',
    price: 9.9,
    cost: 4,
    stock: 150,
  },
];

const seed: SeedDefinition = defineSeed({
  name: '202609140002_seed_retail_products',

  async run({ query }) {
    // ISO strings keep the stored representation readable and lexicographically ordered, which is
    // what the daily report relies on when it filters by date.
    const now = new Date().toISOString();
    for (const product of products) {
      const existing = await query
        .selectFrom('retailProducts')
        .select('id')
        .where('barcode', '=', product.barcode)
        .executeTakeFirst();
      if (existing) continue;

      await query
        .insertInto('retailProducts')
        .values({
          name: product.name,
          barcode: product.barcode,
          category: product.category,
          price: product.price,
          cost: product.cost,
          stock: product.stock,
          status: 'on_sale',
          images: product.images ? JSON.stringify(product.images) : null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});

export default seed;
