import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  ArrowLeft,
  FileText,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  User,
  Wrench,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router';

import {
  clientFileRepositoryManagerToken,
  FileList,
  type FileRecord,
} from '@/extensions/nocobase-file-component-ui';
import { isRecordNotFoundError } from '@/extensions/nocobase-file-component-ui/lib/file-error';
import { ConfirmDialog } from '@/components/equipment/confirm-dialog';
import { EquipmentFormDialog } from '@/components/equipment/equipment-form-dialog';
import { InspectionFormDialog } from '@/components/equipment/inspection-form-dialog';
import { PhotoGrid } from '@/components/equipment/photo-grid';
import { Loading } from '@/components/loading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  equipmentApi,
  type EquipmentRecord,
  type InspectionRecord,
} from '@/lib/equipment-api';
import {
  describeConclusion,
  describeStatus,
  statusBadgeVariant,
} from '@/lib/equipment-options';

function formatDateTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

export default function EquipmentDetailPage(): ReactElement {
  const { t } = useTranslation();
  const api = useService(apiClientToken);
  const fileManager = useService(clientFileRepositoryManagerToken);
  const navigate = useNavigate();
  const params = useParams();
  const equipmentId = Number(params.id);
  const validId = Number.isSafeInteger(equipmentId) && equipmentId > 0;

  const repositories = useMemo(
    () =>
      ({
        mainImage: fileManager.repository('equipmentMainImages'),
        document: fileManager.repository('equipmentDocuments'),
        photo: fileManager.repository('inspectionPhotos'),
      }) as const,
    [fileManager],
  );

  const [record, setRecord] = useState<EquipmentRecord>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [reloading, setReloading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [formSession, setFormSession] = useState(0);
  // Bumped on every dialog open so the form dialogs remount with a fresh key and
  // backfill from the records being edited (see EquipmentFormDialog /
  // InspectionFormDialog).
  const [inspectionEditor, setInspectionEditor] = useState<
    InspectionRecord | 'create'
  >();
  const [deletingInspection, setDeletingInspection] =
    useState<InspectionRecord>();
  const [deletingInspectionBusy, setDeletingInspectionBusy] = useState(false);
  const [deletingEquipment, setDeletingEquipment] = useState(false);
  const [deletingEquipmentBusy, setDeletingEquipmentBusy] = useState(false);
  const [fileError, setFileError] = useState<string>();

  // Initial load keeps every state update in an async continuation so no
  // setState runs synchronously inside the effect.
  useEffect(() => {
    void (async () => {
      try {
        setRecord(await equipmentApi.get(api, equipmentId));
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : t('equipment.detail.loadFailed'),
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [equipmentId, api, t]);

  const reload = async (): Promise<void> => {
    if (!validId) {
      setLoading(false);
      setError(t('equipment.detail.invalidId'));
      return;
    }
    setReloading(true);
    setError(undefined);
    try {
      setRecord(await equipmentApi.get(api, equipmentId));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t('equipment.detail.loadFailed'),
      );
    } finally {
      setLoading(false);
      setReloading(false);
    }
  };

  const deleteDocument = async (file: FileRecord): Promise<void> => {
    setFileError(undefined);
    try {
      await repositories.document.deleteOne({ filter: { id: file.id } });
    } catch (caught) {
      // The record is already gone (double-click, or a reload made this stale
      // row visible). That is the outcome asked for; refresh instead of
      // surfacing a raw repository error.
      if (!isRecordNotFoundError(caught)) {
        setFileError(
          caught instanceof Error
            ? caught.message
            : t('equipment.detail.fileDeleteFailed'),
        );
        return;
      }
    }
    await reload();
  };

  const deletePhoto = async (file: FileRecord): Promise<void> => {
    setFileError(undefined);
    try {
      await repositories.photo.deleteOne({ filter: { id: file.id } });
    } catch (caught) {
      if (!isRecordNotFoundError(caught)) {
        setFileError(
          caught instanceof Error
            ? caught.message
            : t('equipment.detail.fileDeleteFailed'),
        );
        return;
      }
    }
    await reload();
  };

  const confirmDeleteInspection = async (): Promise<void> => {
    if (!deletingInspection) return;
    setDeletingInspectionBusy(true);
    try {
      await equipmentApi.removeInspection(api, deletingInspection.id);
      setDeletingInspection(undefined);
      await reload();
    } catch (caught) {
      setFileError(
        caught instanceof Error
          ? caught.message
          : t('equipment.detail.deleteInspectionFailed'),
      );
      setDeletingInspection(undefined);
    } finally {
      setDeletingInspectionBusy(false);
    }
  };

  const confirmDeleteEquipment = async (): Promise<void> => {
    setDeletingEquipmentBusy(true);
    try {
      await equipmentApi.remove(api, equipmentId);
      void navigate('/equipment');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t('equipment.list.deleteFailed'),
      );
      setDeletingEquipment(false);
    } finally {
      setDeletingEquipmentBusy(false);
    }
  };

  if (loading)
    return <Loading label={t('equipment.detail.loading')} fullscreen />;

  if (error || !record) {
    return (
      <section className='mx-auto w-full max-w-3xl space-y-4 px-6 py-10'>
        <h1 className='font-heading text-2xl font-semibold tracking-tight'>
          {t('equipment.detail.title')}
        </h1>
        <p role='alert' className='text-sm text-destructive'>
          {error ?? t('equipment.detail.notFound')}
        </p>
        <Button
          type='button'
          variant='outline'
          onClick={() => void navigate('/equipment')}
        >
          <ArrowLeft aria-hidden='true' />
          {t('equipment.detail.back')}
        </Button>
      </section>
    );
  }

  return (
    <section className='mx-auto w-full max-w-6xl space-y-6 px-6 py-10'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex items-center gap-3'>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            aria-label={t('equipment.detail.back')}
            title={t('equipment.detail.back')}
            onClick={() => void navigate('/equipment')}
          >
            <ArrowLeft aria-hidden='true' />
          </Button>
          <div>
            <h1 className='flex items-center gap-2 font-heading text-2xl font-semibold tracking-tight'>
              {record.name}
              <Badge variant={statusBadgeVariant(record.status)}>
                {describeStatus(record.status, t)}
              </Badge>
            </h1>
            <p className='text-muted-foreground'>{record.deviceNo}</p>
          </div>
        </div>
        <div className='flex items-center gap-2'>
          <Button
            type='button'
            variant='outline'
            onClick={() => {
              setFormSession((session) => session + 1);
              setEditOpen(true);
            }}
          >
            <Pencil aria-hidden='true' />
            {t('equipment.detail.edit')}
          </Button>
          <Button
            type='button'
            variant='ghost'
            onClick={() => setDeletingEquipment(true)}
          >
            <Trash2 aria-hidden='true' />
            {t('equipment.detail.delete')}
          </Button>
        </div>
      </div>

      {reloading ? <Loading label={t('equipment.detail.loading')} /> : null}

      <div className='grid gap-6 lg:grid-cols-3'>
        <Card className='lg:col-span-1'>
          <CardHeader>
            <CardTitle>{t('equipment.detail.overview')}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            {record.mainImage?.contentUrl ? (
              <div className='overflow-hidden rounded-lg border'>
                <img
                  src={record.mainImage.contentUrl}
                  alt={record.name}
                  className='aspect-video w-full object-cover'
                />
              </div>
            ) : (
              <div className='flex aspect-video items-center justify-center rounded-lg border border-dashed text-muted-foreground'>
                <Wrench className='size-8' aria-hidden='true' />
              </div>
            )}
            <dl className='space-y-2 text-sm'>
              <div className='flex items-start justify-between gap-4'>
                <dt className='flex items-center gap-1.5 text-muted-foreground'>
                  <MapPin className='size-3.5' aria-hidden='true' />
                  {t('equipment.fields.location')}
                </dt>
                <dd>{record.location}</dd>
              </div>
              <div className='flex items-start justify-between gap-4'>
                <dt className='flex items-center gap-1.5 text-muted-foreground'>
                  <User className='size-3.5' aria-hidden='true' />
                  {t('equipment.fields.owner')}
                </dt>
                <dd>{record.owner ?? '-'}</dd>
              </div>
              <div className='flex items-start justify-between gap-4'>
                <dt className='flex items-center gap-1.5 text-muted-foreground'>
                  <Wrench className='size-3.5' aria-hidden='true' />
                  {t('equipment.fields.status')}
                </dt>
                <dd>{describeStatus(record.status, t)}</dd>
              </div>
              {record.remark ? (
                <div className='flex items-start justify-between gap-4'>
                  <dt className='text-muted-foreground'>
                    {t('equipment.fields.remark')}
                  </dt>
                  <dd className='text-right'>{record.remark}</dd>
                </div>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        <Card className='lg:col-span-2'>
          <CardHeader className='flex-row items-center justify-between'>
            <CardTitle className='flex items-center gap-2'>
              <FileText className='size-4' aria-hidden='true' />
              {t('equipment.detail.documents')}
              <Badge variant='secondary'>{record.documents.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FileList
              files={record.documents}
              onRemove={(file) => void deleteDocument(file)}
              onError={(caught) => setFileError(caught.message)}
              emptyState={
                <p className='text-sm text-muted-foreground'>
                  {t('equipment.detail.noDocuments')}
                </p>
              }
              labels={{
                preview: t('actions.preview'),
                download: t('actions.download'),
                remove: t('actions.remove'),
              }}
            />
            {fileError ? (
              <p role='alert' className='mt-3 text-sm text-destructive'>
                {fileError}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className='flex-row items-center justify-between'>
          <CardTitle className='flex items-center gap-2'>
            <Wrench className='size-4' aria-hidden='true' />
            {t('equipment.detail.inspections')}
            <Badge variant='secondary'>{record.inspections.length}</Badge>
          </CardTitle>
          <Button
            type='button'
            onClick={() => {
              setFormSession((session) => session + 1);
              setInspectionEditor('create');
            }}
          >
            <Plus aria-hidden='true' />
            {t('equipment.detail.newInspection')}
          </Button>
        </CardHeader>
        <CardContent className='space-y-4'>
          {record.inspections.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('equipment.detail.noInspections')}
            </p>
          ) : (
            record.inspections.map((inspection) => (
              <div key={inspection.id} className='rounded-lg border p-4'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <span className='font-medium'>
                      {formatDateTime(inspection.inspectedAt)}
                    </span>
                    <Badge variant='secondary'>{inspection.inspector}</Badge>
                    <Badge
                      variant={conclusionBadgeVariant(inspection.conclusion)}
                    >
                      {describeConclusion(inspection.conclusion, t)}
                    </Badge>
                  </div>
                  <div className='flex items-center gap-1'>
                    <Button
                      type='button'
                      size='icon'
                      variant='ghost'
                      aria-label={t('equipment.detail.editInspection')}
                      title={t('equipment.detail.editInspection')}
                      onClick={() => {
                        setFormSession((session) => session + 1);
                        setInspectionEditor(inspection);
                      }}
                    >
                      <Pencil aria-hidden='true' />
                    </Button>
                    <Button
                      type='button'
                      size='icon'
                      variant='ghost'
                      aria-label={t('equipment.detail.deleteInspection')}
                      title={t('equipment.detail.deleteInspection')}
                      onClick={() => setDeletingInspection(inspection)}
                    >
                      <Trash2 aria-hidden='true' />
                    </Button>
                  </div>
                </div>
                <div className='mt-3'>
                  <PhotoGrid
                    name={`${inspection.inspector}-${inspection.id}`}
                    photos={inspection.photos}
                    emptyText={t('equipment.detail.noPhotos')}
                    previewLabel={t('actions.preview')}
                    removeLabel={t('actions.remove')}
                    onDelete={(photo) => void deletePhoto(photo)}
                    onError={(caught) => setFileError(caught.message)}
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <EquipmentFormDialog
        key={`equipment:${formSession}`}
        open={editOpen}
        onOpenChange={setEditOpen}
        equipment={record}
        api={api}
        mainImageRepository={repositories.mainImage}
        documentRepository={repositories.document}
        onSaved={() => void reload()}
      />

      <InspectionFormDialog
        key={`inspection:${formSession}`}
        open={inspectionEditor !== undefined}
        onOpenChange={(next) => {
          if (!next) setInspectionEditor(undefined);
        }}
        equipmentId={record.id}
        inspection={
          inspectionEditor === 'create' ? undefined : inspectionEditor
        }
        api={api}
        photoRepository={repositories.photo}
        onSaved={() => void reload()}
      />

      <ConfirmDialog
        open={deletingInspection !== undefined}
        onOpenChange={(next) => {
          if (!next) setDeletingInspection(undefined);
        }}
        title={t('equipment.deleteInspectionDialog.title')}
        description={
          deletingInspection
            ? t('equipment.deleteInspectionDialog.description', {
                date: formatDateTime(deletingInspection.inspectedAt),
              })
            : undefined
        }
        confirmLabel={t('equipment.deleteInspectionDialog.confirm')}
        busy={deletingInspectionBusy}
        onConfirm={() => void confirmDeleteInspection()}
      />

      <ConfirmDialog
        open={deletingEquipment}
        onOpenChange={setDeletingEquipment}
        title={t('equipment.deleteEquipmentDialog.title')}
        description={t('equipment.deleteEquipmentDialog.description', {
          deviceNo: record.deviceNo,
        })}
        confirmLabel={t('equipment.deleteEquipmentDialog.confirm')}
        busy={deletingEquipmentBusy}
        onConfirm={() => void confirmDeleteEquipment()}
      />
    </section>
  );
}

function conclusionBadgeVariant(
  conclusion: string,
): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (conclusion) {
    case 'normal':
      return 'default';
    case 'issue':
      return 'secondary';
    case 'major':
      return 'destructive';
    default:
      return 'secondary';
  }
}
