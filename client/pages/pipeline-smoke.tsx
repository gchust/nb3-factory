import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';

/**
 * Pipeline smoke page.
 *
 * A deliberately small, self-contained screen used to verify the automated build pipeline end to end: it changes the
 * page, the navigation and the button logic without needing a table, an endpoint or a permission. The counter lives in
 * component state only — its purpose is to prove the interaction works, not to persist anything — so a reload starts
 * it back at zero.
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
        <output
          aria-live='polite'
          className='font-heading text-3xl font-semibold tabular-nums'
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
