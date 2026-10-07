import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { ImageIcon, XIcon } from 'lucide-react';
import {
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  useRef,
  useState,
} from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '@/components/route-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useRouteOverlay } from '@/components/use-route-overlay';

import { createTicket } from './api.js';
import {
  TICKET_URGENCIES,
  type TicketsOutletContext,
  type TicketUrgency,
} from './types.js';

const FORM_ID = 'ticket-create-form';
const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;

/** Read a picked file into a data URL, rejecting when the browser cannot read it. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () =>
      reject(reader.error ?? new Error('Failed to read the file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Decode a data URL as an image. A file that claims an image type but is corrupt or is not
 * really an image fails here, so the reporter gets explicit feedback instead of a broken
 * preview that only surfaces after the ticket is submitted.
 */
function isDecodableImage(dataUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = dataUrl;
  });
}

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
  const api = useApiClient();
  const toaster = useToaster();
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<TicketsOutletContext>();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState<TicketUrgency>('normal');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const submittingGuardRef = useRef(false);

  const urgencyItems = TICKET_URGENCIES.map((value) => ({
    value,
    label: t(`tickets.urgency.${value}`),
  }));

  async function onPickFile(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(t('tickets.form.screenshotUnsupported'));
      return;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      setError(t('tickets.form.screenshotTooLarge'));
      return;
    }
    const dataUrl = await readAsDataUrl(file).catch(() => null);
    if (!dataUrl || !(await isDecodableImage(dataUrl))) {
      setError(t('tickets.form.screenshotInvalid'));
      return;
    }
    setScreenshot(dataUrl);
    setError(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submittingGuardRef.current) return;
    if (!title.trim() || !description.trim()) {
      setError(t('tickets.form.required'));
      return;
    }
    submittingGuardRef.current = true;
    onSubmittingChange(true);
    try {
      await createTicket(api, {
        title: title.trim(),
        description: description.trim(),
        urgency,
        screenshot,
      });
      toaster.show({ type: 'success', title: t('tickets.messages.created') });
      reload();
      await close();
    } catch (caught) {
      const forbidden =
        caught instanceof ApiClientError && caught.status === 403;
      setError(
        forbidden
          ? t('tickets.error.forbidden')
          : t('tickets.error.requestFailed'),
      );
    } finally {
      submittingGuardRef.current = false;
      onSubmittingChange(false);
    }
  }

  return (
    <form
      id={FORM_ID}
      className='space-y-4'
      onSubmit={(event) => {
        void onSubmit(event);
      }}
    >
      <div className='space-y-2'>
        <Label htmlFor='ticket-title'>{t('tickets.form.title')}</Label>
        <Input
          id='ticket-title'
          value={title}
          maxLength={255}
          required
          placeholder={t('tickets.form.titlePlaceholder')}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='ticket-description'>
          {t('tickets.form.description')}
        </Label>
        <Textarea
          id='ticket-description'
          value={description}
          required
          rows={4}
          placeholder={t('tickets.form.descriptionPlaceholder')}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='ticket-urgency'>{t('tickets.form.urgency')}</Label>
        <Select
          items={urgencyItems}
          value={urgency}
          onValueChange={(value) => setUrgency(value as TicketUrgency)}
        >
          <SelectTrigger id='ticket-urgency' className='w-full'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {urgencyItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className='space-y-2'>
        <Label htmlFor='ticket-screenshot'>
          {t('tickets.form.screenshot')}
        </Label>
        <input
          id='ticket-screenshot'
          ref={fileRef}
          type='file'
          accept='image/*'
          className='sr-only'
          onChange={(event) => void onPickFile(event)}
        />
        {screenshot ? (
          <div className='flex items-center gap-3'>
            <img
              src={screenshot}
              alt={t('tickets.form.screenshotPreview')}
              className='h-20 w-20 rounded-md border object-cover'
            />
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => setScreenshot(null)}
            >
              <XIcon data-icon='inline-start' />
              {t('tickets.form.screenshotRemove')}
            </Button>
          </div>
        ) : (
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => fileRef.current?.click()}
          >
            <ImageIcon data-icon='inline-start' />
            {t('tickets.form.screenshotChoose')}
          </Button>
        )}
        <p className='text-xs text-muted-foreground'>
          {t('tickets.form.screenshotHint')}
        </p>
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
        {submitting ? t('actions.saving') : t('actions.create')}
      </Button>
    </>
  );
}
