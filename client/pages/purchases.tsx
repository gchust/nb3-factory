import { useTranslation } from '@nocobase/i18n/client';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';

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
  type RetailProduct,
  type RetailPurchase,
} from '@/lib/retail-api';

function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export default function PurchasesPage(): ReactElement {
  const { t } = useTranslation();
  const api = useRetailApi();
  const [products, setProducts] = useState<readonly RetailProduct[]>([]);
  const [purchases, setPurchases] = useState<readonly RetailPurchase[]>([]);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('0');
  const [supplier, setSupplier] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => today());
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
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
      const [catalogue, history] = await Promise.all([
        api.listManagedProducts(),
        api.listPurchases(),
      ]);
      setProducts(catalogue);
      setPurchases(history);
      setProductId((current) => current || String(catalogue[0]?.id ?? ''));
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
    }
  }, [api, errorText]);

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

  const productOptions = useMemo(
    () =>
      products.map((product) => ({
        value: String(product.id),
        label: `${product.name} (${t('retail.common.stock', {
          defaultValue: 'Stock',
        })}: ${product.stock})`,
      })),
    [products, t],
  );

  const submit = async (): Promise<void> => {
    setError(undefined);
    setMessage(undefined);
    setSaving(true);
    try {
      await api.createPurchase({
        productId: Number(productId),
        quantity: Number(quantity),
        unitCost: Number(unitCost),
        ...(supplier.trim() ? { supplier: supplier.trim() } : {}),
        purchaseDate,
      });
      setMessage(
        t('retail.purchases.saved', { defaultValue: 'Purchase registered.' }),
      );
      setQuantity('1');
      setUnitCost('0');
      setSupplier('');
      await load();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className='mx-auto w-full max-w-6xl space-y-6 px-6 py-8'>
      <PageHeader
        description={t('retail.purchases.description', {
          defaultValue: 'Register stock-in; the product stock increases.',
        })}
        title={t('retail.purchases.title', {
          defaultValue: 'Purchase stock-in',
        })}
      />

      {error ? <Banner tone='error'>{error}</Banner> : null}
      {message ? <Banner tone='success'>{message}</Banner> : null}

      <Panel
        title={t('retail.purchases.register', { defaultValue: 'New stock-in' })}
      >
        <form
          className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field
            htmlFor='purchase-product'
            label={t('retail.common.product', { defaultValue: 'Product' })}
          >
            <SelectField
              id='purchase-product'
              onValueChange={setProductId}
              options={productOptions}
              value={productId}
            />
          </Field>
          <Field
            htmlFor='purchase-quantity'
            label={t('retail.common.quantity', { defaultValue: 'Quantity' })}
          >
            <Input
              id='purchase-quantity'
              min={1}
              onChange={(event) => setQuantity(event.target.value)}
              required
              type='number'
              value={quantity}
            />
          </Field>
          <Field
            htmlFor='purchase-cost'
            label={t('retail.purchases.unitCost', {
              defaultValue: 'Purchase unit cost',
            })}
          >
            <Input
              id='purchase-cost'
              min={0}
              onChange={(event) => setUnitCost(event.target.value)}
              required
              step='0.01'
              type='number'
              value={unitCost}
            />
          </Field>
          <Field
            htmlFor='purchase-supplier'
            label={t('retail.common.supplier', { defaultValue: 'Supplier' })}
          >
            <Input
              id='purchase-supplier'
              onChange={(event) => setSupplier(event.target.value)}
              value={supplier}
            />
          </Field>
          <Field
            htmlFor='purchase-date'
            label={t('retail.purchases.purchaseDate', { defaultValue: 'Date' })}
          >
            <Input
              id='purchase-date'
              onChange={(event) => setPurchaseDate(event.target.value)}
              required
              type='date'
              value={purchaseDate}
            />
          </Field>
          <div className='flex items-end'>
            <Button disabled={saving || !productId} type='submit'>
              {saving
                ? t('retail.common.saving', { defaultValue: 'Saving…' })
                : t('retail.purchases.submit', {
                    defaultValue: 'Register stock-in',
                  })}
            </Button>
          </div>
        </form>
      </Panel>

      <Panel
        title={t('retail.purchases.history', {
          defaultValue: 'Recent stock-ins',
        })}
      >
        {loading ? (
          <EmptyState
            message={t('retail.common.loading', { defaultValue: 'Loading…' })}
          />
        ) : purchases.length === 0 ? (
          <EmptyState
            message={t('retail.purchases.empty', {
              defaultValue: 'No stock-ins recorded.',
            })}
          />
        ) : (
          <div className='overflow-x-auto'>
            <table className={tableClass}>
              <thead className={theadClass}>
                <tr>
                  <th className={cellClass}>
                    {t('retail.common.product', { defaultValue: 'Product' })}
                  </th>
                  <th className={cellClass}>
                    {t('retail.common.quantity', { defaultValue: 'Quantity' })}
                  </th>
                  <th className={cellClass}>
                    {t('retail.purchases.unitCost', {
                      defaultValue: 'Unit cost',
                    })}
                  </th>
                  <th className={cellClass}>
                    {t('retail.common.supplier', { defaultValue: 'Supplier' })}
                  </th>
                  <th className={cellClass}>
                    {t('retail.purchases.purchaseDate', {
                      defaultValue: 'Date',
                    })}
                  </th>
                  <th className={cellClass}>
                    {t('retail.common.actions', { defaultValue: 'Actions' })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((purchase) => (
                  <tr className={rowClass} key={purchase.id}>
                    <td className={cellClass}>{purchase.productName}</td>
                    <td className={cellClass}>{purchase.quantity}</td>
                    <td className={cellClass}>
                      <Money value={purchase.unitCost} />
                    </td>
                    <td className={cellClass}>{purchase.supplier ?? '—'}</td>
                    <td className={cellClass}>
                      {purchase.purchaseDate.slice(0, 10)}
                    </td>
                    <td className={cellClass}>
                      {purchase.createdByName ?? '—'}
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
