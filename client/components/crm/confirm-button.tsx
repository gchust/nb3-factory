import { useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

export type ConfirmButtonVariant =
  'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link';
export type ConfirmButtonSize =
  'default' | 'sm' | 'xs' | 'lg' | 'icon' | 'icon-sm';

export function ConfirmButton({
  children,
  title,
  description,
  confirmLabel,
  variant = 'ghost',
  size = 'sm',
  onConfirm,
}: {
  children: ReactNode;
  title: string;
  description?: string;
  confirmLabel?: string;
  variant?: ConfirmButtonVariant;
  size?: ConfirmButtonSize;
  onConfirm: () => void | Promise<void>;
}): ReactElement {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button size={size} variant={variant} />}>
        {children}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('crm.common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              void onConfirm();
              setOpen(false);
            }}
          >
            {confirmLabel ?? t('crm.common.confirmDelete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
