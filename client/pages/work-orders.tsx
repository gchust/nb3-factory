import { useTranslation } from '@nocobase/i18n/client';
import { ChevronRight, MessageSquarePlus, Plus, RefreshCw } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';

import { AttachmentField } from '@/components/it/attachment-field.js';
import { EnumSelect } from '@/components/it/enum-select.js';
import { PageHeader } from '@/components/it/page-header.js';
import { StatusBadge } from '@/components/it/status-badge.js';
import { Loading } from '@/components/loading.js';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table.js';
import { Textarea } from '@/components/ui/textarea.js';
import {
  useItApi,
  type ItAsset,
  type ItFile,
  type ItMe,
  type ItWorkOrder,
} from '@/lib/it-api.js';
import { attachmentUrl } from '@/lib/it-files.js';
import { describeError, formatDateTime } from '@/lib/it-format.js';

const PRIORITY_VALUES = ['low', 'medium', 'high'] as const;
const WORK_ORDER_STATUS_VALUES = [
  'pending',
  'in_progress',
  'completed',
  'closed',
] as const;

const NEXT_STATUS: Record<string, string | undefined> = {
  pending: 'in_progress',
  in_progress: 'completed',
  completed: 'closed',
};

const NEXT_LABEL_KEY: Record<string, string> = {
  in_progress: 'it.workOrders.accept',
  completed: 'it.workOrders.complete',
  closed: 'it.workOrders.close',
};

export default function WorkOrdersPage(): ReactElement {
  const { t } = useTranslation();
  const api = useItApi();

  const [orders, setOrders] = useState<readonly ItWorkOrder[]>([]);
  const [me, setMe] = useState<ItMe>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<number>();
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    Promise.all([api.listWorkOrders(), api.me()]).then(
      ([list, identity]) => {
        if (!active) return;
        setOrders(list);
        setMe(identity);
        setError(undefined);
        setLoading(false);
      },
      (cause: unknown) => {
        if (!active) return;
        setError(describeError(t, cause));
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [api, t, version]);

  return (
    <section className='mx-auto w-full max-w-7xl space-y-6 px-6 py-8'>
      <PageHeader
        title={t('it.workOrders.title')}
        description={t('it.workOrders.description')}
        actions={
          <>
            <Button variant='outline' size='sm' onClick={reload}>
              <RefreshCw className='size-4' />
              {t('it.common.refresh')}
            </Button>
            <Button size='sm' onClick={() => setCreating(true)}>
              <Plus className='size-4' />
              {t('it.workOrders.new')}
            </Button>
          </>
        }
      />

      {error ? (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      ) : null}

      <div className='rounded-xl border border-border bg-card'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('it.workOrders.orderNo')}</TableHead>
              <TableHead>{t('it.workOrders.reporter')}</TableHead>
              <TableHead>{t('it.workOrders.assetOrLocation')}</TableHead>
              <TableHead>{t('it.workOrders.priority')}</TableHead>
              <TableHead>{t('it.workOrders.status')}</TableHead>
              <TableHead>{t('it.workOrders.assignee')}</TableHead>
              <TableHead>{t('it.workOrders.createdAt')}</TableHead>
              <TableHead className='text-right'>
                {t('it.common.actions')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8}>
                  <Loading label={t('it.common.loading')} />
                </TableCell>
              </TableRow>
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className='text-center text-muted-foreground'
                >
                  {t('it.workOrders.empty')}
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className='font-mono text-xs'>
                    {order.orderNo}
                  </TableCell>
                  <TableCell>{order.reporterName}</TableCell>
                  <TableCell>
                    {order.assetCode
                      ? `${order.assetCode} · ${order.assetName ?? ''}`
                      : order.location || t('it.workOrders.noAsset')}
                  </TableCell>
                  <TableCell>
                    <StatusBadge kind='priority' value={order.priority} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge kind='workOrderStatus' value={order.status} />
                  </TableCell>
                  <TableCell>{order.assignee ?? '—'}</TableCell>
                  <TableCell>{formatDateTime(order.createdAt)}</TableCell>
                  <TableCell className='text-right'>
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={() => setSelectedId(order.id)}
                    >
                      {t('it.common.open')}
                      <ChevronRight className='size-4' />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {creating ? (
        <WorkOrderEditor
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            reload();
          }}
        />
      ) : null}

      {selectedId !== undefined ? (
        <WorkOrderDetail
          key={selectedId}
          id={selectedId}
          canHandle={me?.canHandleWorkOrders ?? false}
          onClose={() => setSelectedId(undefined)}
          onChanged={reload}
        />
      ) : null}
    </section>
  );
}

