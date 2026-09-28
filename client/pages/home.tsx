import { useTranslation } from '@nocobase/i18n/client';
import { ChevronDownIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

/**
 * The team announcement landing page. It is intentionally quiet: one heading, one line of context, and a single
 * collapsible "说明" block that starts closed. The block is expanded only on demand so the announcement itself stays
 * the focus of the page.
 */
export default function HomePage(): ReactElement {
  const { t } = useTranslation();
  return (
    <section className='mx-auto grid min-h-[calc(100svh-4rem)] w-full max-w-5xl place-items-center px-6 py-10'>
      <div className='w-full max-w-xl space-y-6 text-center'>
        <h1 className='font-heading text-3xl font-semibold tracking-tight'>
          {t('home.title')}
        </h1>
        <p className='text-muted-foreground'>{t('home.description')}</p>
        <Collapsible className='mx-auto w-full max-w-md rounded-lg border text-left'>
          <CollapsibleTrigger
            render={
              <Button
                variant='ghost'
                className='h-auto w-full justify-between px-4 py-3'
              />
            }
          >
            {t('home.notes.title')}
            <ChevronDownIcon className='text-muted-foreground transition-transform group-data-panel-open/button:rotate-180' />
          </CollapsibleTrigger>
          <CollapsibleContent className='px-4 pb-4 text-sm leading-6 text-muted-foreground'>
            {t('home.notes.content')}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </section>
  );
}
