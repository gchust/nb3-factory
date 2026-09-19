import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';

/**
 * The shared password of the fictitious accounts created by the recruitment
 * demo seed (`database/main/seeds/202609190001_seed_recruitment_demo_data.ts`).
 * Keeping it here is what makes each role directly tryable after signing out.
 */
const DEMO_PASSWORD = 'Recruit123!';

const DEMO_ACCOUNTS = [
  { username: 'hr.manager', name: '陈慧', role: 'hr', can: 'hrCan' },
  {
    username: 'recruiter.li',
    name: '李娜',
    role: 'recruiter',
    can: 'recruiterCan',
  },
  {
    username: 'recruiter.wang',
    name: '王强',
    role: 'recruiter',
    can: 'recruiterCan',
  },
  {
    username: 'interviewer.chen',
    name: '刘敏',
    role: 'interviewer',
    can: 'interviewerCan',
  },
  {
    username: 'interviewer.zhang',
    name: '张伟',
    role: 'interviewer',
    can: 'interviewerCan',
  },
] as const;

export default function HomePage(): ReactElement {
  const { t } = useTranslation();
  return (
    <PageContainer className='mx-auto max-w-5xl'>
      <PageHeader title={t('home.title')} description={t('home.description')} />

      <div className='rounded-xl border border-border bg-background p-4 shadow-xs'>
        <h2 className='text-sm font-medium'>{t('home.demo.title')}</h2>
        <p className='mt-1 text-sm text-muted-foreground'>
          {t('home.demo.description')}
        </p>
        <p className='mt-2 text-sm'>
          <span className='font-medium'>{t('home.demo.password')}</span>
          {': '}
          <code className='rounded bg-muted px-1.5 py-0.5 text-foreground'>
            {DEMO_PASSWORD}
          </code>
        </p>

        <div className='mt-3 overflow-x-auto'>
          <table className='w-full min-w-[34rem] text-left text-sm'>
            <thead className='text-xs text-muted-foreground'>
              <tr>
                <th className='py-2 pr-3 font-medium'>
                  {t('home.demo.username')}
                </th>
                <th className='py-2 pr-3 font-medium'>{t('home.demo.name')}</th>
                <th className='py-2 pr-3 font-medium'>{t('home.demo.role')}</th>
                <th className='py-2 font-medium'>{t('home.demo.can')}</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_ACCOUNTS.map((account) => (
                <tr
                  className='border-t border-border align-top'
                  key={account.username}
                >
                  <td className='py-2 pr-3 font-mono text-xs'>
                    {account.username}
                  </td>
                  <td className='py-2 pr-3'>{account.name}</td>
                  <td className='py-2 pr-3'>
                    {t(`recruitment.roles.${account.role}`)}
                  </td>
                  <td className='py-2 text-muted-foreground'>
                    {t(`home.demo.${account.can}`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageContainer>
  );
}
