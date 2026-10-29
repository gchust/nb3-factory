import { useApiClient, useToaster } from '@nocobase/app-client';
import type { LifecycleDescription } from '@nocobase/lifecycle';
import { useTranslation } from '@nocobase/i18n/client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { Settings2Icon } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link, useParams } from 'react-router';
import { BackButton } from '#components/back-button';
import { LifecycleDiagram } from '#components/lifecycle-diagram';
import { PageHeader } from '#components/page-header';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Button } from '#components/ui/button';
import { WorkflowDefinitionDetail } from '#extensions/nocobase-workflow-management/layout';
import { useApiData } from '../../helpdesk/api.js';
import { HelpdeskError, TransitionLabel } from '../../helpdesk/shared.js';
import type {
  HelpdeskSettings,
  WorkflowDefinition,
} from '../../helpdesk/types.js';
import { ReminderHoursField, SaveButton, WorkflowLoading } from './shared.js';

export default function HelpdeskDefinitionDetailPage(): ReactElement {
  const { t } = useTranslation();
  const { definitionName } = useParams();
  const api = useApiClient();
  const toaster = useToaster();
  const definition = useApiData<{ data: WorkflowDefinition }>(
    'helpdesk/workflow/definition',
  );
  const settings = useApiData<{ data: HelpdeskSettings }>('helpdesk/settings');
  const canUpdate = useCan({
    resource: { type: 'settings', id: 'helpdesk.reminders' },
    action: 'update',
  });
  const [draft, setDraft] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [invalid, setInvalid] = useState(false);
  const [editor, setEditor] = useState<string>();

  const def = definition.data?.data;
  const reminderHours = settings.data?.data.reminderHours;
  const value =
    draft ?? (reminderHours === undefined ? '' : String(reminderHours));
  const save = async () => {
    const hours = Number(value);
    if (!Number.isInteger(hours) || hours < 1 || hours > 720) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setBusy(true);
    setError(undefined);
    try {
      await api.request({
        path: 'helpdesk/settings',
        method: 'PUT',
        json: { reminderHours: hours },
      });
      setDraft(undefined);
      setEditor(undefined);
      toaster.show({
        type: 'success',
        title: t('helpdesk.reminders.saved'),
      });
      settings.reload();
    } catch (next) {
      setError(next);
    } finally {
      setBusy(false);
    }
  };

  const field = (
    <div className='flex flex-col gap-4'>
      <div>
        <p className='text-sm font-medium'>
          {t('helpdesk.workflow.reminderPolicy')}
        </p>
        <p className='mt-1 text-xs text-muted-foreground'>
          {t('helpdesk.workflow.reminderPolicyHint')}
        </p>
      </div>
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
      <div className='flex flex-wrap items-center gap-3'>
        <SaveButton
          busy={busy}
          disabled={!canUpdate.can || draft === undefined}
          onClick={() => void save()}
        />
        {draft !== undefined && (
          <Button
            type='button'
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
      <p className='text-xs text-muted-foreground'>
        {t('helpdesk.reminders.current', {
          hours: reminderHours ?? '—',
        })}
      </p>
      <HelpdeskError error={error} />
      {!canUpdate.can && (
        <p className='text-xs text-muted-foreground'>
          {t('helpdesk.reminders.readOnly')}
        </p>
      )}
    </div>
  );

  const detail = editor ? (
    <Dialog open onOpenChange={(open) => !open && setEditor(undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('helpdesk.workflow.configure')}</DialogTitle>
          <DialogDescription>
            {editor.startsWith('state:')
              ? t(`helpdesk.status.${editor.slice('state:'.length)}`, {
                  defaultValue: editor.slice('state:'.length),
                })
              : t(`helpdesk.transition.${editor.slice('transition:'.length)}`, {
                  defaultValue: editor.slice('transition:'.length),
                })}
          </DialogDescription>
        </DialogHeader>
        {field}
        <DialogFooter>
          <Button variant='outline' onClick={() => setEditor(undefined)}>
            {t('helpdesk.actions.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;

  return (
    <div className='flex flex-col gap-4'>
      <BackButton to='/settings/helpdesk-workflow/definitions'>
        {t('helpdesk.workflow.backToDefinitions')}
      </BackButton>
      <PageHeader
        title={t('helpdesk.workflow.ticketProcess')}
        description={t('helpdesk.workflow.definitionDescription')}
        actions={
          <Button
            nativeButton={false}
            variant='outline'
            render={<Link to='/settings/helpdesk-workflow/executions' />}
          >
            {t('helpdesk.workflow.tabs.executions')}
          </Button>
        }
      />
      <HelpdeskError error={definition.error} retry={definition.reload} />
      <HelpdeskError error={settings.error} retry={settings.reload} />
      {definition.loading && !def ? (
        <WorkflowLoading />
      ) : !def ? (
        <p className='text-sm text-muted-foreground'>
          {t('helpdesk.workflow.definitionMissing')}
        </p>
      ) : definitionName && definitionName !== def.name ? (
        <p className='text-sm text-muted-foreground'>
          {t('helpdesk.workflow.definitionMissing')}
        </p>
      ) : (
        <WorkflowDefinitionDetail
          diagramTitle={t('helpdesk.workflow.diagram')}
          parametersTitle={t('helpdesk.workflow.parameters')}
          diagram={
            <LifecycleDiagram
              ariaLabel={t('helpdesk.workflow.diagram')}
              description={def as unknown as LifecycleDescription}
              currentState={def.initial}
              stateLabel={(state) =>
                t(`helpdesk.status.${state.name}`, {
                  defaultValue: state.title,
                })
              }
              transitionLabel={(transition) =>
                t(`helpdesk.transition.${transition.name}`, {
                  defaultValue: transition.title,
                })
              }
              configuration={
                canUpdate.can
                  ? {
                      label: () => t('helpdesk.workflow.configure'),
                      canConfigure: () => true,
                      onConfigure: (selection) =>
                        setEditor(
                          `${selection.target.kind}:${selection.target.name}`,
                        ),
                    }
                  : undefined
              }
            />
          }
          parameters={
            <div className='flex flex-col gap-4'>
              <div className='flex items-center gap-2 text-sm font-medium'>
                <Settings2Icon className='size-4' />
                {t('helpdesk.workflow.livePolicy')}
              </div>
              {field}
              <div className='rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground'>
                <p>
                  {t('helpdesk.workflow.triggerSummary', {
                    transition: t('helpdesk.transition.remind', {
                      defaultValue: 'remind',
                    }),
                    state: t('helpdesk.status.processing'),
                  })}
                </p>
                <p className='mt-2'>
                  <TransitionLabel transition='remind' />
                </p>
              </div>
            </div>
          }
        />
      )}
      {detail}
    </div>
  );
}
