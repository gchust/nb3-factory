import { useTranslation } from '@nocobase/i18n/client';
import { SparklesIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';

import {
  describeError,
  useResource,
  useServiceApi,
  type AssistantAnswer,
  type AssistantProposal,
} from '../../service/api.js';
import { asText } from '../../service/format.js';
import { AlertNotice, QueryState, SectionCard } from '../../service/ui.js';

/**
 * The AI service assistant. When no model service is configured the page says
 * so and answers from the published knowledge base instead of pretending. It
 * never writes on its own: a proposal is only applied after the user confirms,
 * and the server re-checks permission and idempotency at that moment.
 */
export default function AssistantPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const status = useResource('service:assistant-status', () =>
    api.assistantStatus(),
  );
  const [question, setQuestion] = useState('');
  const [ticketId, setTicketId] = useState('');
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);
  const [asking, setAsking] = useState(false);

  const ask = async (): Promise<void> => {
    if (!question.trim()) return;
    setAsking(true);
    try {
      const result = await api.assistantAsk(
        question.trim(),
        ticketId ? Number(ticketId) : undefined,
      );
      setAnswer(result);
    } catch (error) {
      toast.add({
        type: 'error',
        title: t('service.assistant.askFailed'),
        description: describeError(error),
      });
    } finally {
      setAsking(false);
    }
  };

  const confirm = async (proposal: AssistantProposal): Promise<void> => {
    try {
      await api.assistantConfirm(proposal);
      toast.add({ type: 'success', title: t('service.assistant.applied') });
    } catch (error) {
      toast.add({
        type: 'error',
        title: t('service.assistant.applyFailed'),
        description: describeError(error),
      });
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('service.assistant.title')}
        description={t('service.assistant.description')}
      />

      <QueryState
        loading={status.loading}
        error={status.error}
        onRetry={status.reload}
        skeletonRows={2}
      >
        {status.data ? (
          status.data.modelConfigured ? (
            <AlertNotice title={t('service.assistant.modelReadyTitle')}>
              {t('service.assistant.modelReady')}
            </AlertNotice>
          ) : (
            <AlertNotice title={t('service.assistant.modelMissingTitle')}>
              {t('service.assistant.modelMissing', {
                reason: status.data.reason ?? 'NO_MODEL_SERVICE_CONFIGURED',
              })}
            </AlertNotice>
          )
        ) : null}
      </QueryState>

      <SectionCard title={t('service.assistant.ask')}>
        <div className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='assistant-question'>
              {t('service.assistant.question')}
            </Label>
            <Textarea
              id='assistant-question'
              rows={3}
              value={question}
              placeholder={t('service.assistant.questionPlaceholder')}
              onChange={(event) => setQuestion(event.target.value)}
            />
          </div>
          <div className='flex flex-wrap items-end gap-3'>
            <div className='space-y-2'>
              <Label htmlFor='assistant-ticket'>
                {t('service.assistant.ticketContext')}
              </Label>
              <Input
                id='assistant-ticket'
                className='w-40'
                inputMode='numeric'
                value={ticketId}
                onChange={(event) => setTicketId(event.target.value)}
              />
            </div>
            <Button
              disabled={asking || !question.trim()}
              onClick={() => void ask()}
            >
              <SparklesIcon />
              {asking
                ? t('service.assistant.asking')
                : t('service.assistant.askAction')}
            </Button>
          </div>
        </div>
      </SectionCard>

      {answer ? (
        <SectionCard
          title={t('service.assistant.answer')}
          description={t('service.assistant.mode', {
            mode:
              answer.status.mode === 'model'
                ? t('service.assistant.modeModel')
                : t('service.assistant.modeKnowledge'),
          })}
        >
          <div className='space-y-4'>
            <p className='text-sm whitespace-pre-wrap'>{answer.answer}</p>

            {answer.citations.length > 0 ? (
              <div className='space-y-2'>
                <h4 className='text-sm font-medium'>
                  {t('service.assistant.citations')}
                </h4>
                <ul className='space-y-2'>
                  {answer.citations.map((citation) => (
                    <li
                      key={`${citation.type}-${citation.id}`}
                      className='rounded-md border p-3 text-sm'
                    >
                      <div className='flex flex-wrap items-center gap-2'>
                        <Badge variant='outline'>{citation.type}</Badge>
                        {citation.type === 'knowledge' ? (
                          <Link
                            className='font-medium hover:underline'
                            to={`/service/knowledge/${citation.id}`}
                          >
                            {citation.title}
                          </Link>
                        ) : (
                          <span className='font-medium'>{citation.title}</span>
                        )}
                      </div>
                      <p className='mt-1 text-muted-foreground'>
                        {citation.snippet}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {answer.proposals.length > 0 ? (
              <div className='space-y-2'>
                <h4 className='text-sm font-medium'>
                  {t('service.assistant.proposals')}
                </h4>
                <ul className='space-y-2'>
                  {answer.proposals.map((proposal) => (
                    <li
                      key={proposal.id}
                      className='flex flex-wrap items-center justify-between gap-3 rounded-md border p-3'
                    >
                      <div className='space-y-1 text-sm'>
                        <span className='font-medium'>{proposal.label}</span>
                        {proposal.ticketId ? (
                          <p className='text-muted-foreground'>
                            {t('service.assistant.proposalTicket', {
                              id: asText(proposal.ticketId),
                            })}
                          </p>
                        ) : null}
                        <p className='text-xs text-muted-foreground'>
                          {t('service.assistant.confirmRequired')}
                        </p>
                      </div>
                      <Button
                        variant='outline'
                        size='sm'
                        onClick={() => void confirm(proposal)}
                      >
                        {t('service.assistant.apply')}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </SectionCard>
      ) : null}
    </PageContainer>
  );
}
