import { useState, type FormEvent, type ReactElement } from 'react';
import { useTranslation } from '@nocobase/i18n/client';

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
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

import type { CustomerMemo, MemoFormValues } from './types.js';

export interface MemoFormDialogProps {
  readonly open: boolean;
  readonly memo: CustomerMemo | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (values: MemoFormValues) => Promise<void>;
}

/** Create or edit a memo. The empty customer name is rejected locally. */
export function MemoFormDialog({
  memo,
  open,
  onOpenChange,
  onSubmit,
}: MemoFormDialogProps): ReactElement {
  const { t } = useTranslation();
  const [customerName, setCustomerName] = useState(memo?.customerName ?? '');
  const [content, setContent] = useState(memo?.content ?? '');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = customerName.trim();
    if (!trimmedName) {
      setFieldError(t('memos.customerNameRequired'));
      return;
    }

    setFieldError(null);
    setFormError(null);
    setSubmitting(true);

    try {
      await onSubmit({ customerName: trimmedName, content: content.trim() });
    } catch {
      setFormError(t('memos.saveFailed'));
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!submitting) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {memo ? t('memos.editTitle') : t('memos.createTitle')}
          </DialogTitle>
          <DialogDescription>{t('memos.formDescription')}</DialogDescription>
        </DialogHeader>
        <form
          className='space-y-4'
          noValidate
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <div className='space-y-2'>
            <Label htmlFor='memo-customer-name'>
              {t('memos.customerName')}
            </Label>
            <Input
              id='memo-customer-name'
              value={customerName}
              autoFocus
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={
                fieldError ? 'memo-customer-name-error' : undefined
              }
              onChange={(event) => {
                setCustomerName(event.target.value);
                if (fieldError) {
                  setFieldError(null);
                }
              }}
            />
            {fieldError ? (
              <p
                id='memo-customer-name-error'
                role='alert'
                className='text-sm text-destructive'
              >
                {fieldError}
              </p>
            ) : null}
          </div>
          <div className='space-y-2'>
            <Label htmlFor='memo-content'>{t('memos.content')}</Label>
            <Textarea
              id='memo-content'
              value={content}
              rows={4}
              onChange={(event) => setContent(event.target.value)}
            />
          </div>
          {formError ? (
            <p role='alert' className='text-sm text-destructive'>
              {formError}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              {t('actions.cancel')}
            </Button>
            <Button type='submit' disabled={submitting}>
              {submitting ? <Spinner /> : null}
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
