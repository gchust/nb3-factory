import { useTranslation } from '@nocobase/i18n/client';
import { ChevronDownIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

/**
 * A minimal team announcement: the headline, where it came from, and the extra detail kept behind a section that
 * starts collapsed so the page opens on the announcement alone.
 */
export default function HomePage(): ReactElement {
  const { t } = useTranslation();

  return (
    <PageContainer>
      <PageHeader title={t('home.title')} description={t('home.description')} />
      <Card className='max-w-2xl'>
        <CardContent>
          <Collapsible>
            <CollapsibleTrigger
              render={
                <Button variant='ghost' className='w-full justify-between' />
              }
            >
              {t('home.notes.title')}
              <ChevronDownIcon className='transition-transform group-data-panel-open/button:rotate-180' />
            </CollapsibleTrigger>
            <CollapsibleContent className='px-3 pt-3 text-sm leading-6 text-muted-foreground'>
              <p>{t('home.notes.body')}</p>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
