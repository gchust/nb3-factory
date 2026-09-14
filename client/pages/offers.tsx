import { apiClientToken, useService } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import {
  EmptyState,
  EnumBadge,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  PageSection,
  Panel,
} from '@/components/recruiting/ui';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  createOffer,
  listCandidates,
  listOffers,
  updateOffer,
} from '@/lib/recruiting-api';
import { errorText, useAsyncData } from '@/lib/recruiting-hooks';

const OFFER_STATUSES = ['pending', 'accepted', 'declined'];

interface FormState {
  candidateId: string;
  position: string;
  salary: string;
  expectedStartDate: string;
  status: string;
}

const EMPTY_FORM: FormState = {
  candidateId: '',
  position: '',
  salary: '',
  expectedStartDate: '',
  status: 'pending',
};

export default function OffersPage(): ReactElement {
  const { t } = useTranslation();
  const client = useService(apiClientToken);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const candidates = useAsyncData(() => listCandidates(client), []);
  const offers = useAsyncData(() => listOffers(client), []);

  async function save(): Promise<void> {
    setBusy(true);
    setNotice('');
    try {
      await createOffer(client, {
        candidateId: Number(form.candidateId),
        position: form.position,
        salary: form.salary ? Number(form.salary) : null,
        expectedStartDate: form.expectedStartDate || null,
        status: form.status,
      });
      setOpen(false);
      setNotice(t('recruiting.offers.saved'));
      offers.reload();
    } catch (error) {
      setNotice(errorText(error, t('recruiting.state.error')));
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(id: number, status: string): Promise<void> {
    setNotice('');
    try {
      await updateOffer(client, id, { status });
      offers.reload();
    } catch (error) {
      setNotice(errorText(error, t('recruiting.state.error')));
    }
  }

  return (
    <PageSection>
      <PageHeader
        title={t('recruiting.offers.title')}
        description={t('recruiting.offers.description')}
        actions={
          <Button
            onClick={() => {
              setForm(EMPTY_FORM);
              setNotice('');
              setOpen(true);
            }}
          >
            <Plus aria-hidden />
            {t('recruiting.offers.new')}
          </Button>
        }
      />

      {notice ? (
        <p role='status' className='text-sm text-muted-foreground'>
          {notice}
        </p>
      ) : null}

      <Panel>
        {offers.status === 'loading' ? (
          <LoadingState label={t('recruiting.state.loading')} />
        ) : null}
        {offers.status === 'error' ? (
          <ErrorState
            message={offers.message ?? t('recruiting.state.error')}
            onRetry={offers.reload}
          />
        ) : null}
        {offers.status === 'ready' && (offers.data?.length ?? 0) === 0 ? (
          <EmptyState label={t('recruiting.offers.empty')} />
        ) : null}
        {offers.status === 'ready' && (offers.data?.length ?? 0) > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('recruiting.fields.candidate')}</TableHead>
                <TableHead>{t('recruiting.fields.position')}</TableHead>
                <TableHead>{t('recruiting.fields.salary')}</TableHead>
                <TableHead>
                  {t('recruiting.fields.expectedStartDate')}
                </TableHead>
                <TableHead>{t('recruiting.fields.status')}</TableHead>
                <TableHead className='text-right'>
                  {t('recruiting.fields.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {offers.data?.map((offer) => (
                <TableRow key={offer.id}>
                  <TableCell className='font-medium'>
                    {offer.candidateName ?? `#${offer.candidateId}`}
                  </TableCell>
                  <TableCell>{offer.position}</TableCell>
                  <TableCell className='tabular-nums'>
                    {offer.salary ?? '—'}
                  </TableCell>
                  <TableCell>
                    {offer.expectedStartDate
                      ? String(offer.expectedStartDate).slice(0, 10)
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <EnumBadge kind='offerStatus' value={offer.status} />
                  </TableCell>
                  <TableCell className='text-right'>
                    <div className='flex justify-end gap-1'>
                      {offer.status !== 'accepted' ? (
                        <Button
                          variant='ghost'
                          size='sm'
                          onClick={() =>
                            void changeStatus(offer.id, 'accepted')
                          }
                        >
                          {t('recruiting.offers.accept')}
                        </Button>
                      ) : null}
                      {offer.status !== 'declined' ? (
                        <Button
                          variant='ghost'
                          size='sm'
                          onClick={() =>
                            void changeStatus(offer.id, 'declined')
                          }
                        >
                          {t('recruiting.offers.decline')}
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </Panel>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('recruiting.offers.new')}</DialogTitle>
          </DialogHeader>
          <form
            className='grid gap-3'
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <Field label={t('recruiting.fields.candidate')}>
              <Select
                value={form.candidateId}
                onValueChange={(value) =>
                  setForm({ ...form, candidateId: value ?? '' })
                }
              >
                <SelectTrigger aria-label={t('recruiting.fields.candidate')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(candidates.data ?? []).map((candidate) => (
                    <SelectItem key={candidate.id} value={String(candidate.id)}>
                      {candidate.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('recruiting.fields.position')}>
              <Input
                required
                value={form.position}
                onChange={(event) =>
                  setForm({ ...form, position: event.target.value })
                }
              />
            </Field>
            <Field label={t('recruiting.fields.salary')}>
              <Input
                type='number'
                min={0}
                value={form.salary}
                onChange={(event) =>
                  setForm({ ...form, salary: event.target.value })
                }
              />
            </Field>
            <Field label={t('recruiting.fields.expectedStartDate')}>
              <Input
                type='date'
                value={form.expectedStartDate}
                onChange={(event) =>
                  setForm({ ...form, expectedStartDate: event.target.value })
                }
              />
            </Field>
            <Field label={t('recruiting.fields.status')}>
              <Select
                value={form.status}
                onValueChange={(value) =>
                  setForm({ ...form, status: value ?? '' })
                }
              >
                <SelectTrigger aria-label={t('recruiting.fields.status')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OFFER_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {t(`recruiting.enums.offerStatus.${status}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setOpen(false)}
              >
                {t('actions.cancel')}
              </Button>
              <Button
                type='submit'
                disabled={busy || !form.candidateId || !form.position}
              >
                {busy ? t('recruiting.state.saving') : t('actions.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageSection>
  );
}
