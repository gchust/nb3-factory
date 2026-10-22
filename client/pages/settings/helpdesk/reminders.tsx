import { useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { Clock3Icon } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Button } from '#components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import { useApiData } from '../../helpdesk/api.js';
import { HelpdeskError } from '../../helpdesk/shared.js';
import type { HelpdeskSettings } from '../../helpdesk/types.js';
import { ReminderHoursField, SaveButton, WorkflowLoading } from './shared.js';

export default function HelpdeskRemindersPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const request = useApiData<{ data: HelpdeskSettings }>('helpdesk/settings');
  const canUpdate = useCan({
    resource: { type: 'settings', id: 'helpdesk.reminders' },
    action: 'update',
  });
  const [draft, setDraft] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [invalid, setInvalid] = useState(false);
  const settings = request.data?.data;
  const value =
    draft ?? (settings === undefined ? '' : String(settings.reminderHours));
  const save = async () => {
    const hours = Number(value);
    if (!Number.isInteger(hours) || hours < 1 || hours > 720) {
      setInvalid(true);
      return;
    }
    setBusy(true);
    setError(undefined);
    setInvalid(false);
    try {
      await api.request({
        path: 'helpdesk/settings',
        method: 'PUT',
        json: { reminderHours: hours },
      });
      setDraft(undefined);
      toaster.show({
        type: 'success',
        title: t('helpdesk.reminders.saved'),
      });
      request.reload();
    } catch (next) {
      setError(next);
    } finally {
      setBusy(false);
    }
  };
  return (
    <PageContainer>
      <PageHeader
        title={t('helpdesk.reminders.title')}
        description={t('helpdesk.reminders.description')}
        actions={
          <Button
            nativeButton={false}
            variant='outline'
            render={<Link to='/settings/helpdesk-workflow/executions' />}
          >
            {t('helpdesk.reminders.viewExecutions')}
          </Button>
        }
      />
      <HelpdeskError error={request.error} retry={request.reload} />
      {request.loading && !settings ? (
        <WorkflowLoading />
      ) : settings ? (
        <div className='grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Clock3Icon className='size-4' />
                {t('helpdesk.reminders.policy')}
              </CardTitle>
            </CardHeader>
            <CardContent className='flex flex-col gap-4'>
              <ReminderHoursField
                label={t('helpdesk.workflow.reminderHours')}
                hint={t('helpdesk.workflow.reminderHoursHint')}
                value={value}
                disabled={!canUpdate.can || busy}
                invalid={invalid}
                onChange={(next) => {
                  setDraft(next);
                  setInvalid(false);
                }}
              />
              {invalid && (
                <p className='text-xs text-destructive'>
                  {t('helpdesk.reminders.invalid')}
                </p>
              )}
              <HelpdeskError error={error} />
              <div className='flex flex-wrap items-center gap-2'>
                <SaveButton
                  busy={busy}
                  disabled={!canUpdate.can || draft === undefined}
                  onClick={() => void save()}
                />
                {draft !== undefined && (
                  <Button
                    variant='ghost'
                    disabled={busy}
                    onClick={() => {
                      setDraft(undefined);
                      setInvalid(false);
                    }}
                  >
                    {t('helpdesk.actions.reset')}
                  </Button>
                )}
              </div>
              {!canUpdate.can && (
                <p className='text-xs text-muted-foreground'>
                  {t('helpdesk.reminders.readOnly')}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('helpdesk.reminders.howItWorks')}</CardTitle>
            </CardHeader>
            <CardContent className='flex flex-col gap-3 text-sm text-muted-foreground'>
              <p>
                {t('helpdesk.reminders.howItWorksBody', {
                  hours: settings.reminderHours,
                })}
              </p>
              <p>{t('helpdesk.reminders.liveHint')}</p>
              {settings.updatedAt && (
                <p className='text-xs'>
                  {t('helpdesk.reminders.updated', {
                    date: new Date(settings.updatedAt).toLocaleString(),
                  })}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </PageContainer>
  );
}