function WorkOrderEditor({
  onClose,
  onSaved,
}: {
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useItApi();
  const [assets, setAssets] = useState<readonly ItAsset[]>([]);
  const [assetId, setAssetId] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [files, setFiles] = useState<readonly ItFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    // An employee may not read the asset ledger; a failed load leaves the asset optional.
    api.listAssets().then(
      (data) => {
        if (active) setAssets(data);
      },
      () => setAssets([]),
    );
    return () => {
      active = false;
    };
  }, [api]);

  const options = useMemo(
    () => [
      { value: '', label: t('it.workOrders.noAsset') },
      ...assets.map((asset) => ({
        value: String(asset.id),
        label: `${asset.assetCode} · ${asset.name}`,
      })),
    ],
    [assets, t],
  );

  const save = async () => {
    if (!description.trim()) {
      setError(t('it.errors.invalidInput'));
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await api.createWorkOrder({
        assetId: assetId ? Number(assetId) : null,
        location: location.trim() || null,
        description: description.trim(),
        priority,
        fileIds: files.map((file) => file.id),
      });
      onSaved();
    } catch (cause) {
      setError(describeError(t, cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className='max-h-[90svh] overflow-y-auto sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>{t('it.workOrders.newTitle')}</DialogTitle>
          <DialogDescription>{t('it.workOrders.formHint')}</DialogDescription>
        </DialogHeader>
        <div className='space-y-4'>
          <div className='space-y-1'>
            <Label htmlFor='wo-description'>
              {t('it.workOrders.descriptionField')}
            </Label>
            <Textarea
              id='wo-description'
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-1'>
              <Label htmlFor='wo-priority'>{t('it.workOrders.priority')}</Label>
              <EnumSelect
                id='wo-priority'
                className='w-full'
                value={priority}
                onValueChange={setPriority}
                options={PRIORITY_VALUES.map((value) => ({
                  value,
                  label: t(`it.priority.${value}`),
                }))}
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='wo-asset'>{t('it.workOrders.asset')}</Label>
              <EnumSelect
                id='wo-asset'
                className='w-full'
                value={assetId}
                onValueChange={setAssetId}
                options={options}
              />
            </div>
          </div>
          <div className='space-y-1'>
            <Label htmlFor='wo-location'>{t('it.workOrders.location')}</Label>
            <Input
              id='wo-location'
              value={location}
              onChange={(event) => setLocation(event.target.value)}
            />
          </div>
          <AttachmentField
            label={t('it.workOrders.photos')}
            value={files}
            onChange={setFiles}
            disabled={saving}
          />
        </div>
        {error ? (
          <p role='alert' className='text-sm text-destructive'>
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant='outline' onClick={onClose} disabled={saving}>
            {t('it.common.cancel')}
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? t('it.common.saving') : t('it.common.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WorkOrderDetail({
  id,
  canHandle,
  onClose,
  onChanged,
}: {
  readonly id: number;
  readonly canHandle: boolean;
  readonly onClose: () => void;
  readonly onChanged: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useItApi();
  const [order, setOrder] = useState<ItWorkOrder>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState('');
  const [target, setTarget] = useState<string>();
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    api.getWorkOrder(id).then(
      (data) => {
        if (!active) return;
        setOrder(data);
        setError(undefined);
      },
      (cause: unknown) => {
        if (active) setError(describeError(t, cause));
      },
    );
    return () => {
      active = false;
    };
  }, [api, id, t, version]);

  const advance = async (next: string) => {
    setBusy(true);
    setError(undefined);
    try {
      setOrder(await api.transitionWorkOrder(id, next));
      setTarget(undefined);
      onChanged();
    } catch (cause) {
      setError(describeError(t, cause));
    } finally {
      setBusy(false);
    }
  };

  const addLog = async () => {
    if (!log.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.addWorkOrderLog(id, log.trim());
      setLog('');
      setVersion((value) => value + 1);
    } catch (cause) {
      setError(describeError(t, cause));
    } finally {
      setBusy(false);
    }
  };

  const next = order ? NEXT_STATUS[order.status] : undefined;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className='max-h-[90svh] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <span className='font-mono'>{order?.orderNo}</span>
            {order ? (
              <StatusBadge kind='workOrderStatus' value={order.status} />
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {t('it.workOrders.detailTitle')}
          </DialogDescription>
        </DialogHeader>

        {!order ? (
          <Loading label={t('it.common.loading')} />
        ) : (
          <div className='space-y-5'>
            <dl className='grid gap-3 text-sm sm:grid-cols-2'>
              <DetailItem
                label={t('it.workOrders.reporter')}
                value={order.reporterName}
              />
              <DetailItem
                label={t('it.workOrders.assetOrLocation')}
                value={
                  order.assetCode
                    ? `${order.assetCode} · ${order.assetName ?? ''}`
                    : order.location || t('it.workOrders.noAsset')
                }
              />
              <DetailItem
                label={t('it.workOrders.priority')}
                value={t(`it.priority.${order.priority}`)}
              />
              <DetailItem
                label={t('it.workOrders.assignee')}
                value={order.assignee ?? '—'}
              />
              <DetailItem
                label={t('it.workOrders.createdAt')}
                value={formatDateTime(order.createdAt)}
              />
              <DetailItem
                label={t('it.workOrders.completedAt')}
                value={formatDateTime(order.completedAt)}
              />
            </dl>

            <div className='space-y-1'>
              <p className='text-sm font-medium'>
                {t('it.workOrders.descriptionField')}
              </p>
              <p className='text-sm whitespace-pre-wrap text-muted-foreground'>
                {order.description}
              </p>
            </div>

            <div className='space-y-2'>
              <p className='text-sm font-medium'>{t('it.workOrders.photos')}</p>
              {order.files.length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  {t('it.workOrders.noPhotos')}
                </p>
              ) : (
                <ul className='flex flex-wrap gap-2'>
                  {order.files.map((file) => (
                    <li key={file.id}>
                      <a
                        href={attachmentUrl(file)}
                        target='_blank'
                        rel='noreferrer'
                      >
                        {file.mimeType.startsWith('image/') ? (
                          <img
                            src={attachmentUrl(file)}
                            alt={file.filename}
                            className='size-20 rounded-lg border border-border object-cover'
                          />
                        ) : (
                          <span className='text-sm underline'>
                            {file.filename}
                          </span>
                        )}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className='space-y-2'>
              <p className='text-sm font-medium'>{t('it.workOrders.logs')}</p>
              {order.logs.length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  {t('it.workOrders.noLogs')}
                </p>
              ) : (
                <ol className='space-y-2 border-l border-border pl-4'>
                  {order.logs.map((entry) => (
                    <li key={entry.id} className='space-y-1'>
                      <p className='text-sm'>{entry.content}</p>
                      <p className='text-xs text-muted-foreground'>
                        {entry.authorName} · {formatDateTime(entry.createdAt)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {canHandle ? (
              <div className='space-y-3 rounded-lg border border-border bg-muted/30 p-3'>
                <div className='space-y-1'>
                  <Label htmlFor='wo-log'>{t('it.workOrders.addLog')}</Label>
                  <Textarea
                    id='wo-log'
                    rows={2}
                    value={log}
                    placeholder={t('it.workOrders.logPlaceholder')}
                    onChange={(event) => setLog(event.target.value)}
                  />
                </div>
                <div className='flex flex-wrap items-end gap-2'>
                  <div className='space-y-1'>
                    <Label htmlFor='wo-status'>
                      {t('it.workOrders.status')}
                    </Label>
                    <EnumSelect
                      id='wo-status'
                      className='w-40'
                      value={target ?? order.status}
                      onValueChange={setTarget}
                      options={WORK_ORDER_STATUS_VALUES.map((value) => ({
                        value,
                        label: t(`it.workOrderStatus.${value}`),
                      }))}
                    />
                  </div>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={busy}
                    onClick={() => void advance(target ?? order.status)}
                  >
                    {t('it.workOrders.updateStatus')}
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={busy || !log.trim()}
                    onClick={() => void addLog()}
                  >
                    <MessageSquarePlus className='size-4' />
                    {t('it.workOrders.saveLog')}
                  </Button>
                  {next ? (
                    <Button
                      size='sm'
                      disabled={busy}
                      onClick={() => void advance(next)}
                    >
                      {t(NEXT_LABEL_KEY[next] ?? 'it.workOrders.accept')}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {error ? (
          <p role='alert' className='text-sm text-destructive'>
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            {t('it.common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailItem({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <div className='space-y-0.5'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
