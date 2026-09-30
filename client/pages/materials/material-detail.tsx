import { useTranslation } from '@nocobase/i18n/client';
import { Pencil } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MaterialAttachmentList } from './material-attachments.js';
import type { Material } from './types.js';

/** The read view of one material: its title, when it was saved, and every attachment with preview and download. */
export interface MaterialDetailDialogProps {
  readonly material: Material;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onEdit: () => void;
}

export function MaterialDetailDialog({
  material,
  open,
  onOpenChange,
  onEdit,
}: MaterialDetailDialogProps): ReactElement {
  const { t } = useTranslation();
  const savedAt = new Date(material.createdAt);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[calc(100vh-2rem)] flex-col overflow-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{material.title}</DialogTitle>
          <DialogDescription>
            {t('materials.savedAt', {
              date: Number.isNaN(savedAt.getTime())
                ? material.createdAt
                : savedAt.toLocaleString(),
            })}
          </DialogDescription>
        </DialogHeader>
        <MaterialAttachmentList files={material.attachments} />
        <DialogFooter>
          <Button type='button' variant='outline' onClick={onEdit}>
            <Pencil data-icon='inline-start' />
            {t('materials.editAction')}
          </Button>
          <Button type='button' onClick={() => onOpenChange(false)}>
            {t('actions.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
