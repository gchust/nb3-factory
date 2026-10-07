import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  FileTextIcon,
  MessageCircleQuestionIcon,
  SparklesIcon,
} from 'lucide-react';
import { type ReactElement, useState } from 'react';
import { Link, useLocation } from 'react-router';

import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import {
  askQuestion,
  documentCenterErrorKey,
  type Answer,
} from '@/lib/document-center';

export function AskPanel(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const location = useLocation();
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // The question that produced the answer on screen, so it can be shown beside the result.
  const [askedQuestion, setAskedQuestion] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);

  async function submit(): Promise<void> {
    const trimmed = question.trim();
    if (!trimmed || asking) return;
    setAsking(true);
    setError(null);
    try {
      const result = await askQuestion(api, trimmed);
      setAnswer(result);
      setAskedQuestion(trimmed);
    } catch (failure) {
      setError(failure);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className='space-y-6'>
      <form
        className='space-y-3'
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className='space-y-2'>
          <Label htmlFor='document-question'>{t('documents.ask.label')}</Label>
          <Textarea
            id='document-question'
            value={question}
            rows={3}
            placeholder={t('documents.ask.placeholder')}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </div>
        <div className='flex items-center gap-3'>
          <Button type='submit' disabled={asking || question.trim() === ''}>
            {asking ? <Spinner /> : <SparklesIcon />}
            {asking ? t('documents.ask.asking') : t('documents.ask.submit')}
          </Button>
          <p className='text-sm text-muted-foreground'>
            {t('documents.ask.hint')}
          </p>
        </div>
      </form>

      {error ? (
        <Alert variant='destructive'>
          <AlertTitle>
            {t(`documents.error.${documentCenterErrorKey(error)}`)}
          </AlertTitle>
        </Alert>
      ) : null}

      {answer === null ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <MessageCircleQuestionIcon />
            </EmptyMedia>
            <EmptyTitle>{t('documents.ask.empty.title')}</EmptyTitle>
            <EmptyDescription>
              {t('documents.ask.empty.description')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : answer.hasAnswer ? (
        <div className='space-y-3'>
          <div>
            <h2 className='font-heading text-lg font-medium'>
              {t('documents.ask.citationsTitle')}
            </h2>
            <p className='text-sm text-muted-foreground'>
              {t('documents.ask.citationsDescription', {
                question: askedQuestion,
              })}
            </p>
          </div>
          <ul className='space-y-3'>
            {answer.citations.map((citation) => (
              <li
                key={`${citation.documentId}:${citation.version}:${citation.heading ?? ''}`}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className='flex items-center gap-2 text-base'>
                      <FileTextIcon className='size-4 shrink-0 text-muted-foreground' />
                      <Link
                        className='hover:underline'
                        to={{
                          pathname: citation.documentId,
                          search: location.search,
                        }}
                      >
                        {citation.title}
                      </Link>
                    </CardTitle>
                    <CardDescription>
                      {citation.heading
                        ? t('documents.ask.citationMeta', {
                            heading: citation.heading,
                            version: citation.version,
                          })
                        : t('documents.ask.citationMetaNoHeading', {
                            version: citation.version,
                          })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className='text-sm leading-6 whitespace-pre-wrap'>
                      {citation.snippet}
                    </p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <Alert>
          <AlertTitle>{t('documents.ask.noAnswer.title')}</AlertTitle>
          <p className='text-sm text-muted-foreground'>
            {t('documents.ask.noAnswer.description')}
          </p>
        </Alert>
      )}
    </div>
  );
}
