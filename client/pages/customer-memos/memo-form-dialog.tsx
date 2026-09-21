import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type FormEvent, type ReactElement } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import {
  createCustomerMemo,
  updateCustomerMemo,
  type CustomerMemo,
} from './api.js';

export interface CustomerMemoFormDialogProps {
  /** The memo being edited, or null when creating a new one. */
  readonly memo: CustomerMemo | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => void;
  readonly open: boolean;
}

export function CustomerMemoFormDialog({
  memo,
  onOpenChange,
  onSaved,
  open,
}: CustomerMemoFormDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  // The parent mounts this dialog per open, so the initial values come from the
  // memo being edited and a cancelled edit never leaks into the next one.
  const [customerName, setCustomerName] = useState(memo?.customerName ?? '');
  const [note, setNote] = useState(memo?.note ?? '');
  const [nameError, setNameError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) {
      return;
    }

    const trimmedName = customerName.trim();
    if (!trimmedName) {
      setNameError(true);
      return;
    }

    setSubmitting(true);
    try {
      const input = {
        customerName: trimmedName,
        note: note.trim() ? note.trim() : null,
      };

      if (memo) {
        await updateCustomerMemo(api, memo.id, input);
      } else {
        await createCustomerMemo(api, input);
      }

      onOpenChange(false);
      onSaved();
    } catch {
      toast.error(t('customerMemos.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form noValidate onSubmit={(event) => void handleSubmit(event)}>
          <DialogHeader>
            <DialogTitle>
              {memo
                ? t('customerMemos.editTitle')
                : t('customerMemos.createTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className='space-y-4 py-2'>
            <div className='space-y-2'>
              <Label htmlFor='customer-memo-name'>
                {t('customerMemos.customerName')}
              </Label>
              <Input
                aria-invalid={nameError}
                id='customer-memo-name'
                onChange={(event) => {
                  setCustomerName(event.target.value);
                  if (nameError && event.target.value.trim()) {
                    setNameError(false);
                  }
                }}
                placeholder={t('customerMemos.customerNamePlaceholder')}
                value={customerName}
              />
              {nameError ? (
                <p className='text-sm text-destructive'>
                  {t('customerMemos.customerNameRequired')}
                </p>
              ) : null}
            </div>
            <div className='space-y-2'>
              <Label htmlFor='customer-memo-note'>
                {t('customerMemos.note')}
              </Label>
              <Textarea
                id='customer-memo-note'
                onChange={(event) => setNote(event.target.value)}
                placeholder={t('customerMemos.notePlaceholder')}
                rows={4}
                value={note}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type='button'
              variant='outline'
            >
              {t('actions.cancel')}
            </Button>
            <Button disabled={submitting} type='submit'>
              {submitting ? t('customerMemos.saving') : t('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
