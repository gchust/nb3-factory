import { useTranslation } from '@nocobase/i18n/client';
import { ImageIcon, Plus } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { FileThumbnail } from '@/extensions/nocobase-file-component-ui/components/file-thumbnail';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  productErrorMessage,
  useProductsApi,
  type ProductRecord,
} from '@/lib/products';

export default function ProductsIndexPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { api } = useProductsApi();

  const [products, setProducts] = useState<readonly ProductRecord[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.list();
        if (cancelled) return;
        setProducts(data);
        setError(null);
      } catch (loadError) {
        if (!cancelled) setError(productErrorMessage(loadError, t));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, t]);

  return (
    <section className='mx-auto w-full max-w-5xl px-6 py-8'>
      <div className='mb-6 flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='font-heading text-2xl font-semibold tracking-tight'>
            {t('products.title')}
          </h1>
          <p className='mt-1 text-sm text-muted-foreground'>
            {t('products.description')}
          </p>
        </div>
        <Button
          onClick={() => {
            void navigate('/products/new');
          }}
        >
          <Plus aria-hidden='true' />
          {t('products.newProduct')}
        </Button>
      </div>

      {error ? (
        <div
          role='alert'
          className='mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
        >
          {error}
        </div>
      ) : null}

      {products === null ? (
        <div className='flex items-center justify-center py-16 text-muted-foreground'>
          <Spinner className='size-5' />
        </div>
      ) : products.length === 0 ? (
        <div className='rounded-md border border-dashed py-16 text-center text-sm text-muted-foreground'>
          {t('products.empty')}
        </div>
      ) : (
        <ul className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {products.map((product) => (
            <li key={product.id}>
              <button
                type='button'
                className='group flex w-full flex-col overflow-hidden rounded-lg border bg-background text-left transition-colors hover:border-ring/60 hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'
                onClick={() => {
                  void navigate(`/products/${product.id}`);
                }}
              >
                <div className='flex h-44 w-full items-center justify-center overflow-hidden bg-muted/30'>
                  {product.images[0] ? (
                    <FileThumbnail
                      file={product.images[0]}
                      alt={product.name}
                    />
                  ) : (
                    <span className='text-muted-foreground'>
                      <ImageIcon aria-hidden='true' />
                    </span>
                  )}
                </div>
                <div className='w-full space-y-1 p-4'>
                  <h2 className='truncate font-medium' title={product.name}>
                    {product.name}
                  </h2>
                  <p className='line-clamp-2 text-sm text-muted-foreground'>
                    {product.description ?? ''}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
