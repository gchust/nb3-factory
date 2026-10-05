/**
 * Equipment — the machines a repair request and an inspection point at.
 *
 * A supervisor maintains the register; an engineer sees the equipment their
 * work orders cover. Disabling a machine keeps its history readable but stops
 * new repair requests, which the register shows in place instead of hiding.
 */
import {
  type FormEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { format } from 'date-fns';
import { PencilIcon, PlusIcon, SearchIcon, XIcon } from 'lucide-react';

import { DatePicker } from '@/components/date-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { useServiceApi, type ServiceList } from './api.js';
import { formText, formatDateTime, useLoad } from './data.js';
import {
  EmptyState,
  LoadFailure,
  Loading,
  Pagination,
  ServicePage,
} from './parts.js';
import type { CustomerView, EquipmentView, MemberView } from './types.js';

export default function EquipmentPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<EquipmentView | null>(null);
  const [creating, setCreating] = useState(false);

  const state = useLoad(
    useCallback(
      () =>
        api.get<ServiceList<EquipmentView>>('/equipment', {
          search: query,
          page,
          pageSize: 20,
        }),
      [api, query, page],
    ),
  );

  // Typing filters without pressing Enter, and Enter, blur and the clear button
  // commit immediately so the result never lags behind the field.
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setQuery(search.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const commit = (value: string): void => {
    setPage(1);
    setQuery(value.trim());
  };

  return (
    <ServicePage
      title={t('service.equipment.title')}
      description={t('service.equipment.description')}
      actions={
        <Button onClick={() => setCreating(true)}>
          <PlusIcon className='size-4' />
          {t('service.equipment.create')}
        </Button>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>
            {t('service.common.search')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='relative max-w-sm'>
            <SearchIcon className='pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground' />
            <Input
              className='pe-8 ps-8'
              value={search}
              placeholder={t('service.equipment.searchPlaceholder')}
              onChange={(event) => setSearch(event.target.value)}
              onBlur={() => commit(search)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  commit(event.currentTarget.value);
                }
              }}
            />
            {search ? (
              <Button
                variant='ghost'
                size='icon-sm'
                className='absolute end-1 top-1/2 -translate-y-1/2'
                aria-label={t('service.common.clearSearch')}
                onClick={() => {
                  setSearch('');
                  commit('');
                }}
              >
                <XIcon className='size-3.5' />
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {state.loading ? <Loading /> : null}
      {state.error ? (
        <LoadFailure message={state.error} onRetry={() => state.reload()} />
      ) : null}
      {state.data ? (
        <Card>
          <CardContent className='space-y-4 pt-6'>
            {state.data.rows.length === 0 ? (
              <EmptyState message={t('service.equipment.empty')} />
            ) : (
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('service.equipment.code')}</TableHead>
                      <TableHead>{t('service.equipment.name')}</TableHead>
                      <TableHead>{t('service.equipment.model')}</TableHead>
                      <TableHead>{t('service.equipment.customer')}</TableHead>
                      <TableHead>{t('service.equipment.engineer')}</TableHead>
                      <TableHead>
                        {t('service.equipment.nextInspection')}
                      </TableHead>
                      <TableHead>{t('service.equipment.state')}</TableHead>
                      <TableHead className='text-right'>
                        {t('service.common.actions')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {state.data.rows.map((row) => (
                      <TableRow key={String(row.id)}>
                        <TableCell className='font-mono text-xs'>
                          {row.code}
                        </TableCell>
                        <TableCell className='font-medium'>
                          {row.name}
                        </TableCell>
                        <TableCell>{row.model ?? '—'}</TableCell>
                        <TableCell>{row.customer?.name ?? '—'}</TableCell>
                        <TableCell>
                          {row.serviceEngineer?.name ?? '—'}
                        </TableCell>
                        <TableCell className='text-xs text-muted-foreground'>
                          {formatDateTime(row.nextInspectionDate)}
                        </TableCell>
                        <TableCell>
                          {row.enabled === false ? (
                            <Badge variant='outline'>
                              {t('service.equipment.disabled')}
                            </Badge>
                          ) : (
                            <Badge variant='secondary'>
                              {t('service.equipment.enabled')}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className='text-right'>
                          <Button
                            variant='ghost'
                            size='icon-sm'
                            aria-label={t('service.common.edit')}
                            onClick={() => setEditing(row)}
                          >
                            <PencilIcon className='size-3.5' />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <Pagination
              page={state.data.page}
              pageSize={state.data.pageSize}
              total={state.data.total}
              onPage={setPage}
            />
          </CardContent>
        </Card>
      ) : null}

      <EquipmentDialog
        key={editing ? `edit-${editing.id}` : 'create'}
        open={creating || editing !== null}
        equipment={editing}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          state.reload();
        }}
      />
    </ServicePage>
  );
}

function EquipmentDialog({
  equipment,
  onOpenChange,
  onSaved,
  open,
}: {
  readonly equipment: EquipmentView | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => void;
  readonly open: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const [busy, setBusy] = useState(false);
  const [customerId, setCustomerId] = useState(
    equipment?.customerId ? String(equipment.customerId) : '',
  );
  const [engineerMemberId, setEngineerMemberId] = useState(
    equipment?.engineerMemberId ? String(equipment.engineerMemberId) : '',
  );
  const [enabled, setEnabled] = useState(equipment?.enabled !== false);
  // The picker works on a local `Date`; the hidden input carries the same value
  // to `FormData` as `yyyy-MM-dd`. Parsing the stored day as local midnight keeps
  // it from drifting a day when the browser is behind UTC.
  const [nextInspectionDate, setNextInspectionDate] = useState<
    Date | undefined
  >(() =>
    equipment?.nextInspectionDate
      ? new Date(`${equipment.nextInspectionDate.slice(0, 10)}T00:00:00`)
      : undefined,
  );

  const options = useLoad(
    useCallback(async () => {
      const [customers, engineers] = await Promise.all([
        api.get<ServiceList<CustomerView>>('/customers', { pageSize: 200 }),
        api.get<MemberView[]>('/engineers'),
      ]);
      return {
        customers,
        engineers: engineers.filter((row) => row.kind === 'engineer'),
      };
    }, [api]),
  );

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      code: formText(data, 'code'),
      name: formText(data, 'name'),
      model: formText(data, 'model'),
      location: formText(data, 'location'),
      nextInspectionDate: formText(data, 'nextInspectionDate') || null,
      customerId: Number(customerId),
      engineerMemberId: engineerMemberId ? Number(engineerMemberId) : null,
      enabled,
    };
    setBusy(true);
    try {
      if (equipment) {
        await api.patch(`/equipment/${equipment.id}`, payload);
      } else {
        await api.post('/equipment', payload);
      }
      onSaved();
    } catch (error) {
      api.report(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {equipment
                ? t('service.equipment.edit')
                : t('service.equipment.create')}
            </DialogTitle>
            <DialogDescription>
              {t('service.equipment.dialogHint')}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className='py-4'>
            <div className='grid gap-4 sm:grid-cols-2'>
              <Field>
                <FieldLabel htmlFor='equipment-code'>
                  {t('service.equipment.code')}
                </FieldLabel>
                <Input
                  id='equipment-code'
                  name='code'
                  required
                  defaultValue={equipment?.code ?? ''}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='equipment-name'>
                  {t('service.equipment.name')}
                </FieldLabel>
                <Input
                  id='equipment-name'
                  name='name'
                  defaultValue={equipment?.name ?? ''}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='equipment-model'>
                  {t('service.equipment.model')}
                </FieldLabel>
                <Input
                  id='equipment-model'
                  name='model'
                  defaultValue={equipment?.model ?? ''}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='equipment-location'>
                  {t('service.equipment.location')}
                </FieldLabel>
                <Input
                  id='equipment-location'
                  name='location'
                  defaultValue={equipment?.location ?? ''}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='equipment-customer'>
                  {t('service.equipment.customer')}
                </FieldLabel>
                <Select
                  value={customerId}
                  onValueChange={(value) => setCustomerId(String(value))}
                >
                  <SelectTrigger id='equipment-customer' className='w-full'>
                    <SelectValue
                      placeholder={t('service.common.selectPlaceholder')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(options.data?.customers.rows ?? []).map((row) => (
                      <SelectItem key={String(row.id)} value={String(row.id)}>
                        {row.name ?? `#${row.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor='equipment-engineer'>
                  {t('service.equipment.engineer')}
                </FieldLabel>
                <Select
                  value={engineerMemberId || 'none'}
                  onValueChange={(value) =>
                    setEngineerMemberId(value === 'none' ? '' : String(value))
                  }
                >
                  <SelectTrigger id='equipment-engineer' className='w-full'>
                    <SelectValue
                      placeholder={t('service.common.selectPlaceholder')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='none'>
                      {t('service.common.none')}
                    </SelectItem>
                    {(options.data?.engineers ?? []).map((row) => (
                      <SelectItem key={String(row.id)} value={String(row.id)}>
                        {row.name ?? row.ref ?? `#${row.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor='equipment-next'>
                  {t('service.equipment.nextInspection')}
                </FieldLabel>
                <DatePicker
                  id='equipment-next'
                  className='w-full'
                  value={nextInspectionDate}
                  onChange={setNextInspectionDate}
                />
                <input
                  type='hidden'
                  name='nextInspectionDate'
                  value={
                    nextInspectionDate
                      ? format(nextInspectionDate, 'yyyy-MM-dd')
                      : ''
                  }
                />
              </Field>
              <Field>
                <div className='flex items-center gap-2 pt-6'>
                  <Switch
                    id='equipment-enabled'
                    checked={enabled}
                    onCheckedChange={(value) => setEnabled(Boolean(value))}
                  />
                  <Label htmlFor='equipment-enabled'>
                    {t('service.equipment.enabled')}
                  </Label>
                </div>
              </Field>
            </div>
          </FieldGroup>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              {t('service.common.cancel')}
            </Button>
            <Button type='submit' disabled={busy || !customerId}>
              {t('service.common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
