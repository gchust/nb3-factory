import { useTranslation } from '@nocobase/i18n/client';
import { Minus, Plus, Trash2 } from 'lucide-react';
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
import { SelectField } from '@/components/select-field';
import { asText } from '@/lib/retail-view';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  readRetailError,
  retailErrorKey,
  useRetailApi,
  type CartLine,
  type PaymentMethod,
  type RetailProduct,
} from '@/lib/retail-api';

interface CartEntry {
  readonly productId: number;
  readonly name: string;
  readonly price: number;
  readonly stock: number;
  quantity: number;
}

interface CheckoutResult {
  readonly orderNumber: string;
  readonly originalAmount: number;
  readonly discountAmount: number;
  readonly payableAmount: number;
}

const PAYMENT_METHODS: readonly PaymentMethod[] = ['cash', 'wechat', 'alipay'];

export default function PosPage(): ReactElement {
  const { t } = useTranslation();
  const api = useRetailApi();
  const [products, setProducts] = useState<readonly RetailProduct[]>([]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [cart, setCart] = useState<readonly CartEntry[]>([]);
  const [discountPercent, setDiscountPercent] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<CheckoutResult>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadProducts = useCallback(async (): Promise<void> => {
    try {
      const data = await api.listProducts({
        onSaleOnly: true,
        ...(category === 'all' ? {} : { category }),
        ...(query ? { search: query } : {}),
      });
      setProducts(data);
    } catch {
      setError(t('retail.errors.generic', { defaultValue: 'Request failed.' }));
    } finally {
      setLoading(false);
    }
  }, [api, category, query, t]);

  useEffect(() => {
    let active = true;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      await loadProducts();
    })();
    return () => {
      active = false;
    };
  }, [loadProducts]);

  const totals = useMemo(() => {
    const originalCents = cart.reduce(
      (sum, entry) => sum + Math.round(entry.price * 100) * entry.quantity,
      0,
    );
    const percent = Number(discountPercent);
    const safePercent = Number.isFinite(percent)
      ? Math.min(Math.max(percent, 0), 100)
      : 0;
    const discountCents = Math.round((originalCents * safePercent) / 100);
    return {
      original: originalCents / 100,
      discount: discountCents / 100,
      payable: (originalCents - discountCents) / 100,
      percent: safePercent,
    };
  }, [cart, discountPercent]);

  const addToCart = (product: RetailProduct): void => {
    setError(undefined);
    setResult(undefined);
    setCart((current) => {
      const existing = current.find((entry) => entry.productId === product.id);
      if (existing) {
        return current.map((entry) =>
          entry.productId === product.id
            ? { ...entry, quantity: entry.quantity + 1 }
            : entry,
        );
      }
      return [
        ...current,
        {
          productId: product.id,
          name: product.name,
          price: product.price,
          stock: product.stock,
          quantity: 1,
        },
      ];
    });
  };

  const setQuantity = (productId: number, quantity: number): void => {
    setCart((current) =>
      current.map((entry) =>
        entry.productId === productId
          ? { ...entry, quantity: Math.max(1, Math.trunc(quantity) || 1) }
          : entry,
      ),
    );
  };

  const removeLine = (productId: number): void => {
    setCart((current) =>
      current.filter((entry) => entry.productId !== productId),
    );
  };

  const errorText = (caught: unknown): string => {
    const info = readRetailError(caught);
    const base = t(retailErrorKey(info.code), {
      defaultValue: info.message ?? 'Request failed.',
    });
    if (info.code === 'INSUFFICIENT_STOCK' && info.details) {
      return `${base} (${asText(info.details.productName)}: ${asText(
        info.details.available,
      )})`;
    }
    return base;
  };

  const checkout = async (): Promise<void> => {
    setError(undefined);
    setResult(undefined);
    if (cart.length === 0) {
      setError(
        t('retail.pos.emptyCart', { defaultValue: 'The cart is empty.' }),
      );
      return;
    }
    setSubmitting(true);
    try {
      const created = await api.createOrder({
        paymentMethod,
        discountPercent: totals.percent,
        items: cart.map<CartLine>((entry) => ({
          productId: entry.productId,
          quantity: entry.quantity,
        })),
      });
      setResult(created);
      setCart([]);
      setDiscountPercent('0');
      await loadProducts();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setSubmitting(false);
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
  const paymentOptions = PAYMENT_METHODS.map((method) => ({
    value: method,
    label: t(`retail.payment.${method}`, { defaultValue: method }),
  }));

  return (
    <section className='mx-auto w-full max-w-6xl space-y-6 px-6 py-8'>
      <PageHeader
        description={t('retail.pos.description', {
          defaultValue: 'Pick products, set the quantity and check out.',
        })}
        title={t('retail.pos.title', { defaultValue: 'Checkout' })}
      />

      {error ? <Banner tone='error'>{error}</Banner> : null}
      {result ? (
        <Banner tone='success'>
          <div className='space-y-1'>
            <div className='font-medium'>
              {t('retail.pos.checkoutDone', { defaultValue: 'Sale completed' })}
            </div>
            <div className='text-xs'>
              {t('retail.pos.orderNumber', { defaultValue: 'Order number' })}:{' '}
              {result.orderNumber} ·{' '}
              {t('retail.pos.original', { defaultValue: 'Original' })}:{' '}
              <Money value={result.originalAmount} /> ·{' '}
              {t('retail.pos.discount', { defaultValue: 'Discount' })}:{' '}
              <Money value={result.discountAmount} /> ·{' '}
              {t('retail.pos.payable', { defaultValue: 'Payable' })}:{' '}
              <Money value={result.payableAmount} />
            </div>
          </div>
        </Banner>
      ) : null}

      <div className='grid gap-6 lg:grid-cols-[1.4fr_1fr]'>
        <Panel
          title={t('retail.pos.catalogue', { defaultValue: 'Products' })}
          actions={
            <form
              className='flex gap-2'
              onSubmit={(event) => {
                event.preventDefault();
                setLoading(true);
                setQuery(search.trim());
              }}
            >
              <Input
                aria-label={t('retail.common.search', {
                  defaultValue: 'Search',
                })}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('retail.pos.searchPlaceholder', {
                  defaultValue: 'Name or barcode',
                })}
                value={search}
              />
              <Button type='submit' variant='secondary'>
                {t('retail.common.search', { defaultValue: 'Search' })}
              </Button>
            </form>
          }
        >
          <div className='mb-3 max-w-48'>
            <SelectField
              onValueChange={(value) => {
                setLoading(true);
                setCategory(value);
              }}
              options={categoryOptions}
              value={category}
            />
          </div>
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
            <ul className='grid gap-2 sm:grid-cols-2'>
              {products.map((product) => (
                <li key={product.id}>
                  <button
                    className='w-full rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted disabled:opacity-50'
                    disabled={product.stock <= 0}
                    onClick={() => addToCart(product)}
                    type='button'
                  >
                    <div className='flex items-center justify-between gap-2'>
                      <span className='truncate text-sm font-medium'>
                        {product.name}
                      </span>
                      <Money value={product.price} />
                    </div>
                    <div className='mt-1 text-xs text-muted-foreground'>
                      {t('retail.common.stock', { defaultValue: 'Stock' })}:{' '}
                      {product.stock}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={t('retail.pos.cart', { defaultValue: 'Cart' })}>
          {cart.length === 0 ? (
            <EmptyState
              message={t('retail.pos.emptyCart', {
                defaultValue: 'The cart is empty.',
              })}
            />
          ) : (
            <ul className='space-y-3'>
              {cart.map((entry) => (
                <li className='flex items-center gap-2' key={entry.productId}>
                  <div className='min-w-0 flex-1'>
                    <div className='truncate text-sm font-medium'>
                      {entry.name}
                    </div>
                    <div className='text-xs text-muted-foreground'>
                      <Money value={entry.price} /> × {entry.quantity} ={' '}
                      <Money value={entry.price * entry.quantity} />
                    </div>
                  </div>
                  <Button
                    aria-label={t('retail.common.decrease', {
                      defaultValue: 'Decrease',
                    })}
                    onClick={() =>
                      setQuantity(entry.productId, entry.quantity - 1)
                    }
                    size='icon'
                    variant='ghost'
                  >
                    <Minus />
                  </Button>
                  <Input
                    aria-label={t('retail.common.quantity', {
                      defaultValue: 'Quantity',
                    })}
                    className='w-16'
                    min={1}
                    onChange={(event) =>
                      setQuantity(entry.productId, Number(event.target.value))
                    }
                    type='number'
                    value={entry.quantity}
                  />
                  <Button
                    aria-label={t('retail.common.increase', {
                      defaultValue: 'Increase',
                    })}
                    onClick={() =>
                      setQuantity(entry.productId, entry.quantity + 1)
                    }
                    size='icon'
                    variant='ghost'
                  >
                    <Plus />
                  </Button>
                  <Button
                    aria-label={t('retail.common.remove', {
                      defaultValue: 'Remove',
                    })}
                    onClick={() => removeLine(entry.productId)}
                    size='icon'
                    variant='ghost'
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className='mt-4 space-y-3 border-t border-border pt-4'>
            <div className='grid gap-3 sm:grid-cols-2'>
              <Field
                htmlFor='pos-discount'
                label={t('retail.pos.discountPercent', {
                  defaultValue: 'Discount (%)',
                })}
              >
                <Input
                  id='pos-discount'
                  max={100}
                  min={0}
                  onChange={(event) => setDiscountPercent(event.target.value)}
                  type='number'
                  value={discountPercent}
                />
              </Field>
              <Field
                htmlFor='pos-payment'
                label={t('retail.common.paymentMethod', {
                  defaultValue: 'Payment method',
                })}
              >
                <SelectField
                  id='pos-payment'
                  onValueChange={(value) =>
                    setPaymentMethod(value as PaymentMethod)
                  }
                  options={paymentOptions}
                  value={paymentMethod}
                />
              </Field>
            </div>

            <dl className='space-y-1 text-sm'>
              <div className='flex justify-between'>
                <dt className='text-muted-foreground'>
                  {t('retail.pos.original', { defaultValue: 'Original' })}
                </dt>
                <dd>
                  <Money value={totals.original} />
                </dd>
              </div>
              <div className='flex justify-between'>
                <dt className='text-muted-foreground'>
                  {t('retail.pos.discount', { defaultValue: 'Discount' })}
                </dt>
                <dd>
                  -<Money value={totals.discount} />
                </dd>
              </div>
              <div className='flex justify-between text-base font-semibold'>
                <dt>{t('retail.pos.payable', { defaultValue: 'Payable' })}</dt>
                <dd>
                  <Money value={totals.payable} />
                </dd>
              </div>
            </dl>

            <Button
              className='w-full'
              disabled={submitting || cart.length === 0}
              onClick={() => void checkout()}
              type='button'
            >
              {submitting
                ? t('retail.common.saving', { defaultValue: 'Saving…' })
                : t('retail.pos.checkout', { defaultValue: 'Check out' })}
            </Button>
          </div>
        </Panel>
      </div>
    </section>
  );
}
