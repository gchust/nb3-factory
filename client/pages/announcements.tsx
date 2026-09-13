import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { AnnouncementForm } from '@/components/announcement-form';
import { AnnouncementList } from '@/components/announcement-list';
import {
  useAnnouncementsApi,
  type Announcement,
  type CreateAnnouncementInput,
} from '@/hooks/use-announcements';

export default function AnnouncementsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useAnnouncementsApi();
  const [items, setItems] = useState<readonly Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [createError, setCreateError] = useState<string>();

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const loaded = await api.list();
        if (!active) return;
        setItems(loaded);
        setLoadError(undefined);
      } catch {
        if (!active) return;
        setLoadError(
          t('announcements.error.load', {
            defaultValue: 'Unable to load announcements.',
          }),
        );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [api, t]);

  const handleCreate = useCallback(
    async (input: CreateAnnouncementInput): Promise<boolean> => {
      setCreateError(undefined);
      try {
        const created = await api.create(input);
        // The API returns the stored record; put it first so the newest announcement stays at the top.
        setItems((current) => [created, ...current]);
        return true;
      } catch (cause) {
        const code = readErrorCode(cause);
        setCreateError(
          code === 'TITLE_REQUIRED'
            ? t('announcements.error.titleRequired', {
                defaultValue: 'Enter a title.',
              })
            : code === 'TITLE_TOO_LONG'
              ? t('announcements.error.titleTooLong', {
                  defaultValue: 'Keep the title under 200 characters.',
                })
              : code === 'BODY_REQUIRED'
                ? t('announcements.error.bodyRequired', {
                    defaultValue: 'Enter a body.',
                  })
                : t('announcements.error.create', {
                    defaultValue: 'Unable to publish the announcement.',
                  }),
        );
        return false;
      }
    },
    [api, t],
  );

  return (
    <section className='mx-auto w-full max-w-3xl space-y-8 px-6 py-10'>
      <header className='space-y-2'>
        <h1 className='font-heading text-2xl font-semibold tracking-tight'>
          {t('announcements.title', { defaultValue: 'Announcements' })}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {t('announcements.description', {
            defaultValue:
              'Share updates with the team. New announcements appear at the top.',
          })}
        </p>
      </header>

      <AnnouncementForm onSubmit={handleCreate} serverError={createError} />

      <AnnouncementList error={loadError} items={items} loading={loading} />
    </section>
  );
}

function readErrorCode(cause: unknown): string | undefined {
  if (typeof cause !== 'object' || cause === null) return undefined;
  const payload = (cause as { payload?: unknown }).payload;
  if (typeof payload !== 'object' || payload === null) return undefined;
  const code = (payload as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}
