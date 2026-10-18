import { useTranslation } from '@nocobase/i18n/client';
import { ImagePlusIcon, XIcon } from 'lucide-react';
import {
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  useRef,
  useState,
} from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '#components/route-dialog';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Spinner } from '#components/ui/spinner';
import { Textarea } from '#components/ui/textarea';
import { useRouteOverlay } from '#components/use-route-overlay';
import { useToaster } from '@nocobase/app-client';
import {
  TICKET_URGENCIES,
  useCreateTicket,
  useUploadScreenshots,
  type TicketUrgency,
} from '#hooks/itsm';

const FORM_ID = 'ticket-new-form';

/** Submitting a ticket: the problem, its urgency, and the screenshots that show it. */
export default function NewTicketPage(): ReactElement {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('tickets.create.title')}
      description={t('tickets.create.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<NewTicketFooter submitting={submitting} />}
    >
      <NewTicketBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

function NewTicketBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<{ readonly reload: () => void }>();
  const { create } = useCreateTicket();
  const { upload } = useUploadScreenshots();
  const fileRef = useRef<HTMLInputElement>(null);
  const fileIdRef = useRef(0);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState<TicketUrgency>('medium');
  const [files, setFiles] = useState<
    readonly { readonly id: number; readonly file: File }[]
  >([]);
  const [error, setError] = useState<string | undefined>(undefined);

  function addFiles(event: ChangeEvent<HTMLInputElement>): void {
    const selected = Array.from(event.target.files ?? []);
    if (selected.length > 0) {
      setFiles((previous) =>
        [
          ...previous,
          ...selected.map((file) => ({
            id: (fileIdRef.current += 1),
            file,
          })),
        ].slice(0, 20),
      );
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  function removeFile(id: number): void {
    setFiles((previous) => previous.filter((entry) => entry.id !== id));
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError(t('tickets.create.errors.required'));
      return;
    }
    setError(undefined);
    onSubmittingChange(true);
    try {
      const screenshotIds = await upload(files.map((entry) => entry.file));
      await create({
        title: title.trim(),
        description: description.trim(),
        urgency,
        screenshotIds,
      });
      toaster.show({ type: 'success', title: t('tickets.create.success') });
      reload();
      void close();
    } catch {
      setError(t('tickets.create.errors.failed'));
    } finally {
      onSubmittingChange(false);
    }
  }

  return (
    <form
      id={FORM_ID}
      onSubmit={(event) => void handleSubmit(event)}
      className='space-y-4'
    >
      <div className='space-y-2'>
        <Label htmlFor='ticket-title'>{t('tickets.create.fields.title')}</Label>
        <Input
          id='ticket-title'
          value={title}
          maxLength={200}
          required
          autoFocus
          placeholder={t('tickets.create.fields.titlePlaceholder')}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className='space-y-2'>
        <Label htmlFor='ticket-description'>
          {t('tickets.create.fields.description')}
        </Label>
        <Textarea
          id='ticket-description'
          value={description}
          maxLength={5000}
          required
          rows={5}
          placeholder={t('tickets.create.fields.descriptionPlaceholder')}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <div className='space-y-2'>
        <Label htmlFor='ticket-urgency'>
          {t('tickets.create.fields.urgency')}
        </Label>
        <Select
          items={TICKET_URGENCIES.map((value) => ({
            value,
            label: t(`tickets.urgency.${value}`),
          }))}
          value={urgency}
          onValueChange={(value: string | null) => {
            if (value) setUrgency(value as TicketUrgency);
          }}
        >
          <SelectTrigger id='ticket-urgency' className='w-full'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TICKET_URGENCIES.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`tickets.urgency.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className='space-y-2'>
        <Label htmlFor='ticket-screenshots'>
          {t('tickets.create.fields.screenshots')}
        </Label>
        <p className='text-xs text-muted-foreground'>
          {t('tickets.create.fields.screenshotsHelp')}
        </p>
        <input
          ref={fileRef}
          id='ticket-screenshots'
          type='file'
          accept='image/*'
          multiple
          className='hidden'
          onChange={addFiles}
        />
        <div className='flex flex-wrap items-center gap-2'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlusIcon data-icon='inline-start' />
            {t('tickets.create.fields.addScreenshots')}
          </Button>
          {files.map(({ id, file }) => (
            <span
              key={id}
              className='inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs'
            >
              {file.name}
              <button
                type='button'
                aria-label={t('tickets.create.fields.removeScreenshot', {
                  name: file.name,
                })}
                className='text-muted-foreground hover:text-foreground'
                onClick={() => removeFile(id)}
              >
                <XIcon className='size-3' />
              </button>
            </span>
          ))}
        </div>
      </div>

      {error ? (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      ) : null}
    </form>
  );
}

function NewTicketFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={submitting}
        onClick={() => void close()}
      >
        {t('actions.cancel')}
      </Button>
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting ? t('actions.saving') : t('tickets.create.submit')}
      </Button>
    </>
  );
}
