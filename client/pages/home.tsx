import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

export default function HomePage(): ReactElement {
  const { t } = useTranslation();
  return (
    <section className='mx-auto grid min-h-[calc(100svh-4rem)] w-full max-w-5xl place-items-center px-6 py-10'>
      <div className='w-full max-w-2xl space-y-8 text-center'>
        <div className='space-y-6'>
          <h1 className='font-heading text-3xl font-semibold tracking-tight'>
            {t('home.title')}
          </h1>
          <p className='text-muted-foreground'>{t('home.description')}</p>
        </div>

        <div className='space-y-3 rounded-xl border border-border bg-card p-6 text-left'>
          <h2 className='font-heading text-base font-medium'>
            {t('home.roles.title')}
          </h2>
          <p className='text-sm text-muted-foreground'>
            {t('home.roles.manager')}
          </p>
          <p className='text-sm text-muted-foreground'>
            {t('home.roles.staff')}
          </p>
        </div>
      </div>
    </section>
  );
}
