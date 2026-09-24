import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useState } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

/**
 * Pipeline smoke page: a login-gated counter used to verify the automated build
 * pipeline end to end. The count lives in component state only, so reloading the
 * page resets it to zero.
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
        <span className='font-heading text-2xl font-semibold tabular-nums'>
          {count}
        </span>
        <Button onClick={() => setCount((value) => value + 1)}>
          {t('pipelineSmoke.increment')}
        </Button>
      </div>
    </PageContainer>
  );
}
