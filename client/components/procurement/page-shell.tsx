import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement, ReactNode } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function ProcurementPage({
  title,
  description,
  actions,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section className='mx-auto w-full max-w-6xl space-y-6 px-6 py-8'>
      <header className='flex flex-wrap items-end justify-between gap-4'>
        <div className='space-y-1'>
          <h1 className='font-heading text-2xl font-semibold tracking-tight'>
            {title}
          </h1>
          {description ? (
            <p className='text-sm text-muted-foreground'>{description}</p>
          ) : null}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function ProcurementCard({
  title,
  children,
}: {
  readonly title?: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Card>
      {title ? (
        <CardHeader>
          <CardTitle className='text-base'>{title}</CardTitle>
        </CardHeader>
      ) : null}
      <CardContent className='space-y-4'>{children}</CardContent>
    </Card>
  );
}

export function DeniedNotice(): ReactElement {
  const { t } = useTranslation();
  return (
    <section className='mx-auto grid min-h-[calc(100svh-4rem)] w-full max-w-5xl place-items-center px-6 py-10'>
      <div className='max-w-md space-y-2 text-center'>
        <h1 className='font-heading text-2xl font-semibold tracking-tight'>
          {t('procurement.denied')}
        </h1>
      </div>
    </section>
  );
}

export function LoadingLine(): ReactElement {
  const { t } = useTranslation();
  return (
    <p className='text-sm text-muted-foreground'>{t('procurement.loading')}</p>
  );
}

export function ErrorLine({
  message,
}: {
  readonly message: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <p className='text-sm text-destructive' role='alert'>
      {message || t('procurement.error')}
    </p>
  );
}

export function EmptyLine(): ReactElement {
  const { t } = useTranslation();
  return (
    <p className='text-sm text-muted-foreground'>{t('procurement.empty')}</p>
  );
}
