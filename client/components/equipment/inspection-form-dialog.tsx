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
  type InspectionRecord,
  type InspectionWrite,
} from '@/lib/equipment-api';
import {
  describeConclusion,
  INSPECTION_CONCLUSIONS,
} from '@/lib/equipment-options';
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

export interface InspectionFormDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly equipmentId: number;
  /** Present when editing an existing record; undefined when creating. */
  readonly inspection?: InspectionRecord;
  readonly api: Parameters<typeof equipmentApi.list>[0];
  readonly photoRepository: ClientFileRepository;
  readonly onSaved: (record: InspectionRecord) => void;
}

/** Formats the stored ISO timestamp for a `<input type='datetime-local'>`. */
function toLocalInput(value: string | Date | undefined): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number): string => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function InspectionFormDialog({
  open,
  onOpenChange,
  equipmentId,
  inspection,
  api,
  photoRepository,
  onSaved,
}: InspectionFormDialogProps): ReactElement {
  const { t } = useTranslation();
  const editing = inspection !== undefined;
  // Initial field state derives from the record being edited. The parent keys this
  // dialog by an open-session counter, so every open remounts the component and
  // re-runs these initializers — that is what backfills the edit form. (Base UI does
  // not invoke `onOpenChange(true)` for an external controlled open, so resetting on
  // open cannot rely on that callback.)
  const [inspectedAt, setInspectedAt] = useState(() =>
    toLocalInput(inspection?.inspectedAt),
  );
  const [inspector, setInspector] = useState(() => inspection?.inspector ?? '');
  const [conclusion, setConclusion] = useState<string>(
    () => inspection?.conclusion ?? INSPECTION_CONCLUSIONS[0],
  );
  const [photos, setPhotos] = useState<readonly FileRecord[]>(
    () => inspection?.photos ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (): Promise<void> => {
    if (!inspectedAt || !inspector.trim()) {
      setError(t('equipment.inspectionForm.required'));
      return;
    }
    const input: InspectionWrite = {
      equipmentId,
      inspectedAt: new Date(inspectedAt).toISOString(),
      inspector: inspector.trim(),
      conclusion,
      photoIds: photos.map((photo) => photo.id),
    };
    setSaving(true);
    setError(undefined);
    try {
      const saved = editing
        ? await equipmentApi.updateInspection(api, inspection.id, input)
        : await equipmentApi.createInspection(api, input);
      onSaved(saved);
      onOpenChange(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t('equipment.inspectionForm.saveFailed'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90svh] overflow-y-auto sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {editing
              ? t('equipment.inspectionForm.editTitle')
              : t('equipment.inspectionForm.createTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('equipment.inspectionForm.description')}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-4'>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='grid gap-2'>
              <Label htmlFor='inspection-at'>
                {t('equipment.inspectionForm.inspectedAt')}
              </Label>
              <Input
                id='inspection-at'
                type='datetime-local'
                value={inspectedAt}
                onChange={(event) => setInspectedAt(event.currentTarget.value)}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='inspection-inspector'>
                {t('equipment.inspectionForm.inspector')}
              </Label>
              <Input
                id='inspection-inspector'
                value={inspector}
                onChange={(event) => setInspector(event.currentTarget.value)}
              />
            </div>
          </div>
          <div className='grid gap-2'>
            <Label>{t('equipment.inspectionForm.conclusion')}</Label>
            <Select
              value={conclusion}
              onValueChange={(next) =>
                setConclusion(next ?? INSPECTION_CONCLUSIONS[0])
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder={describeConclusion(conclusion, t)} />
              </SelectTrigger>
              <SelectContent>
                {INSPECTION_CONCLUSIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {describeConclusion(option, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='grid gap-2'>
            <Label>{t('equipment.inspectionForm.photos')}</Label>
            <FileUploadField
              repository={photoRepository}
              value={photos}
              onChange={setPhotos}
              multiple
              accept={['image/*']}
              maxSize={10 * 1024 * 1024}
              maxFiles={30}
              disabled={saving}
              removeOnDelete
              onError={(uploadError) => setError(uploadError.message)}
              labels={{
                choose: t('equipment.files.choosePhotos'),
                remove: t('actions.remove'),
                retry: t('actions.retry'),
                preview: t('actions.preview'),
                download: t('actions.download'),
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
