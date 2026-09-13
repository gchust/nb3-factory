import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Loading } from '@/components/loading';
import type { Announcement } from '@/hooks/use-announcements';

export interface AnnouncementListProps {
  readonly items: readonly Announcement[];
  readonly loading: boolean;
  readonly error?: string;
}

export function AnnouncementList({
  items,
  loading,
  error,
}: AnnouncementListProps): ReactElement {
  const { t } = useTranslation();

  return (
    <section className='space-y-4'>
      <h2 className='font-heading text-lg font-semibold'>
        {t('announcements.list.heading', {
          defaultValue: 'Published announcements',
        })}
      </h2>
      {loading ? (
        <Loading
          className='py-10'
          label={t('announcements.list.loading', {
            defaultValue: 'Loading announcements',
          })}
        />
      ) : error ? (
        <p className='text-sm text-destructive' role='alert'>
          {error}
        </p>
      ) : items.length === 0 ? (
        <p className='text-sm text-muted-foreground'>
          {t('announcements.list.empty', {
            defaultValue: 'No announcements yet. Publish the first one.',
          })}
        </p>
      ) : (
        <ol className='space-y-3'>
          {items.map((announcement) => (
            <li
              className='rounded-lg border border-border bg-card p-5'
              key={announcement.id}
            >
              <article className='space-y-2'>
                <h3 className='font-heading text-base font-semibold break-words'>
                  {announcement.title}
                </h3>
                <p className='text-sm whitespace-pre-wrap break-words text-muted-foreground'>
                  {announcement.body}
                </p>
                <p className='text-xs text-muted-foreground'>
                  {t('announcements.list.created', {
                    date: formatCreatedAt(announcement.createdAt),
                    defaultValue: 'Created {{date}}',
                  })}
                </p>
              </article>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
