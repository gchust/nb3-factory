import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { DemoAccounts } from '@/components/demo-accounts';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardTitle } from '@/components/ui/card';

const QUICK_LINKS = [
  { to: '/training/catalog', key: 'linkCatalog' },
  { to: '/training/my-learning', key: 'linkMyLearning' },
  { to: '/training/grading', key: 'linkGrading' },
  { to: '/training/stats', key: 'linkStats' },
  { to: '/training/manage', key: 'linkManage' },
] as const;

export default function HomePage(): ReactElement {
  const { t } = useTranslation();
  return (
    <PageContainer>
      <PageHeader title={t('home.title')} description={t('home.description')} />

      <section className='space-y-3'>
        <h2 className='text-sm font-medium text-muted-foreground'>
          {t('home.quickLinks')}
        </h2>
        <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
          {QUICK_LINKS.map((link) => (
            <Link key={link.to} to={link.to} className='block'>
              <Card className='transition-colors hover:bg-muted/50'>
                <CardContent>
                  <CardTitle className='text-base'>
                    {t(`home.${link.key}`)}
                  </CardTitle>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <div className='max-w-md'>
        <DemoAccounts />
      </div>
    </PageContainer>
  );
}
