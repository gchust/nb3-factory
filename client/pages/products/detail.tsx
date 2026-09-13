import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeft, Pencil } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router';

import { FileList } from '@/extensions/nocobase-file-component-ui/components/file-list';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { productFileLabels } from '@/components/products/file-labels';
import {
  productErrorMessage,
  useProductsApi,
  type ProductRecord,
} from '@/lib/products';

export default function ProductDetailPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const productId = Number(params.id);
  const { api } = useProductsApi();

  const [product, setProduct] = useState<ProductRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await api.get(productId);
        if (!cancelled) {
          setProduct(loaded);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) setError(productErrorMessage(loadError, t));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, productId, t]);

  return (
    <section className='mx-auto w-full max-w-4xl px-6 py-8'>
      <Button
        variant='ghost'
        size='sm'
        className='mb-4 -ml-2'
        onClick={() => {
          void navigate('/products');
        }}
      >
        <ArrowLeft aria-hidden='true' />
        {t('products.backToList')}
      </Button>

      {error && product === null ? (
        <div
          role='alert'
          className='rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
        >
          {error}
        </div>
      ) : null}

      {product === null && !error ? (
        <div className='flex items-center justify-center py-16 text-muted-foreground'>
          <Spinner className='size-5' />
        </div>
      ) : product ? (
        <>
          <div className='mb-6 flex flex-wrap items-start justify-between gap-3'>
            <div className='min-w-0'>
              <h1 className='font-heading text-2xl font-semibold tracking-tight'>
                {product.name}
              </h1>
              {product.description ? (
                <p className='mt-2 max-w-2xl text-sm text-muted-foreground'>
                  {product.description}
                </p>
              ) : null}
            </div>
            <Button
              variant='outline'
              onClick={() => {
                void navigate(`/products/${product.id}/edit`);
              }}
            >
              <Pencil aria-hidden='true' />
              {t('products.edit')}
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

          <h2 className='mb-3 text-sm font-medium text-muted-foreground'>
            {t('products.fields.images')}
          </h2>
          <FileList
            files={product.images}
            labels={productFileLabels(t)}
            onError={(fileError) => setError(fileError.message)}
            emptyState={
              <p className='text-sm text-muted-foreground'>
                {t('products.files.empty')}
              </p>
            }
          />
        </>
      ) : null}
    </section>
  );
}
