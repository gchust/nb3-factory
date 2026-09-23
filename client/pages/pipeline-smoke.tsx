import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

/**
 * Smoke-test page for the Issue → Agent → PR pipeline. The counter deliberately stays in component state: the
 * point of this page is to prove a real page, navigation entry and button handler reached the application, not to
 * persist anything.
 */
export default function PipelineSmokePage(): ReactElement {
  const { t } = useTranslation();
  const [count, setCount] = useState(0);

  return (
    <PageContainer className='mx-auto max-w-3xl'>
      <PageHeader
        description={t('pipelineSmoke.description')}
        title={t('pipelineSmoke.title')}
      />
      <div className='flex items-center gap-4'>
        <span
          aria-live='polite'
          className='font-heading text-4xl font-semibold tabular-nums'
          data-testid='pipeline-smoke-count'
        >
          {count}
        </span>
        <Button
          onClick={() => setCount((current) => current + 1)}
          type='button'
        >
          {t('pipelineSmoke.increment')}
        </Button>
      </div>
    </PageContainer>
  );
}
