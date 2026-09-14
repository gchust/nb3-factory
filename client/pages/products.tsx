import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useEffect, useState, type ReactElement } from 'react';

import {
  Banner,
  EmptyState,
  Field,
  Money,
  PageHeader,
  Panel,
} from '@/components/retail-ui';
import { cellClass, rowClass, tableClass, theadClass } from '@/lib/retail-view';
import { SelectField } from '@/components/select-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  readRetailError,
  retailErrorKey,
  useRetailApi,
  type ProductCategory,
  type ProductStatus,
  type RetailProduct,
} from '@/lib/retail-api';

interface ProductForm {
  id?: number;
  name: string;
  barcode: string;
  category: ProductCategory;
  price: string;
  cost: string;
  stock: string;
  status: ProductStatus;
  images: string;
}

const EMPTY_FORM: ProductForm = {
  name: '',
  barcode: '',
  category: 'food',
  price: '0',
  cost: '0',
  stock: '0',
  status: 'on_sale',
  images: '',
};

export default function ProductsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useRetailApi();
  const [products, setProducts] = useState<readonly RetailProduct[]>([]);
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<ProductForm | undefined>(undefined);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const errorText = useCallback(
    (caught: unknown): string => {
      const info = readRetailError(caught);
      return t(retailErrorKey(info.code), {
        defaultValue: info.message ?? 'Request failed.',
      });
    },
    [t],
  );

  const load = useCallback(async (): Promise<void> => {
    try {
      setProducts(
        await api.listManagedProducts({
          ...(category === 'all' ? {} : { category }),
          ...(status === 'all' ? {} : { status }),
          ...(query ? { search: query } : {}),
        }),
      );
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
    }
  }, [api, category, status, query, errorText]);

  useEffect(() => {
    let active = true;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      await load();
    })();
    return () => {
      active = false;
    };
  }, [load]);

  const openCreate = (): void => {
    setError(undefined);
    setSaved(undefined);
    setForm(EMPTY_FORM);
  };

  const openEdit = (product: RetailProduct): void => {
    setError(undefined);
    setSaved(undefined);
    setForm({
      id: product.id,
      name: product.name,
      barcode: product.barcode,
      category: product.category as ProductCategory,
      price: String(product.price),
      cost: String(product.cost ?? 0),
      stock: String(product.stock),
      status: product.status as ProductStatus,
      images: product.images.join('\n'),
    });
  };

  const submit = async (): Promise<void> => {
    if (!form) return;
    setSaving(true);
    setError(undefined);
    setSaved(undefined);
    const input = {
      name: form.name.trim(),
      barcode: form.barcode.trim(),
      category: form.category,
      price: Number(form.price),
      cost: Number(form.cost),
      stock: Number(form.stock),
      status: form.status,
      images: form.images
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    };
    try {
      if (form.id) {
        await api.updateProduct(form.id, input);
      } else {
        await api.createProduct(input);
      }
      setSaved(t('retail.products.saved', { defaultValue: 'Product saved.' }));
      setForm(undefined);
      await load();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setSaving(false);
    }
  };

  const categoryOptions = [
    { value: 'all', label: t('retail.common.all', { defaultValue: 'All' }) },
    {
      value: 'food',
      label: t('retail.categories.food', { defaultValue: 'Food' }),
    },
    {
      value: 'household',
      label: t('retail.categories.household', { defaultValue: 'Household' }),
    },
    {
      value: 'clothing',
      label: t('retail.categories.clothing', { defaultValue: 'Clothing' }),
    },
  ];
  const statusOptions = [
    { value: 'all', label: t('retail.common.all', { defaultValue: 'All' }) },
    {
      value: 'on_sale',
      label: t('retail.productStatus.on_sale', { defaultValue: 'On sale' }),
    },
    {
      value: 'off_shelf',
      label: t('retail.productStatus.off_shelf', { defaultValue: 'Off shelf' }),
    },
  ];
  const formCategoryOptions = categoryOptions.slice(1);
  const formStatusOptions = statusOptions.slice(1);

  return (
    <section className='mx-auto w-full max-w-6xl space-y-6 px-6 py-8'>
      <PageHeader
        actions={
          <Button onClick={openCreate} type='button'>
            {t('retail.products.newProduct', { defaultValue: 'New product' })}
          </Button>
        }
        description={t('retail.products.description', {
          defaultValue: 'Maintain the product catalogue.',
        })}
        title={t('retail.products.title', { defaultValue: 'Products' })}
      />

      {error ? <Banner tone='error'>{error}</Banner> : null}
      {saved ? <Banner tone='success'>{saved}</Banner> : null}

      {form ? (
        <Panel
          title={
            form.id
              ? t('retail.products.editProduct', {
                  defaultValue: 'Edit product',
                })
              : t('retail.products.newProduct', { defaultValue: 'New product' })
          }
        >
          <form
            className='grid gap-4 sm:grid-cols-2'
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <Field
              htmlFor='product-name'
              label={t('retail.common.name', { defaultValue: 'Name' })}
            >
              <Input
                id='product-name'
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                required
                value={form.name}
              />
            </Field>
            <Field
              htmlFor='product-barcode'
              label={t('retail.common.barcode', { defaultValue: 'Barcode' })}
            >
              <Input
                id='product-barcode'
                onChange={(event) =>
                  setForm({ ...form, barcode: event.target.value })
                }
                required
                value={form.barcode}
              />
            </Field>
            <Field
              htmlFor='product-category'
              label={t('retail.common.category', { defaultValue: 'Category' })}
            >
              <SelectField
                id='product-category'
                onValueChange={(value) =>
                  setForm({ ...form, category: value as ProductCategory })
                }
                options={formCategoryOptions}
                value={form.category}
              />
            </Field>
            <Field
              htmlFor='product-status'
              label={t('retail.common.status', { defaultValue: 'Status' })}
            >
              <SelectField
                id='product-status'
                onValueChange={(value) =>
                  setForm({ ...form, status: value as ProductStatus })
                }
                options={formStatusOptions}
                value={form.status}
              />
            </Field>
            <Field
              htmlFor='product-price'
              label={t('retail.common.price', { defaultValue: 'Price' })}
            >
              <Input
                id='product-price'
                min={0}
                onChange={(event) =>
                  setForm({ ...form, price: event.target.value })
                }
                required
                step='0.01'
                type='number'
                value={form.price}
              />
            </Field>
            <Field
              htmlFor='product-cost'
              label={t('retail.common.cost', { defaultValue: 'Cost' })}
            >
              <Input
                id='product-cost'
                min={0}
                onChange={(event) =>
                  setForm({ ...form, cost: event.target.value })
                }
                required
                step='0.01'
                type='number'
                value={form.cost}
              />
            </Field>
            <Field
              htmlFor='product-stock'
              label={t('retail.common.stock', { defaultValue: 'Stock' })}
            >
              <Input
                id='product-stock'
                min={0}
                onChange={(event) =>
                  setForm({ ...form, stock: event.target.value })
                }
                required
                type='number'
                value={form.stock}
              />
            </Field>
            <Field
              htmlFor='product-images'
              label={t('retail.products.images', {
                defaultValue: 'Image URLs (one per line)',
              })}
            >
              <textarea
                className='min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'
                id='product-images'
                onChange={(event) =>
                  setForm({ ...form, images: event.target.value })
                }
                value={form.images}
              />
            </Field>
            <div className='flex items-end gap-2 sm:col-span-2'>
              <Button disabled={saving} type='submit'>
                {saving
                  ? t('retail.common.saving', { defaultValue: 'Saving…' })
                  : t('retail.common.save', { defaultValue: 'Save' })}
              </Button>
              <Button
                onClick={() => setForm(undefined)}
                type='button'
                variant='ghost'
              >
                {t('retail.common.cancel', { defaultValue: 'Cancel' })}
              </Button>
            </div>
          </form>
        </Panel>
      ) : null}

      <Panel title={t('retail.products.filters', { defaultValue: 'Filters' })}>
        <div className='flex flex-wrap items-end gap-3'>
          <div className='w-40'>
            <SelectField
              onValueChange={(value) => {
                setLoading(true);
                setCategory(value);
              }}
              options={categoryOptions}
              value={category}
            />
          </div>
          <div className='w-40'>
            <SelectField
              onValueChange={(value) => {
                setLoading(true);
                setStatus(value);
              }}
              options={statusOptions}
              value={status}
            />
          </div>
          <form
            className='flex gap-2'
            onSubmit={(event) => {
              event.preventDefault();
              setLoading(true);
              setQuery(search.trim());
            }}
          >
            <Input
              aria-label={t('retail.common.search', { defaultValue: 'Search' })}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('retail.products.searchPlaceholder', {
                defaultValue: 'Name or barcode',
              })}
              value={search}
            />
            <Button type='submit' variant='secondary'>
              {t('retail.common.search', { defaultValue: 'Search' })}
            </Button>
          </form>
        </div>
      </Panel>

      <Panel>
        {loading ? (
          <EmptyState
            message={t('retail.common.loading', { defaultValue: 'Loading…' })}
          />
        ) : products.length === 0 ? (
          <EmptyState
            message={t('retail.products.empty', {
              defaultValue: 'No products.',
            })}
          />
        ) : (
          <div className='overflow-x-auto'>
            <table className={tableClass}>
              <thead className={theadClass}>
                <tr>
                  <th className={cellClass}>
                    {t('retail.common.name', { defaultValue: 'Name' })}
                  </th>
                  <th className={cellClass}>
                    {t('retail.common.barcode', { defaultValue: 'Barcode' })}
                  </th>
                  <th className={cellClass}>
                    {t('retail.common.category', { defaultValue: 'Category' })}
                  </th>
                  <th className={cellClass}>
                    {t('retail.common.price', { defaultValue: 'Price' })}
                  </th>
                  <th className={cellClass}>
                    {t('retail.common.cost', { defaultValue: 'Cost' })}
                  </th>
                  <th className={cellClass}>
                    {t('retail.common.stock', { defaultValue: 'Stock' })}
                  </th>
                  <th className={cellClass}>
                    {t('retail.common.status', { defaultValue: 'Status' })}
                  </th>
                  <th className={cellClass}>
                    {t('retail.common.actions', { defaultValue: 'Actions' })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr className={rowClass} key={product.id}>
                    <td className={cellClass}>{product.name}</td>
                    <td className={cellClass}>{product.barcode}</td>
                    <td className={cellClass}>
                      {t(`retail.categories.${product.category}`, {
                        defaultValue: product.category,
                      })}
                    </td>
                    <td className={cellClass}>
                      <Money value={product.price} />
                    </td>
                    <td className={cellClass}>
                      <Money value={product.cost ?? 0} />
                    </td>
                    <td className={cellClass}>{product.stock}</td>
                    <td className={cellClass}>
                      {t(`retail.productStatus.${product.status}`, {
                        defaultValue: product.status,
                      })}
                    </td>
                    <td className={cellClass}>
                      <Button
                        onClick={() => openEdit(product)}
                        size='sm'
                        type='button'
                        variant='secondary'
                      >
                        {t('retail.common.edit', { defaultValue: 'Edit' })}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </section>
  );
}
