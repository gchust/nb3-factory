import { resolveAppUrl } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

const SAMPLE_FILES = [
  { file: 'venue-cover.png', key: 'home.samples.cover' },
  { file: 'venue-gallery-1.png', key: 'home.samples.gallery' },
  { file: 'rental-agreement.pdf', key: 'home.samples.agreement' },
  { file: 'rental-supplement.txt', key: 'home.samples.supplement' },
  { file: 'delivery-photo.png', key: 'home.samples.deliveryPhoto' },
  { file: 'delivery-acceptance.pdf', key: 'home.samples.deliveryPdf' },
  { file: 'return-photo.png', key: 'home.samples.returnPhoto' },
  { file: 'return-acceptance.pdf', key: 'home.samples.returnPdf' },
] as const;

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

        <div className='space-y-3 rounded-xl border border-border bg-card p-6 text-left'>
          <h2 className='font-heading text-base font-medium'>
            {t('home.samples.title')}
          </h2>
          <p className='text-sm text-muted-foreground'>
            {t('home.samples.description')}
          </p>
          <ul className='grid gap-1 text-sm sm:grid-cols-2'>
            {SAMPLE_FILES.map((sample) => (
              <li key={sample.file}>
                <a
                  className='text-primary underline-offset-4 hover:underline'
                  download={sample.file}
                  href={resolveAppUrl(`/assets/demo/${sample.file}`)}
                >
                  {t(sample.key)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
