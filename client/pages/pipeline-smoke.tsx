import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

/**
 * Minimal end-to-end smoke screen: proves a request can travel Issue → Agent →
 * reviewed application code. The counter is deliberately component state only,
 * so a page refresh resets it to zero; nothing here is business data.
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
        <span
          aria-live='polite'
          className='font-heading text-2xl font-semibold tabular-nums'
        >
          {count}
        </span>
        <Button onClick={() => setCount((current) => current + 1)}>
          {t('pipelineSmoke.increment')}
        </Button>
      </div>
    </PageContainer>
  );
}
