/**
 * The landing page for the service team. It introduces the material library and
 * the read-only assistant and links to both, so the two business surfaces are
 * reachable from the first screen as well as from the navigation.
 */
import { useTranslation } from '@nocobase/i18n/client';
import { BookOpenText, MessageCircleQuestion } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function HomePage(): ReactElement {
  const { t } = useTranslation();
  return (
    <section className='mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-5xl flex-col justify-center gap-10 px-6 py-10'>
      <div className='max-w-2xl space-y-4'>
        <h1 className='font-heading text-3xl font-semibold tracking-tight'>
          {t('home.title')}
        </h1>
        <p className='text-muted-foreground'>{t('home.description')}</p>
      </div>
      <div className='grid gap-4 sm:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <BookOpenText className='size-5 text-muted-foreground' />
              {t('home.materialsTitle')}
            </CardTitle>
            <CardDescription>{t('home.materialsDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              to='/materials'
              className={buttonVariants({ variant: 'outline' })}
            >
              {t('home.openMaterials')}
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <MessageCircleQuestion className='size-5 text-muted-foreground' />
              {t('home.assistantTitle')}
            </CardTitle>
            <CardDescription>{t('home.assistantDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link to='/assistant' className={buttonVariants()}>
              {t('home.openAssistant')}
            </Link>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
