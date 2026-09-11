import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { useState } from 'react';

import {
  FileUploadField,
  type FileRecord,
  type ClientFileRepository,
} from '@/extensions/nocobase-file-component-ui';
import {
  equipmentApi,
  isDeviceNoTaken,
  type EquipmentRecord,
  type EquipmentWrite,
} from '@/lib/equipment-api';
import { describeStatus, EQUIPMENT_STATUSES } from '@/lib/equipment-options';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export interface EquipmentFormDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Present when editing an existing record; undefined when creating. */
  readonly equipment?: EquipmentRecord;
  readonly api: Parameters<typeof equipmentApi.list>[0];
  readonly mainImageRepository: ClientFileRepository;
  readonly documentRepository: ClientFileRepository;
  readonly onSaved: (record: EquipmentRecord) => void;
}

export function EquipmentFormDialog({
  open,
  onOpenChange,
  equipment,
  api,
  mainImageRepository,
  documentRepository,
  onSaved,
}: EquipmentFormDialogProps): ReactElement {
  const { t } = useTranslation();
  const editing = equipment !== undefined;
  // Initial field state derives from the record being edited. The parent keys this
  // dialog by an open-session counter, so every open remounts the component and
  // re-runs these initializers — that is what backfills the edit form. (Base UI does
  // not invoke `onOpenChange(true)` for an external controlled open, so resetting on
  // open cannot rely on that callback.)
  const [deviceNo, setDeviceNo] = useState(() => equipment?.deviceNo ?? '');
  const [name, setName] = useState(() => equipment?.name ?? '');
  const [location, setLocation] = useState(() => equipment?.location ?? '');
  const [status, setStatus] = useState<string>(
    () => equipment?.status ?? EQUIPMENT_STATUSES[0],
  );
  const [owner, setOwner] = useState(() => equipment?.owner ?? '');
  const [remark, setRemark] = useState(() => equipment?.remark ?? '');
  const [mainImage, setMainImage] = useState<readonly FileRecord[]>(() =>
    equipment?.mainImage ? [equipment.mainImage] : [],
  );
  const [documents, setDocuments] = useState<readonly FileRecord[]>(
    () => equipment?.documents ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (): Promise<void> => {
    if (!deviceNo.trim() || !name.trim() || !location.trim()) {
      setError(t('equipment.form.required'));
      return;
    }
    const input: EquipmentWrite = {
      deviceNo: deviceNo.trim(),
      name: name.trim(),
      location: location.trim(),
      status,
      owner: owner.trim() || null,
      remark: remark.trim() || null,
      mainImageId: mainImage[0]?.id,
      documentIds: documents.map((document) => document.id),
    };
    setSaving(true);
    setError(undefined);
    try {
      const saved = editing
        ? await equipmentApi.update(api, equipment.id, input)
        : await equipmentApi.create(api, input);
      onSaved(saved);
      onOpenChange(false);
    } catch (caught) {
      setError(
        isDeviceNoTaken(caught)
          ? t('equipment.form.deviceNoTaken')
          : caught instanceof Error
            ? caught.message
            : t('equipment.form.saveFailed'),
      );
    } finally {
      setSaving(false);
    }
  };

  const fileLabels = {
    remove: t('actions.remove'),
    retry: t('actions.retry'),
    preview: t('actions.preview'),
    download: t('actions.download'),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90svh] overflow-y-auto sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {editing
              ? t('equipment.form.editTitle')
              : t('equipment.form.createTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('equipment.form.description')}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-4'>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='grid gap-2'>
              <Label htmlFor='equipment-device-no'>
                {t('equipment.fields.deviceNo')}
              </Label>
              <Input
                id='equipment-device-no'
                value={deviceNo}
                onChange={(event) => setDeviceNo(event.currentTarget.value)}
                placeholder='DEV-CNC-001'
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='equipment-name'>
                {t('equipment.fields.name')}
              </Label>
              <Input
                id='equipment-name'
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='equipment-location'>
                {t('equipment.fields.location')}
              </Label>
              <Input
                id='equipment-location'
                value={location}
                onChange={(event) => setLocation(event.currentTarget.value)}
              />
            </div>
            <div className='grid gap-2'>
              <Label>{t('equipment.fields.status')}</Label>
              <Select
                value={status}
                onValueChange={(next) =>
                  setStatus(next ?? EQUIPMENT_STATUSES[0])
                }
              >
                <SelectTrigger className='w-full'>
                  <SelectValue placeholder={describeStatus(status, t)} />
                </SelectTrigger>
                <SelectContent>
                  {EQUIPMENT_STATUSES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {describeStatus(option, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='equipment-owner'>
                {t('equipment.fields.owner')}
              </Label>
              <Input
                id='equipment-owner'
                value={owner}
                onChange={(event) => setOwner(event.currentTarget.value)}
              />
            </div>
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='equipment-remark'>
              {t('equipment.fields.remark')}
            </Label>
            <Textarea
              id='equipment-remark'
              value={remark}
              onChange={(event) => setRemark(event.currentTarget.value)}
            />
          </div>
          <div className='grid gap-2'>
            <Label>{t('equipment.form.mainImage')}</Label>
            <FileUploadField
              repository={mainImageRepository}
              value={mainImage}
              onChange={setMainImage}
              multiple={false}
              accept={['image/*']}
              maxSize={10 * 1024 * 1024}
              disabled={saving}
              removeOnDelete
              onError={(uploadError) => setError(uploadError.message)}
              labels={{
                choose: t('equipment.files.chooseImage'),
                ...fileLabels,
              }}
            />
          </div>
          <div className='grid gap-2'>
            <Label>{t('equipment.form.documents')}</Label>
            <FileUploadField
              repository={documentRepository}
              value={documents}
              onChange={setDocuments}
              multiple
              accept={[
                '.txt',
                'image/*',
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              ]}
              maxSize={50 * 1024 * 1024}
              maxFiles={20}
              disabled={saving}
              removeOnDelete
              onError={(uploadError) => setError(uploadError.message)}
              labels={{
                choose: t('equipment.files.chooseDocuments'),
                ...fileLabels,
              }}
            />
          </div>
          {error ? (
            <p role='alert' className='text-sm text-destructive'>
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
          >
            {t('actions.cancel')}
          </Button>
          <Button type='button' onClick={() => void submit()} disabled={saving}>
            {saving ? t('equipment.form.saving') : t('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
