import { ArrowLeft } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { Link, useParams } from 'react-router';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import { useInspectionApi } from '../../components/inspection/api.js';
import { PhotoGallery } from '../../components/inspection/photo-gallery.js';
import {
  formatDateTime,
  RESULT_KEYS,
} from '../../components/inspection/format.js';
import { useInspectionUser } from '../../components/inspection/use-inspection-user.js';
import {
  canDeletePhoto,
  canManageRecord,
  type InspectionRecord,
  type InspectionResult,
} from '../../components/inspection/types.js';

export default function RecordDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useInspectionApi();
  const { recordId } = useParams();
  const id = Number(recordId);
  const { user } = useInspectionUser();
  const [record, setRecord] = useState<InspectionRecord>();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<string>();
  const [actionError, setActionError] = useState(false);
  const [result, setResult] = useState<InspectionResult>('normal');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const validId = Number.isInteger(id) && id > 0;

  const load = useCallback(async () => {
    const next = await api.record(id);
    setRecord(next);
    setResult(next.result);
    setDescription(next.description ?? '');
    setNotFound(false);
  }, [api, id]);

  useEffect(() => {
    if (!validId) return;
    let active = true;
    api
      .record(id)
      .then((next) => {
        if (!active) return;
        setRecord(next);
        setResult(next.result);
        setDescription(next.description ?? '');
        setNotFound(false);
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setNotFound(true);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [api, id, validId]);

  if (loading && validId) {
    return (
      <section className='p-6 text-sm text-muted-foreground'>
        {t('inspection.detail.loading')}
      </section>
    );
  }

  if (!validId || notFound || !record) {
    return (
      <section className='space-y-4 p-6'>
        <Alert variant='destructive'>
          <AlertDescription>{t('inspection.detail.notFound')}</AlertDescription>
        </Alert>
        <Button render={<Link to='/inspection/records' />} variant='outline'>
          <ArrowLeft />
          {t('inspection.detail.back')}
        </Button>
      </section>
    );
  }

  const mayManage = canManageRecord(user?.role ?? 'none');
  const mayDelete = canDeletePhoto(
    user?.role ?? 'none',
    record.createdById,
    user?.id,
  );

  const deletePhoto = async (fileId: string): Promise<void> => {
    setActionError(false);
    setDeletingFileId(fileId);
    try {
      await api.deletePhoto(record.id, fileId);
      await load();
    } catch {
      setActionError(true);
    } finally {
      setDeletingFileId(undefined);
    }
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    setSaved(false);
    setActionError(false);
    try {
      await api.updateRecord(record.id, { result, description });
      setSaved(true);
      await load();
    } catch {
      setActionError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className='mx-auto w-full max-w-4xl space-y-6 p-6'>
      <div className='flex items-center justify-between gap-4'>
        <h1 className='font-heading text-2xl font-semibold tracking-tight'>
          {t('inspection.detail.title', { id: record.id })}
        </h1>
        <Button render={<Link to='/inspection/records' />} variant='outline'>
          <ArrowLeft />
          {t('inspection.detail.back')}
        </Button>
      </div>

      <Card>
        <CardContent className='grid gap-4 pt-6 sm:grid-cols-2'>
          <Field
            label={t('inspection.detail.device')}
            value={`${record.deviceCode ?? ''} ${record.deviceName ?? ''}`.trim()}
          />
          <Field
            label={t('inspection.detail.plan')}
            value={record.planName ?? '—'}
          />
          <div className='space-y-1'>
            <p className='text-xs text-muted-foreground'>
              {t('inspection.detail.result')}
            </p>
            <Badge
              variant={
                record.result === 'abnormal' ? 'destructive' : 'secondary'
              }
            >
              {t(RESULT_KEYS[record.result])}
            </Badge>
          </div>
          <Field
            label={t('inspection.detail.team')}
            value={record.team ?? '—'}
          />
          <Field
            label={t('inspection.detail.creator')}
            value={record.createdByName ?? '—'}
          />
          <Field
            label={t('inspection.detail.createdAt')}
            value={formatDateTime(record.createdAt)}
          />
          <div className='sm:col-span-2 space-y-1'>
            <p className='text-xs text-muted-foreground'>
              {t('inspection.detail.description')}
            </p>
            <p className='text-sm'>{record.description ?? '—'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>
            {t('inspection.detail.photos')}
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          {actionError ? (
            <Alert variant='destructive'>
              <AlertDescription>
                {t('inspection.detail.actionFailed')}
              </AlertDescription>
            </Alert>
          ) : null}
          <PhotoGallery
            canDelete={mayDelete}
            deletingFileId={deletingFileId}
            onDelete={(fileId) => void deletePhoto(fileId)}
            photos={record.photos ?? []}
          />
        </CardContent>
      </Card>

      {mayManage ? (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>
              {t('inspection.detail.update')}
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-5'>
            <div className='space-y-2'>
              <Label htmlFor='detail-result'>
                {t('inspection.detail.result')}
              </Label>
              <Select
                value={result}
                onValueChange={(value) =>
                  setResult(value === 'abnormal' ? 'abnormal' : 'normal')
                }
              >
                <SelectTrigger className='w-full' id='detail-result'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='normal'>
                    {t(RESULT_KEYS.normal)}
                  </SelectItem>
                  <SelectItem value='abnormal'>
                    {t(RESULT_KEYS.abnormal)}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='detail-description'>
                {t('inspection.detail.description')}
              </Label>
              <Textarea
                id='detail-description'
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                value={description}
              />
            </div>
            {saved ? (
              <Alert>
                <AlertDescription>
                  {t('inspection.detail.saved')}
                </AlertDescription>
              </Alert>
            ) : null}
            <div className='flex justify-end'>
              <Button
                disabled={saving}
                onClick={() => void save()}
                type='button'
              >
                {saving ? t('inspection.detail.saving') : t('actions.save')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}

function Field({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <div className='space-y-1'>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p className='text-sm'>{value}</p>
    </div>
  );
}
