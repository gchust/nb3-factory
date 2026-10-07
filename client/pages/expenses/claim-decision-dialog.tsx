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
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

export interface ClaimDecisionDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** `approve` allows an empty comment; `reject` requires one, because the applicant has to know what to fix. */
  readonly decision: 'approve' | 'reject';
  readonly claimTitle: string;
  readonly pending: boolean;
  readonly failure?: string;
  readonly onSubmit: (comment: string) => void;
}

/**
 * The confirmation for an approval decision.
 *
 * Rejecting demands a reason: the applicant is told why and edits the claim before resubmitting, so a rejection
 * without one leaves them guessing. Approving takes an optional note.
 */
export function ClaimDecisionDialog({
  open,
  onOpenChange,
  decision,
  claimTitle,
  pending,
  failure,
  onSubmit,
}: ClaimDecisionDialogProps): ReactElement {
  const { t } = useTranslation();
  const [comment, setComment] = useState('');
  const [missing, setMissing] = useState(false);

  const rejecting = decision === 'reject';

  function submit(): void {
    const trimmed = comment.trim();
    if (rejecting && !trimmed) {
      setMissing(true);
      return;
    }
    setMissing(false);
    onSubmit(trimmed);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // A dialog cannot be closed while its action runs (guideline S5).
        if (!pending) {
          onOpenChange(next);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t(
              rejecting
                ? 'expense.decision.rejectTitle'
                : 'expense.decision.approveTitle',
            )}
          </DialogTitle>
          <DialogDescription>
            {rejecting
              ? t('expense.decision.rejectDescription', { title: claimTitle })
              : t('expense.decision.approveDescription', { title: claimTitle })}
          </DialogDescription>
        </DialogHeader>

        {failure ? (
          <Alert variant='destructive'>
            <AlertCircleIcon />
            <AlertDescription>{failure}</AlertDescription>
          </Alert>
        ) : null}

        <Field data-invalid={missing ? 'true' : undefined}>
          <FieldLabel htmlFor='claim-decision-comment'>
            {t(
              rejecting
                ? 'expense.decision.reason'
                : 'expense.decision.comment',
            )}
          </FieldLabel>
          <Textarea
            id='claim-decision-comment'
            rows={3}
            maxLength={2000}
            disabled={pending}
            value={comment}
            placeholder={t(
              rejecting
                ? 'expense.decision.reasonPlaceholder'
                : 'expense.decision.commentPlaceholder',
            )}
            onChange={(event) => setComment(event.target.value)}
          />
          {missing ? (
            <FieldError>{t('expense.decision.reasonRequired')}</FieldError>
          ) : null}
        </Field>

        <DialogFooter>
          <Button
            variant='outline'
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {t('expense.actions.cancel')}
          </Button>
          <Button
            variant={rejecting ? 'destructive' : 'default'}
            disabled={pending}
            onClick={() => submit()}
          >
            {pending ? <Spinner /> : null}
            {t(
              rejecting ? 'expense.actions.reject' : 'expense.actions.approve',
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
