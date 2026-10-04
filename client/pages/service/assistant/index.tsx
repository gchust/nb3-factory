import { useTranslation } from '@nocobase/i18n/client';
import { SendIcon, SparklesIcon } from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToaster } from '@nocobase/app-client';

import { useServiceRequest } from '../api.js';
import type { AssistantDraft, KnowledgeRecord } from '../api.js';

type Language = 'zh-CN' | 'en-US';

export default function AssistantPage(): ReactElement {
  const { t } = useTranslation();
  const request = useServiceRequest();
  const toaster = useToaster();
  const [question, setQuestion] = useState('');
  const [language, setLanguage] = useState<Language>('zh-CN');
  const [draft, setDraft] = useState<AssistantDraft | null>(null);
  const [matches, setMatches] = useState<readonly KnowledgeRecord[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!question.trim()) return;
    setPending(true);
    setError(null);
    try {
      const [result, search] = await Promise.all([
        request<AssistantDraft>('/service/assistant/draft', {
          method: 'POST',
          json: { question: question.trim(), language },
        }),
        request<readonly KnowledgeRecord[]>('/service/assistant/search', {
          query: { q: question.trim() },
        }),
      ]);
      setDraft(result);
      setMatches(search);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      toaster.show({ type: 'error', title: t('service.error.title') });
    } finally {
      setPending(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('service.assistant.title')}
        description={t('service.assistant.description')}
      />

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <SparklesIcon className='size-4' />
            {t('service.assistant.ask')}
          </CardTitle>
          <CardDescription>{t('service.assistant.askHint')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className='space-y-4'
            onSubmit={(event) => {
              void ask(event);
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel>{t('service.assistant.question')}</FieldLabel>
                <Textarea
                  rows={3}
                  placeholder={t('service.assistant.questionPlaceholder')}
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel>{t('service.assistant.language')}</FieldLabel>
                <select
                  className='h-8 w-40 rounded-lg border border-input bg-transparent px-2 text-sm'
                  value={language}
                  onChange={(event) =>
                    setLanguage(event.target.value as Language)
                  }
                >
                  <option value='zh-CN'>{t('service.language.zhCN')}</option>
                  <option value='en-US'>{t('service.language.enUS')}</option>
                </select>
              </Field>
            </FieldGroup>
            <Button disabled={pending || !question.trim()} type='submit'>
              <SendIcon data-icon='inline-start' />
              {t('service.assistant.generate')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant='destructive'>
          <AlertTitle>{t('service.error.title')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {draft ? (
        <div className='grid gap-4 lg:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>{t('service.assistant.draft')}</CardTitle>
              <CardDescription>
                {draft.language === 'zh-CN'
                  ? t('service.language.zhCN')
                  : t('service.language.enUS')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className='whitespace-pre-wrap text-sm'>{draft.draft}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('service.assistant.sources')}</CardTitle>
              <CardDescription>
                {t('service.assistant.sourcesHint')}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {draft.sources.length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  {t('service.assistant.noSources')}
                </p>
              ) : (
                draft.sources.map((source) => {
                  const article = matches.find((item) => item.id === source.id);
                  return (
                    <div
                      className='rounded-md border p-3 text-sm'
                      key={source.id}
                    >
                      <div className='font-medium'>{source.title}</div>
                      {article?.summary ? (
                        <p className='text-muted-foreground'>
                          {article.summary}
                        </p>
                      ) : null}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('service.assistant.knowledgeHit')}</CardTitle>
          <Input
            className='max-w-sm'
            placeholder={t('service.assistant.searchPlaceholder')}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </CardHeader>
        <CardContent className='space-y-2'>
          {matches.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('service.assistant.noMatch')}
            </p>
          ) : (
            matches.map((article) => (
              <div className='rounded-md border p-3 text-sm' key={article.id}>
                <div className='font-medium'>{article.title}</div>
                <p className='text-muted-foreground'>{article.summary ?? ''}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
