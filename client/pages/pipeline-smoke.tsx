import { useTranslation } from '@nocobase/i18n/client';
import { PlusIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * A minimal page whose only job is to prove the build pipeline ends in a usable screen: a title, one
 * line of explanation, an initial count of zero and a `+1` button. The count lives in component
 * state on purpose — it resets on reload, and it has no table, endpoint or permission behind it.
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
            className='font-heading text-3xl font-semibold tabular-nums'
            data-testid='pipeline-smoke-count'
          >
            {count}
          </span>
          <Button
            type='button'
            onClick={() => setCount((value) => value + 1)}
            data-testid='pipeline-smoke-increment'
          >
            <PlusIcon data-icon='inline-start' />
            {t('pipelineSmoke.increment')}
          </Button>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
