/**
 * AI service assistant — readiness and oversight.
 *
 * The assistant itself is an AI Employee: an answer needs an enabled employee,
 * a usable model, and the repair knowledge it should read from. This page states
 * each of those as it actually is and links to the settings that change them,
 * rather than showing a chat box that could not answer.
 *
 * The conversational surface is a separate, optional client extension that this
 * build does not include. The page therefore reports what is configured and
 * where to configure it, and a supervisor can inspect the conversations the
 * assistant did have from here.
 */
import { type ReactElement, useCallback, useState } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import {
  CheckCircle2Icon,
  ExternalLinkIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { Link } from 'react-router';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useAIEmployeeClient,
  type AIEmployeeClient,
  type AIEmployeeRecord,
  type EnabledModelOption,
  type KnowledgeBaseOption,
} from '@nocobase/app-plugin-ai-employee/client';

// The conversation row type is not re-exported by the package's client entry, so
// it is derived from the client method that returns it rather than duplicated.
type ManagedConversation = Awaited<
  ReturnType<AIEmployeeClient['listManagedConversations']>
>['rows'][number];

import { useServiceApi } from './api.js';
import { formatDateTime, useLoad } from './data.js';
import {
  EmptyState,
  LoadFailure,
  Loading,
  ServicePage,
  StatCard,
} from './parts.js';
import type { MeView } from './types.js';

interface AssistantStatus {
  readonly employees: AIEmployeeRecord[];
  readonly models: EnabledModelOption[];
  readonly knowledgeBases: KnowledgeBaseOption[];
  readonly conversations: ManagedConversation[];
  readonly conversationError: string | null;
}

