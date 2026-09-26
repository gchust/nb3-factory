import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useState } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

/**
 * A minimal page that exercises the automated build pipeline end to end: a title, a description, and a
 * counter a button increases.
 *
 * The count lives in component state on purpose. It is not persisted anywhere, so a page reload starts it
 * from zero again.
 */
export default function PipelineSmokePage(): ReactElement {
  const { t } = useTranslation();
  const [count, setCount] = useState(0);

  return (
    <PageContainer>
      <PageHeader
        title={t('pipelineSmoke.title')}
        description={t('pipelineSmoke.description')}
      />
      <div className='flex items-center gap-4'>
        <p
          aria-live='polite'
          className='font-heading text-4xl font-semibold tabular-nums'
        >
          {count}
        </p>
        <Button type='button' onClick={() => setCount((value) => value + 1)}>
          {t('pipelineSmoke.increment')}
        </Button>
      </div>
    </PageContainer>
  );
}
