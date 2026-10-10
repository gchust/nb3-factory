import { useApiClient, useToaster, type ApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  Check,
  CornerUpLeft,
  Play,
  ThumbsUp,
  UserCog,
  type LucideIcon,
} from 'lucide-react';
import {
  useCallback,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';

import {
  acceptOrder,
  assignOrder,
  confirmOrder,
  listDirectoryUsers,
  listServiceGroups,
  returnOrder,
  startOrder,
  submitOrder,
} from '@/api/service';
import { ORDER_PRIORITIES, type OrderPriority } from '@/api/service-types';
import { ServiceErrorNotice } from '@/components/service/feedback';
import { FormField, SelectControl } from '@/components/service/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useServiceResource } from '@/hooks/use-service-resource';

import type { OrderSectionProps } from './types.js';

type Panel =
  'accept' | 'start' | 'submit' | 'confirm' | 'return' | 'assign' | null;

/** An instant as a `datetime-local` input writes it, in the browser's own zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

interface ActionButton {
  readonly key: Exclude<Panel, null>;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly variant: 'default' | 'outline' | 'destructive';
}

/**
 * The transitions the current status offers the current principal.
 *
 * The buttons come from the order's status and the caller's own permission
 * snapshot; the endpoints check the same thing again, so a button that should
 * not be there is only misleading, never sufficient.
 */
export function OrderActions({
  order,
  reload,
}: OrderSectionProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const [acceptanceNote, setAcceptanceNote] = useState('');
  const [resolution, setResolution] = useState('');
  const [returnReason, setReturnReason] = useState('');

  const [assigneeId, setAssigneeId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [dueAt, setDueAt] = useState(() => toLocalInput(order.dueAt));
  const [priority, setPriority] = useState<OrderPriority>(order.priority);
  const [observerVisible, setObserverVisible] = useState(order.observerVisible);

  const canProcess = useCan({
    resource: { type: 'composite', id: 'service.orders' },
    action: 'process',
  });
  const canConfirm = useCan({
    resource: { type: 'composite', id: 'service.orders' },
    action: 'confirm',
  });
  const canAssign = useCan({
    resource: { type: 'composite', id: 'service.orders' },
    action: 'assign',
  });

  const loadOptions = useCallback(
    async (client: ApiClient, signal: AbortSignal) => {
      const [users, groups] = await Promise.all([
        listDirectoryUsers(client, signal),
        listServiceGroups(client, signal),
      ]);
      return { users, groups };
    },
    [],
  );
  const options = useServiceResource('service-order-form-options', loadOptions);

  const buttons: ActionButton[] = [];
  if (order.status === 'pending_acceptance' && canProcess.can) {
    buttons.push({
      key: 'accept',
      label: t('service.orders.acceptAction'),
      icon: Check,
      variant: 'default',
    });
  }
  if (order.status === 'pending_processing' && canProcess.can) {
    buttons.push({
      key: 'start',
      label: t('service.orders.startAction'),
      icon: Play,
      variant: 'default',
    });
  }
  if (order.status === 'processing' && canProcess.can) {
    buttons.push({
      key: 'submit',
      label: t('service.orders.submitAction'),
      icon: ThumbsUp,
      variant: 'default',
    });
  }
  if (order.status === 'pending_confirmation' && canConfirm.can) {
    buttons.push({
      key: 'confirm',
      label: t('service.orders.confirmAction'),
      icon: Check,
      variant: 'default',
    });
  }
  if (order.status === 'pending_confirmation' && canProcess.can) {
    buttons.push({
      key: 'return',
      label: t('service.orders.returnAction'),
      icon: CornerUpLeft,
      variant: 'outline',
    });
  }
  if (order.status !== 'closed' && canAssign.can) {
    buttons.push({
      key: 'assign',
      label: t('service.orders.assignAction'),
      icon: UserCog,
      variant: 'outline',
    });
  }

  async function run(
    label: string,
    write: () => Promise<unknown>,
  ): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await write();
      setPanel(null);
      toaster.show({ type: 'success', title: label });
      await reload();
    } catch (actionError) {
      setError(actionError);
    } finally {
      setBusy(false);
    }
  }

  function onAccept(): void {
    void run(t('service.orders.accepted'), async () => {
      const result = await acceptOrder(api, order.id, acceptanceNote || null);
      toaster.show({
        type: 'info',
        title: result.viaWorkflow
          ? t('service.orders.acceptViaWorkflow')
          : t('service.orders.acceptDirect'),
      });
    });
  }

  function onAssign(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void run(t('service.orders.assigned'), () =>
      assignOrder(api, order.id, {
        ...(assigneeId ? { assigneeId } : {}),
        ...(groupId ? { groupId: Number(groupId) } : {}),
        ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}),
        priority,
        observerVisible,
      }),
    );
  }

  if (buttons.length === 0 && !canAssign.isPending) {
    return (
      <p className='text-sm text-muted-foreground'>
        {t('service.orders.noActions')}
      </p>
    );
  }

  return (
    <div className='space-y-4'>
      {error ? <ServiceErrorNotice error={error} /> : null}

      <div className='flex flex-wrap gap-2'>
        {buttons.map((button) => (
          <Button
            key={button.key}
            onClick={() => {
              setPanel((current) =>
                current === button.key ? null : button.key,
              );
            }}
            size='sm'
            variant={button.variant}
          >
            <button.icon aria-hidden='true' />
            {button.label}
          </Button>
        ))}
      </div>

      {panel === 'accept' ? (
        <FormField
          htmlFor='acceptance-note'
          label={t('service.orders.acceptanceNote')}
        >
          <Textarea
            id='acceptance-note'
            onChange={(event) => {
              setAcceptanceNote(event.target.value);
            }}
            rows={2}
            value={acceptanceNote}
          />
        </FormField>
      ) : null}
      {panel === 'accept' ? (
        <Button disabled={busy} onClick={onAccept} size='sm' type='button'>
          {busy ? <Spinner aria-hidden='true' /> : null}
          {t('service.orders.acceptAction')}
        </Button>
      ) : null}

      {panel === 'start' ? (
        <Button
          disabled={busy}
          onClick={() => {
            void run(t('service.orders.started'), () =>
              startOrder(api, order.id),
            );
          }}
          size='sm'
          type='button'
        >
          {busy ? <Spinner aria-hidden='true' /> : null}
          {t('service.orders.startAction')}
        </Button>
      ) : null}

      {panel === 'submit' ? (
        <div className='space-y-3'>
          <FormField
            htmlFor='order-resolution'
            label={t('service.orders.resolution')}
            required
          >
            <Textarea
              id='order-resolution'
              onChange={(event) => {
                setResolution(event.target.value);
              }}
              rows={4}
              value={resolution}
            />
          </FormField>
          <Button
            disabled={busy || resolution.trim() === ''}
            onClick={() => {
              void run(t('service.orders.submitted'), () =>
                submitOrder(api, order.id, resolution.trim()),
              );
            }}
            size='sm'
            type='button'
          >
            {busy ? <Spinner aria-hidden='true' /> : null}
            {t('service.orders.submitAction')}
          </Button>
        </div>
      ) : null}

      {panel === 'confirm' ? (
        <Button
          disabled={busy}
          onClick={() => {
            void run(t('service.orders.confirmed'), () =>
              confirmOrder(api, order.id),
            );
          }}
          size='sm'
          type='button'
        >
          {busy ? <Spinner aria-hidden='true' /> : null}
          {t('service.orders.confirmAction')}
        </Button>
      ) : null}

      {panel === 'return' ? (
        <div className='space-y-3'>
          <FormField
            htmlFor='return-reason'
            label={t('service.orders.returnReason')}
            required
          >
            <Textarea
              id='return-reason'
              onChange={(event) => {
                setReturnReason(event.target.value);
              }}
              rows={3}
              value={returnReason}
            />
          </FormField>
          <Button
            disabled={busy || returnReason.trim() === ''}
            onClick={() => {
              void run(t('service.orders.returned'), () =>
                returnOrder(api, order.id, returnReason.trim()),
              );
            }}
            size='sm'
            type='button'
            variant='outline'
          >
            {busy ? <Spinner aria-hidden='true' /> : null}
            {t('service.orders.returnAction')}
          </Button>
        </div>
      ) : null}

      {panel === 'assign' ? (
        <form className='grid gap-3 sm:grid-cols-2' onSubmit={onAssign}>
          <FormField
            htmlFor='assign-engineer'
            label={t('service.orders.assignee')}
          >
            <SelectControl
              disabled={options.isPending}
              id='assign-engineer'
              onChange={setAssigneeId}
              options={(options.data?.users ?? []).map((user) => ({
                value: user.id,
                label: user.name,
              }))}
              placeholder={t('service.orders.assigneePlaceholder')}
              value={assigneeId}
            />
          </FormField>
          <FormField htmlFor='assign-group' label={t('service.orders.group')}>
            <SelectControl
              disabled={options.isPending}
              id='assign-group'
              onChange={setGroupId}
              options={(options.data?.groups ?? []).map((group) => ({
                value: String(group.id),
                label: group.name,
              }))}
              placeholder={t('service.orders.groupPlaceholder')}
              value={groupId}
            />
          </FormField>
          <FormField htmlFor='assign-due' label={t('service.orders.dueAt')}>
            <Input
              id='assign-due'
              onChange={(event) => {
                setDueAt(event.target.value);
              }}
              type='datetime-local'
              value={dueAt}
            />
          </FormField>
          <FormField
            htmlFor='assign-priority'
            label={t('service.orders.priority')}
          >
            <SelectControl
              id='assign-priority'
              onChange={(value) => {
                setPriority(value as OrderPriority);
              }}
              options={ORDER_PRIORITIES.map((value) => ({
                value,
                label: t(`service.priority.${value}`),
              }))}
              value={priority}
            />
          </FormField>
          <label
            className='flex items-center gap-2 text-sm sm:col-span-2'
            htmlFor='assign-observer'
          >
            <input
              checked={observerVisible}
              className='size-4 accent-primary'
              id='assign-observer'
              onChange={(event) => {
                setObserverVisible(event.target.checked);
              }}
              type='checkbox'
            />
            {t('service.orders.observerVisible')}
          </label>
          <div className='sm:col-span-2'>
            <Button disabled={busy} size='sm' type='submit' variant='outline'>
              {busy ? <Spinner aria-hidden='true' /> : null}
              {t('service.orders.assignAction')}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
