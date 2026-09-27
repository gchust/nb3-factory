import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

/**
 * Smoke-test page for the automated build pipeline: it proves an Issue can change real application code, navigation
 * and an interactive control.
 *
 * The count lives only in component state. It is deliberately not persisted, so refreshing the page resets it to
 * zero — no business table, endpoint or storage is involved.
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
          className='font-heading text-2xl font-semibold tabular-nums'
          data-testid='pipeline-smoke-count'
        >
          {count}
        </p>
        <Button onClick={() => setCount((current) => current + 1)}>
          {t('pipelineSmoke.increment')}
        </Button>
      </div>
    </PageContainer>
  );
}
