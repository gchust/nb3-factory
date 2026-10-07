import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';

import { formatAmount } from './claim-format.js';
import { EXPENSE_PAYMENT_METHODS, type ExpensePaymentMethod } from './types.js';

export interface ClaimPayDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly claimTitle: string;
  readonly claimNo: string;
  readonly totalAmount: number;
  readonly pending: boolean;
  readonly failure?: string;
  readonly onSubmit: (
    paymentMethod: ExpensePaymentMethod,
    paymentRemark: string,
  ) => void;
}

/**
 * Finance registering a payment.
 *
 * The payment method is required so the record says how the money left, and the remark is optional. Once this
 * succeeds the claim is `paid` and can no longer be edited, which the copy states before the button is pressed.
 */
export function ClaimPayDialog({
  open,
  onOpenChange,
  claimTitle,
  claimNo,
  totalAmount,
  pending,
  failure,
  onSubmit,
}: ClaimPayDialogProps): ReactElement {
  const { t } = useTranslation();
  const [method, setMethod] = useState<ExpensePaymentMethod | ''>('');
  const [remark, setRemark] = useState('');
  const [missing, setMissing] = useState(false);

  const items = EXPENSE_PAYMENT_METHODS.map((value) => ({
    value,
    label: t(`expense.paymentMethod.${value}`),
  }));

  function submit(): void {
    if (!method) {
      setMissing(true);
      return;
    }
    setMissing(false);
    onSubmit(method, remark.trim());
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) {
          onOpenChange(next);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('expense.pay.title')}</DialogTitle>
          <DialogDescription>
            {t('expense.pay.description', { no: claimNo, title: claimTitle })}
          </DialogDescription>
        </DialogHeader>

        {failure ? (
          <Alert variant='destructive'>
            <AlertCircleIcon />
            <AlertDescription>{failure}</AlertDescription>
          </Alert>
        ) : null}

        <p className='text-sm'>
          {t('expense.pay.amount')}:{' '}
          <span className='font-medium tabular-nums'>
            {formatAmount(totalAmount)}
          </span>
        </p>

        <Field data-invalid={missing ? 'true' : undefined}>
          <FieldLabel>{t('expense.fields.paymentMethod')}</FieldLabel>
          <Select
            items={items}
            value={method || undefined}
            disabled={pending}
            onValueChange={(value) => setMethod(value as ExpensePaymentMethod)}
          >
            <SelectTrigger
              className='w-full'
              aria-label={t('expense.fields.paymentMethod')}
            >
              <SelectValue placeholder={t('expense.pay.chooseMethod')} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {missing ? (
            <FieldError>{t('expense.pay.methodRequired')}</FieldError>
          ) : null}
        </Field>

        <Field>
          <FieldLabel htmlFor='claim-pay-remark'>
            {t('expense.fields.paymentRemark')}
          </FieldLabel>
          <Input
            id='claim-pay-remark'
            maxLength={255}
            disabled={pending}
            value={remark}
            onChange={(event) => setRemark(event.target.value)}
          />
          <FieldDescription>{t('expense.pay.lockedHint')}</FieldDescription>
        </Field>

        <DialogFooter>
          <Button
            variant='outline'
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {t('expense.actions.cancel')}
          </Button>
          <Button disabled={pending} onClick={() => submit()}>
            {pending ? <Spinner /> : null}
            {t('expense.actions.pay')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
