import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { ProductForm } from '@/components/products/product-form';
import { useProductsApi } from '@/lib/products';

export default function NewProductPage(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { api } = useProductsApi();

  return (
    <section className='mx-auto w-full max-w-3xl px-6 py-8'>
      <h1 className='font-heading mb-6 text-2xl font-semibold tracking-tight'>
        {t('products.pages.newTitle')}
      </h1>
      <ProductForm
        onSave={async (values) => {
          const created = await api.create(values);
          void navigate(`/products/${created.id}`);
        }}
        submitLabel={t('products.save')}
        cancelLabel={t('actions.cancel')}
        onCancel={() => {
          void navigate('/products');
        }}
      />
    </section>
  );
}
