import { useTranslation } from '@nocobase/i18n/client';
import { Plus, RefreshCw, Undo2 } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';

import { EnumSelect } from '@/components/it/enum-select.js';
import { PageHeader } from '@/components/it/page-header.js';
import { Loading } from '@/components/loading.js';
import { Badge } from '@/components/ui/badge.js';
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
import { useItApi, type ItAsset, type ItAssignment } from '@/lib/it-api.js';
import {
  describeError,
  formatDate,
  toDateInputValue,
} from '@/lib/it-format.js';

export default function AssetAssignmentsPage(): ReactElement {
  const { t } = useTranslation();
  const api = useItApi();

  const [assignments, setAssignments] = useState<readonly ItAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [creating, setCreating] = useState(false);
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    api.listAssignments().then(
      (data) => {
        if (!active) return;
        setAssignments(data);
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
    <section className='mx-auto w-full max-w-6xl space-y-6 px-6 py-8'>
      <PageHeader
        title={t('it.assignments.title')}
        description={t('it.assignments.description')}
        actions={
          <>
            <Button variant='outline' size='sm' onClick={reload}>
              <RefreshCw className='size-4' />
              {t('it.common.refresh')}
            </Button>
            <Button size='sm' onClick={() => setCreating(true)}>
              <Plus className='size-4' />
              {t('it.assignments.new')}
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
              <TableHead>{t('it.assignments.asset')}</TableHead>
              <TableHead>{t('it.assignments.employee')}</TableHead>
              <TableHead>{t('it.assignments.assignedAt')}</TableHead>
              <TableHead>{t('it.assignments.returnedAt')}</TableHead>
              <TableHead>{t('it.assignments.note')}</TableHead>
              <TableHead className='text-right'>
                {t('it.common.actions')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && assignments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <Loading label={t('it.common.loading')} />
                </TableCell>
              </TableRow>
            ) : assignments.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className='text-center text-muted-foreground'
                >
                  {t('it.assignments.empty')}
                </TableCell>
              </TableRow>
            ) : (
              assignments.map((assignment) => (
                <TableRow key={assignment.id}>
                  <TableCell>
                    <div className='font-mono text-xs'>
                      {assignment.assetCode ?? '—'}
                    </div>
                    <div>{assignment.assetName ?? '—'}</div>
                  </TableCell>
                  <TableCell>{assignment.employeeName}</TableCell>
                  <TableCell>{formatDate(assignment.assignedAt)}</TableCell>
                  <TableCell>
                    {assignment.returnedAt ? (
                      formatDate(assignment.returnedAt)
                    ) : (
                      <Badge variant='default'>
                        {t('it.assignments.open')}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{assignment.note ?? '—'}</TableCell>
                  <TableCell>
                    {assignment.returnedAt ? null : (
                      <ReturnControl
                        assignment={assignment}
                        onReturned={reload}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {creating ? (
        <AssignmentEditor
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            reload();
          }}
        />
      ) : null}
    </section>
  );
}

function ReturnControl({
  assignment,
  onReturned,
}: {
  readonly assignment: ItAssignment;
  readonly onReturned: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useItApi();
  const [date, setDate] = useState(() =>
    toDateInputValue(new Date().toISOString()),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await api.returnAssignment(
        assignment.id,
        date ? new Date(`${date}T00:00:00.000Z`).toISOString() : null,
      );
      onReturned();
    } catch (cause) {
      setError(describeError(t, cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className='flex items-center justify-end gap-2'>
      <Input
        aria-label={t('it.assignments.returnDate')}
        type='date'
        className='h-8 w-36'
        value={date}
        disabled={busy}
        onChange={(event) => setDate(event.target.value)}
      />
      <Button
        variant='outline'
        size='sm'
        disabled={busy}
        onClick={() => void submit()}
      >
        <Undo2 className='size-4' />
        {t('it.assignments.return')}
      </Button>
      {error ? (
        <span role='alert' className='text-xs text-destructive'>
          {error}
        </span>
      ) : null}
    </div>
  );
}

function AssignmentEditor({
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
  const [employeeName, setEmployeeName] = useState('');
  const [assignedAt, setAssignedAt] = useState(() =>
    toDateInputValue(new Date().toISOString()),
  );
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    // Errors surface when the form is submitted; the list simply stays empty.
    api.listAssets().then(
      (data) => {
        if (active) setAssets(data);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [api]);

  const options = useMemo(
    () =>
      assets.map((asset) => ({
        value: String(asset.id),
        label: `${asset.assetCode} · ${asset.name}`,
      })),
    [assets],
  );

  const save = async () => {
    if (!assetId) {
      setError(t('it.assignments.selectAsset'));
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await api.createAssignment({
        assetId: Number(assetId),
        employeeName: employeeName.trim(),
        assignedAt: assignedAt
          ? new Date(`${assignedAt}T00:00:00.000Z`).toISOString()
          : null,
        note: note.trim() || null,
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
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('it.assignments.newTitle')}</DialogTitle>
          <DialogDescription>{t('it.assignments.formHint')}</DialogDescription>
        </DialogHeader>
        <div className='space-y-4'>
          <div className='space-y-1'>
            <Label htmlFor='assignment-asset'>
              {t('it.assignments.asset')}
            </Label>
            <EnumSelect
              id='assignment-asset'
              className='w-full'
              value={assetId}
              onValueChange={setAssetId}
              placeholder={t('it.assignments.selectAsset')}
              options={options}
            />
          </div>
          <div className='space-y-1'>
            <Label htmlFor='assignment-employee'>
              {t('it.assignments.employee')}
            </Label>
            <Input
              id='assignment-employee'
              value={employeeName}
              onChange={(event) => setEmployeeName(event.target.value)}
            />
          </div>
          <div className='space-y-1'>
            <Label htmlFor='assignment-date'>
              {t('it.assignments.assignedAt')}
            </Label>
            <Input
              id='assignment-date'
              type='date'
              value={assignedAt}
              onChange={(event) => setAssignedAt(event.target.value)}
            />
          </div>
          <div className='space-y-1'>
            <Label htmlFor='assignment-note'>{t('it.assignments.note')}</Label>
            <Input
              id='assignment-note'
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
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
            {saving ? t('it.common.saving') : t('it.common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
