import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';

/**
 * A deliberately small page used to verify the automated build pipeline end to end.
 *
 * The counter lives only in component state, so a reload resets it to zero by design; nothing here reaches the
 * database or an endpoint.
 */
export default function PipelineSmokePage(): ReactElement {
  const { t } = useTranslation();
  const [count, setCount] = useState(0);

  return (
    <section className='mx-auto grid min-h-[calc(100svh-4rem)] w-full max-w-5xl place-items-center px-6 py-10'>
      <div className='max-w-xl space-y-6 text-center'>
        <h1 className='font-heading text-3xl font-semibold tracking-tight'>
          {t('pipelineSmoke.title')}
        </h1>
        <p className='text-muted-foreground'>
          {t('pipelineSmoke.description')}
        </p>
        <div className='flex items-center justify-center gap-4'>
          <output
            aria-live='polite'
            className='text-2xl font-semibold tabular-nums'
          >
            {count}
          </output>
          <Button onClick={() => setCount((value) => value + 1)}>
            {t('pipelineSmoke.increment')}
          </Button>
        </div>
      </div>
    </section>
  );
}
