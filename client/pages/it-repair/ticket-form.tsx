import { useTranslation } from '@nocobase/i18n/client';
import { type FormEvent, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import { TICKET_CATEGORIES, type CreateTicketInput } from './api.js';

export interface TicketFormDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly submitting: boolean;
  readonly onSubmit: (input: CreateTicketInput) => void;
}

function value(data: FormData, name: string): string {
  const entry = data.get(name);
  return typeof entry === 'string' ? entry.trim() : '';
}

/** The new-ticket form. Title is required; category is limited to the three supported values. */
export function TicketFormDialog({
  open,
  onOpenChange,
  submitting,
  onSubmit,
}: TicketFormDialogProps): ReactElement {
  const { t } = useTranslation();

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = value(data, 'title');
    if (!title) return;
    const description = value(data, 'description');
    const category = (value(data, 'category') ||
      'computer') as CreateTicketInput['category'];
    onSubmit({
      title,
      category,
      description: description || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t('itRepair.form.title')}</DialogTitle>
            <DialogDescription>
              {t('itRepair.form.description')}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className='py-4'>
            <Field>
              <FieldLabel htmlFor='ticket-title'>
                {t('itRepair.form.titleLabel')}
              </FieldLabel>
              <Input
                id='ticket-title'
                name='title'
                required
                maxLength={255}
                placeholder={t('itRepair.form.titlePlaceholder')}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='ticket-category'>
                {t('itRepair.form.categoryLabel')}
              </FieldLabel>
              <Select name='category' defaultValue='computer'>
                <SelectTrigger id='ticket-category' className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {t(`itRepair.category.${category}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor='ticket-description'>
                {t('itRepair.form.descriptionLabel')}
              </FieldLabel>
              <Textarea
                id='ticket-description'
                name='description'
                rows={4}
                maxLength={5000}
                placeholder={t('itRepair.form.descriptionPlaceholder')}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              {t('actions.cancel')}
            </Button>
            <Button type='submit' disabled={submitting}>
              {submitting
                ? t('itRepair.form.submitting')
                : t('itRepair.form.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
