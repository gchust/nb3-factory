import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useActionFeedback } from '@/pages/service/service-api.js';

/**
 * The manual step between an assistant suggestion and a saved draft.
 *
 * The assistant never writes a business record on its own. A person presses
 * "suggest into draft" to move the suggestion into an editable box, can
 * cancel, and only then presses "confirm save" to persist it. Saving a draft
 * deliberately does not change the ticket status or close the ticket — that
 * remains the separate "submit result" transition — and the panel says so.
 */
export interface AssistantDraftPanelProps {
  /** The assistant's suggested text, from `resolutionNoteDraft`. */
  suggestion: string;
  /** The draft already stored on the ticket, when the caller knows it. */
  savedDraft?: string | null;
  /** Persists the confirmed draft. Rejecting shows the real failure. */
  onSave?: (draft: string) => Promise<void>;
  /** Whether the signed-in user may persist a draft in this context. */
  canSave: boolean;
  /** Why confirmation is unavailable, shown beside the disabled button. */
  saveBlockedReason?: string;
  /** Copies a confirmed draft into the resolution-note editor. */
  onApplyToNote?: (draft: string) => void;
}

export function AssistantDraftPanel({
  suggestion,
  savedDraft,
  onSave,
  canSave,
  saveBlockedReason,
  onApplyToNote,
}: AssistantDraftPanelProps): ReactElement {
  const { t } = useTranslation();
  const feedback = useActionFeedback();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  // The draft saved in this mount; the record's own value is the fallback, so
  // a reload through the prop needs no effect to stay aligned.
  const [localSaved, setLocalSaved] = useState<string | null>(null);
  const lastSaved = localSaved ?? (savedDraft?.trim() || null);

  const adopt = (): void => {
    setDraft(suggestion);
    setEditing(true);
  };

  const cancel = (): void => {
    setDraft('');
    setEditing(false);
  };

  const confirm = async (): Promise<void> => {
    if (!onSave) return;
    const text = draft.trim();
    if (text === '') return;
    setBusy(true);
    try {
      await onSave(text);
      setLocalSaved(text);
      setEditing(false);
      feedback.success(t('service.assistant.draftSaved'));
    } catch (error) {
      feedback.failure(error);
    } finally {
      setBusy(false);
    }
  };

  const applyDraft = lastSaved ?? draft.trim();

  return (
    <div className='space-y-2 rounded-md border border-dashed p-3'>
      <Label>{t('service.assistant.draftPanelTitle')}</Label>
      <p className='whitespace-pre-wrap text-sm text-muted-foreground'>
        {suggestion.trim() === ''
          ? t('service.assistant.draftEmpty')
          : suggestion}
      </p>
      {lastSaved ? (
        <p className='whitespace-pre-wrap text-xs text-muted-foreground'>
          {t('service.assistant.draftSavedLabel')}: {lastSaved}
        </p>
      ) : null}

      {editing ? (
        <div className='space-y-2'>
          <Textarea
            value={draft}
            aria-label={t('service.assistant.draftPanelTitle')}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className='flex flex-wrap gap-2'>
            <Button
              variant='outline'
              size='sm'
              disabled={busy}
              onClick={cancel}
            >
              {t('service.assistant.cancelDraft')}
            </Button>
            <Button
              size='sm'
              disabled={busy || !canSave || draft.trim() === ''}
              onClick={() => void confirm()}
            >
              {t('service.assistant.confirmSave')}
            </Button>
          </div>
          {!canSave && saveBlockedReason ? (
            <p className='text-xs text-muted-foreground'>{saveBlockedReason}</p>
          ) : null}
        </div>
      ) : (
        <div className='flex flex-wrap gap-2'>
          <Button
            variant='outline'
            size='sm'
            disabled={suggestion.trim() === ''}
            onClick={adopt}
          >
            {t('service.assistant.adoptDraft')}
          </Button>
          {onApplyToNote && applyDraft !== '' ? (
            <Button
              variant='outline'
              size='sm'
              onClick={() => onApplyToNote(applyDraft)}
            >
              {t('service.assistant.applyToNote')}
            </Button>
          ) : null}
        </div>
      )}

      <p className='text-xs text-muted-foreground'>
        {t('service.assistant.noAutoClose')}
      </p>
    </div>
  );
}
