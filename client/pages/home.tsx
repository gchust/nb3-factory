import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useGetIdentity } from '@refinedev/core';
import { useCallback, type ReactElement } from 'react';

import { SkillsExampleNotice } from '../components/skills-example-notice';
import { loadSkillsExampleNotice } from '../components/skills-example-notice-data';

interface AppIdentity {
  email?: string;
  fullName?: string;
  id: string | number;
}

export default function HomePage(): ReactElement {
  const { t } = useTranslation();
  const { data: identity } = useGetIdentity<AppIdentity>();
  // The Application's own API client, so the notice request follows its configured `api.baseURL`.
  const api = useService(apiClientToken);
  const loadNotice = useCallback(() => loadSkillsExampleNotice(api), [api]);

  return (
    <section className='mx-auto grid min-h-[calc(100svh-4rem)] w-full max-w-5xl place-items-center px-6 py-10'>
      <div className='max-w-xl space-y-6 text-center'>
        <h2 className='text-3xl font-semibold tracking-tight'>
          {t('home.title')}
        </h2>
        <p className='text-muted-foreground'>
          {identity?.fullName || identity?.email
            ? t('home.welcome', {
                name: identity.fullName ?? identity.email,
              })
            : ''}
          {t('home.description')}
        </p>
        <div className='text-left'>
          <SkillsExampleNotice loadNotice={loadNotice} />
        </div>
      </div>
    </section>
  );
}
