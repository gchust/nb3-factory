import { useApiClient, useToaster, type ApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  useCallback,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';
import { useParams } from 'react-router';

import { createKnowledge, getKnowledge, updateKnowledge } from '@/api/service';
import type { RepairKnowledge } from '@/api/service-types';
import { RouteDialog } from '@/components/route-dialog';
import { ServiceErrorNotice } from '@/components/service/feedback';
import { FormField, SelectControl } from '@/components/service/form-field';
import { useServiceOutlet } from '@/components/service/outlet-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useRouteOverlay } from '@/components/use-route-overlay';
import { useServiceResource } from '@/hooks/use-service-resource';

interface KnowledgeFields {
  readonly title: string;
  readonly category: string;
  readonly content: string;
  readonly status: 'draft' | 'published';
}

const EMPTY: KnowledgeFields = {
  title: '',
  category: '',
  content: '',
  status: 'draft',
};

const FORM_ID = 'knowledge-form';

/**
 * Create or edit a knowledge entry.
 *
 * The status is part of the form rather than a separate publish dialog, so a
 * supervisor writing a new entry can keep it as a draft or release it in one
 * step. An engineer never reaches this page: the create and update endpoints
 * require the manage action and refuse them independently of the button.
 *
 * `useRouteOverlay()` may only be called inside the overlay, so this page owns
 * only the submit state and returns `RouteDialog`; the form body and the footer
 * buttons are components rendered inside it.
 */
export default function KnowledgeFormPage(): ReactElement {
  const { t } = useTranslation();
  const { knowledgeId } = useParams();
  const id = knowledgeId === undefined ? undefined : Number(knowledgeId);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean): void => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      beforeClose={() => !submittingRef.current}
      className='sm:max-w-2xl'
      footer={<KnowledgeFormFooter submitting={submitting} />}
      title={
        id === undefined
          ? t('service.knowledge.createTitle')
          : t('service.knowledge.editTitle')
      }
    >
      <KnowledgeFormBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

function KnowledgeFormBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const { knowledgeId } = useParams();
  const id = knowledgeId === undefined ? undefined : Number(knowledgeId);
  const { close } = useRouteOverlay();
  const { reload: reloadList } = useServiceOutlet();

  const load = useCallback(
    (client: ApiClient, signal: AbortSignal) =>
      id === undefined
        ? Promise.resolve<RepairKnowledge | null>(null)
        : getKnowledge(client, id, signal),
    [id],
  );
  const entry = useServiceResource<RepairKnowledge | null>(
    `service-knowledge-entry:${String(id)}`,
    load,
  );
  const [draft, setDraft] = useState<KnowledgeFields | null>(null);
  const [error, setError] = useState<unknown>(null);

  const form: KnowledgeFields =
    draft ??
    (entry.data
      ? {
          title: entry.data.title,
          category: entry.data.category ?? '',
          content: entry.data.content,
          status: entry.data.status === 'published' ? 'published' : 'draft',
        }
      : EMPTY);

  function update<K extends keyof KnowledgeFields>(
    key: K,
    value: KnowledgeFields[K],
  ): void {
    setDraft({ ...form, [key]: value });
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (form.title.trim() === '' || form.content.trim() === '') return;
    onSubmittingChange(true);
    setError(null);
    const payload = {
      title: form.title.trim(),
      category: form.category.trim() || null,
      content: form.content,
      status: form.status,
    };
    try {
      if (id === undefined) {
        await createKnowledge(api, {
          ...payload,
          category: payload.category,
        });
        toaster.show({
          type: 'success',
          title: t('service.knowledge.created'),
        });
      } else {
        await updateKnowledge(api, id, payload);
        toaster.show({
          type: 'success',
          title: t('service.knowledge.updated'),
        });
      }
      reloadList();
      await close();
    } catch (submitError) {
      setError(submitError);
    } finally {
      onSubmittingChange(false);
    }
  }

  return (
    <>
      {entry.error ? (
        <ServiceErrorNotice error={entry.error} onRetry={entry.reload} />
      ) : null}
      {error ? <ServiceErrorNotice error={error} /> : null}
      {entry.isPending ? (
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          <Spinner aria-hidden='true' />
          {t('service.common.loading')}
        </div>
      ) : (
        <form
          className='grid gap-4'
          id={FORM_ID}
          onSubmit={(event) => void submit(event)}
        >
          <FormField
            htmlFor='knowledge-title'
            label={t('service.knowledge.entryTitle')}
            required
          >
            <Input
              id='knowledge-title'
              onChange={(event) => {
                update('title', event.target.value);
              }}
              required
              value={form.title}
            />
          </FormField>
          <div className='grid gap-4 sm:grid-cols-2'>
            <FormField
              htmlFor='knowledge-category'
              label={t('service.knowledge.category')}
            >
              <Input
                id='knowledge-category'
                onChange={(event) => {
                  update('category', event.target.value);
                }}
                value={form.category}
              />
            </FormField>
            <FormField
              htmlFor='knowledge-status'
              label={t('service.knowledge.status')}
            >
              <SelectControl
                id='knowledge-status'
                onChange={(value) => {
                  update(
                    'status',
                    value === 'published' ? 'published' : 'draft',
                  );
                }}
                options={[
                  { value: 'draft', label: t('service.knowledgeStatus.draft') },
                  {
                    value: 'published',
                    label: t('service.knowledgeStatus.published'),
                  },
                ]}
                value={form.status}
              />
            </FormField>
          </div>
          <FormField
            htmlFor='knowledge-content'
            label={t('service.knowledge.content')}
            required
          >
            <Textarea
              id='knowledge-content'
              onChange={(event) => {
                update('content', event.target.value);
              }}
              required
              rows={12}
              value={form.content}
            />
          </FormField>
        </form>
      )}
    </>
  );
}

function KnowledgeFormFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { knowledgeId } = useParams();
  const { close } = useRouteOverlay();
  return (
    <>
      <Button
        disabled={submitting}
        onClick={() => {
          void close();
        }}
        type='button'
        variant='ghost'
      >
        {t('service.actions.cancel')}
      </Button>
      <Button disabled={submitting} form={FORM_ID} type='submit'>
        {submitting ? <Spinner aria-hidden='true' /> : null}
        {knowledgeId === undefined
          ? t('service.actions.create')
          : t('service.actions.save')}
      </Button>
    </>
  );
}
