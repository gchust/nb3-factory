import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useState } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * A deliberately tiny smoke-test page: it proves the route, the navigation entry and an interactive button work
 * end to end. The counter is component state only — refreshing the page resets it, and nothing is persisted.
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
      <Card className='max-w-sm'>
        <CardContent className='flex items-center justify-between gap-4'>
          <span
            aria-live='polite'
            className='font-heading text-4xl font-semibold tabular-nums'
          >
            {count}
          </span>
          <Button onClick={() => setCount((value) => value + 1)} type='button'>
            {t('pipelineSmoke.increment')}
          </Button>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
