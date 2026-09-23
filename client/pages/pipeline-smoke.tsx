import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

export default function PipelineSmokePage(): ReactElement {
  const { t } = useTranslation();
  // The count is deliberately page-local: the smoke case only needs the button to update the display.
  const [count, setCount] = useState(0);

  return (
    <PageContainer className='mx-auto max-w-3xl'>
      <PageHeader
        title={t('pipelineSmoke.title')}
        description={t('pipelineSmoke.description')}
      />
      <div className='flex items-center gap-4'>
        <span className='text-sm text-muted-foreground'>
          {t('pipelineSmoke.count')}
        </span>
        <output
          aria-label={t('pipelineSmoke.count')}
          className='min-w-8 text-center font-heading text-2xl font-semibold tabular-nums'
        >
          {count}
        </output>
        <Button type='button' onClick={() => setCount((value) => value + 1)}>
          {t('pipelineSmoke.increment')}
        </Button>
      </div>
    </PageContainer>
  );
}