export default function AssistantPage(): ReactElement {
  const { t } = useTranslation();
  const api = useServiceApi();
  const ai = useAIEmployeeClient();
  const [conversationsOnly, setConversationsOnly] = useState(false);

  const me = useLoad(useCallback(() => api.get<MeView>('/me'), [api]));
  const isManager = me.data?.roles.includes('manager') ?? false;
  // The AI employee and AI knowledge-base list actions are gated by the AI
  // settings page (`page:ai.settings`) in the plugin, so an account without it
  // must not call them: doing so only produced a 403 the page could not explain.
  // The readiness and oversight body is therefore shown to whoever may open AI
  // settings, and every other service role sees where the assistant is managed.
  const canAISettings = useCan({
    resource: { type: 'page', id: 'ai.settings' },
    action: 'access',
  });

  const state = useLoad(
    useCallback(async (): Promise<AssistantStatus> => {
      if (!canAISettings.can) {
        return {
          employees: [],
          models: [],
          knowledgeBases: [],
          conversations: [],
          conversationError: null,
        };
      }
      const [employees, models, knowledgeBases] = await Promise.all([
        ai.listAIEmployees(),
        ai.listEnabledModels(),
        ai.listEnabledKnowledgeBases().catch(() => []),
      ]);
      let conversations: ManagedConversation[] = [];
      let conversationError: string | null = null;
      try {
        const page = await ai.listManagedConversations({
          keyword: '',
          page: 1,
        });
        conversations = page.rows;
      } catch (error) {
        conversationError =
          error instanceof Error ? error.message : String(error);
      }
      return {
        employees,
        models,
        knowledgeBases,
        conversations,
        conversationError,
      };
    }, [ai, canAISettings.can]),
  );

  const enabledEmployees = (state.data?.employees ?? []).filter(
    (row) => row.enabled !== false,
  );
  const hasModel = (state.data?.models.length ?? 0) > 0;
  const ready = enabledEmployees.length > 0 && hasModel;

  const checks = [
    {
      key: 'employee',
      ok: enabledEmployees.length > 0,
      label: t('service.assistant.checkEmployee'),
      detail: enabledEmployees.length,
    },
    {
      key: 'model',
      ok: hasModel,
      label: t('service.assistant.checkModel'),
      detail: state.data?.models.length ?? 0,
    },
    {
      key: 'knowledge',
      ok: (state.data?.knowledgeBases.length ?? 0) > 0,
      label: t('service.assistant.checkKnowledge'),
      detail: state.data?.knowledgeBases.length ?? 0,
    },
  ];

  return (
    <ServicePage
      title={t('service.assistant.title')}
      description={t('service.assistant.description')}
      actions={
        canAISettings.can ? (
          <Button variant='outline' render={<Link to='/settings/ai' />}>
            <ExternalLinkIcon className='size-4' />
            {t('service.assistant.openSettings')}
          </Button>
        ) : undefined
      }
    >
      {canAISettings.isPending ? <Loading /> : null}
      {!canAISettings.isPending && !canAISettings.can ? (
        <Card className='border-amber-500/50 dark:border-amber-400/40'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <TriangleAlertIcon className='size-4 text-amber-600 dark:text-amber-400' />
              {t('service.assistant.supervisorOnlyTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-sm text-muted-foreground'>
              {t('service.assistant.supervisorOnlyBody')}
            </p>
          </CardContent>
        </Card>
      ) : null}
      {canAISettings.can && state.loading ? <Loading /> : null}
      {canAISettings.can && state.error ? (
        <LoadFailure message={state.error} onRetry={() => state.reload()} />
      ) : null}

      {canAISettings.can && state.data ? (
        <>
          <Card
            className={
              ready
                ? 'border-primary/40'
                : 'border-amber-500/50 dark:border-amber-400/40'
            }
          >
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-base'>
                {ready ? (
                  <CheckCircle2Icon className='size-4 text-primary' />
                ) : (
                  <TriangleAlertIcon className='size-4 text-amber-600 dark:text-amber-400' />
                )}
                {ready
                  ? t('service.assistant.readyTitle')
                  : t('service.assistant.notReadyTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              <p className='text-sm text-muted-foreground'>
                {ready
                  ? t('service.assistant.readyBody')
                  : t('service.assistant.notReadyBody')}
              </p>
              <ul className='space-y-2'>
                {checks.map((check) => (
                  <li
                    key={check.key}
                    className='flex items-start gap-2 text-sm'
                  >
                    {check.ok ? (
                      <CheckCircle2Icon className='mt-0.5 size-4 shrink-0 text-primary' />
                    ) : (
                      <TriangleAlertIcon className='mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400' />
                    )}
                    <span>
                      <span className='font-medium'>{check.label}</span>
                      <span className='text-muted-foreground'>
                        {' '}
                        ({check.detail})
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className='rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground'>
                {t('service.assistant.chatSurfaceNotice')}
              </div>
            </CardContent>
          </Card>

          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            <StatCard
              label={t('service.assistant.statEmployees')}
              value={enabledEmployees.length}
            />
            <StatCard
              label={t('service.assistant.statModels')}
              value={state.data.models.length}
            />
            <StatCard
              label={t('service.assistant.statKnowledge')}
              value={state.data.knowledgeBases.length}
            />
            <StatCard
              label={t('service.assistant.statSkills')}
              value={enabledEmployees.reduce(
                (total, row) =>
                  total + (row.skillSettings?.skills?.length ?? 0),
                0,
              )}
            />
          </div>

          <div className='grid gap-4 lg:grid-cols-2'>
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>
                  {t('service.assistant.employees')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {state.data.employees.length === 0 ? (
                  <EmptyState message={t('service.assistant.noEmployees')} />
                ) : (
                  <ul className='space-y-3'>
                    {state.data.employees.map((row) => (
                      <li
                        key={row.username}
                        className='flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0'
                      >
                        <div>
                          <p className='font-medium'>
                            {row.nickname ?? row.username}
                          </p>
                          <p className='text-xs text-muted-foreground'>
                            {row.position ?? row.username}
                          </p>
                          {row.greeting ? (
                            <p className='mt-1 text-xs text-muted-foreground'>
                              {row.greeting}
                            </p>
                          ) : null}
                        </div>
                        <Badge
                          variant={
                            row.enabled === false ? 'outline' : 'secondary'
                          }
                        >
                          {row.enabled === false
                            ? t('service.assistant.disabled')
                            : t('service.assistant.enabled')}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className='text-base'>
                  {t('service.assistant.models')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {state.data.models.length === 0 ? (
                  <EmptyState message={t('service.assistant.noModels')} />
                ) : (
                  <ul className='space-y-3'>
                    {state.data.models.map((row) => (
                      <li
                        key={`${row.llmService}:${row.model}`}
                        className='flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0'
                      >
                        <div>
                          <p className='font-medium'>{row.label}</p>
                          <p className='text-xs text-muted-foreground'>
                            {row.serviceTitle} · {row.model}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className='flex items-center justify-between text-base'>
                <span>{t('service.assistant.conversations')}</span>
                {isManager ? (
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => setConversationsOnly((value) => !value)}
                  >
                    {conversationsOnly
                      ? t('service.common.all')
                      : t('service.assistant.onlyConversations')}
                  </Button>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              {state.data.conversationError ? (
                <p className='text-sm text-muted-foreground'>
                  {t('service.assistant.conversationsUnavailable', {
                    message: state.data.conversationError,
                  })}
                </p>
              ) : null}
              {conversationsOnly && !isManager ? (
                <p className='text-sm text-muted-foreground'>
                  {t('service.assistant.conversationsManagerOnly')}
                </p>
              ) : null}
              {isManager &&
              !conversationsOnly &&
              state.data.conversations.length === 0 ? (
                <EmptyState message={t('service.assistant.noConversations')} />
              ) : null}
              {isManager && conversationsOnly ? (
                state.data.conversations.length === 0 ? (
                  <EmptyState
                    message={t('service.assistant.noConversations')}
                  />
                ) : (
                  <div className='overflow-x-auto'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>
                            {t('service.assistant.conversationTitle')}
                          </TableHead>
                          <TableHead>
                            {t('service.assistant.conversationEmployee')}
                          </TableHead>
                          <TableHead>
                            {t('service.assistant.conversationUpdated')}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {state.data.conversations.map((row) => (
                          <TableRow key={row.sessionId}>
                            <TableCell className='font-medium'>
                              {row.title ?? row.sessionId}
                            </TableCell>
                            <TableCell>
                              {row.aiEmployeeUsername ?? '—'}
                            </TableCell>
                            <TableCell className='text-xs text-muted-foreground'>
                              {formatDateTime(row.updatedAt)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}
    </ServicePage>
  );
}
