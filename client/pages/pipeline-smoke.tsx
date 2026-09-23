import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

/**
 * A deliberately minimal page used to smoke-test the build pipeline.
 *
 * The count lives only in this component's memory: it resets on every mount and
 * does not touch the database or the network.
 */
export default function PipelineSmokePage(): ReactElement {
  const { t } = useTranslation();
  const [count, setCount] = useState(0);

  return (
    <PageContainer className='mx-auto max-w-2xl'>
      <PageHeader
        title={t('pipelineSmoke.title')}
        description={t('pipelineSmoke.description')}
      />
      <div className='flex items-center gap-4'>
        <span
          aria-label={t('pipelineSmoke.countLabel')}
          className='text-4xl font-semibold tabular-nums'
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
