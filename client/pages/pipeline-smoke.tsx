import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useState } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * A minimal smoke page used to verify the automatic setup pipeline end to end.
 *
 * The counter lives only in component state, so a full page reload is expected to reset it to zero.
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
          <span className='font-heading text-3xl font-semibold tabular-nums'>
            {count}
          </span>
          <Button onClick={() => setCount((current) => current + 1)}>
            {t('pipelineSmoke.increment')}
          </Button>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
