import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useState, type ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router';

import { ProductForm } from '@/components/products/product-form';
import { Spinner } from '@/components/ui/spinner';
import {
  productErrorMessage,
  useProductsApi,
  type ProductRecord,
} from '@/lib/products';

export default function EditProductPage(): ReactElement {
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
    <section className='mx-auto w-full max-w-3xl px-6 py-8'>
      <h1 className='font-heading mb-6 text-2xl font-semibold tracking-tight'>
        {t('products.pages.editTitle')}
      </h1>

      {error ? (
        <div
          role='alert'
          className='rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
        >
          {error}
        </div>
      ) : product === null ? (
        <div className='flex items-center justify-center py-16 text-muted-foreground'>
          <Spinner className='size-5' />
        </div>
      ) : (
        <ProductForm
          initial={product}
          onSave={async (values) => {
            const updated = await api.update(product.id, values);
            void navigate(`/products/${updated.id}`);
          }}
          submitLabel={t('products.save')}
          cancelLabel={t('actions.cancel')}
          onCancel={() => {
            void navigate(`/products/${product.id}`);
          }}
        />
      )}
    </section>
  );
}
