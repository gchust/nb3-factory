import { useApiClient } from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useTranslation } from '@nocobase/i18n/client';
import { FlaskConical, ListChecks } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

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
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';

import {
  listTestTargets,
  readNotificationTestError,
  sendTestNotification,
} from './api.js';
import {
  buildTestRequest,
  isControlledFailure,
  isTestChannel,
  testRecipient,
  type NotificationTestSendResult,
  type NotificationTestTarget,
} from './test-target.js';

/**
 * A minimal entry that sends one test notification to an isolated test destination and points at the existing
 * notification logs page for the final delivery status. It reuses the notification plugin's test endpoints; the
 * destinations are pinned by `test-target.ts`, so a test never reaches a customer or a real group.
 */
export default function NotificationTestPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const { session } = useAuthentication();
  const currentUserId = session?.user?.id ?? '';
  const currentUserName =
    session?.user?.name ?? session?.user?.email ?? currentUserId;

  const [targets, setTargets] = useState<readonly NotificationTestTarget[]>();
  const [loadError, setLoadError] = useState<string>();
  const [selectedName, setSelectedName] = useState<string>();
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<NotificationTestSendResult>();
  const [sendError, setSendError] = useState<string>();

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const available = await listTestTargets(api);
        if (!active) return;
        setTargets(available.filter(isTestChannel));
        setLoadError(undefined);
      } catch (cause) {
        if (active) setLoadError(readNotificationTestError(cause));
      }
    })();
    return () => {
      active = false;
    };
  }, [api]);

  const activeName = selectedName ?? targets?.[0]?.channel.name;
  const selected = targets?.find(
    (target) => target.channel.name === activeName,
  );

  const destination = (target: NotificationTestTarget): string =>
    testRecipient(target, currentUserId) === currentUserId
      ? t('notificationTest.destinationUser', { name: currentUserName })
      : testRecipient(target, currentUserId);

  const send = (): void => {
    if (!selected || sending) return;
    setSending(true);
    setResult(undefined);
    setSendError(undefined);
    void (async () => {
      try {
        const response = await sendTestNotification(
          api,
          buildTestRequest(selected, currentUserId),
        );
        setResult(response);
        toast.add({
          type: 'success',
          title: t('notificationTest.acceptedTitle'),
          description: t('notificationTest.accepted', {
            id: response.notificationId,
            status: response.status,
          }),
        });
      } catch (cause) {
        const message = readNotificationTestError(cause);
        setSendError(message);
        toast.add({
          type: 'error',
          priority: 'high',
          title: t('notificationTest.failedTitle'),
          description: message,
        });
      } finally {
        setSending(false);
      }
    })();
  };

  return (
    <PageContainer>
      <PageHeader
        title={t('notificationTest.title')}
        description={t('notificationTest.description')}
        actions={
          <Button
            variant='outline'
            render={<Link to='/settings/notifications/logs' />}
          >
            <ListChecks data-icon='inline-start' />
            {t('notificationTest.viewLogs')}
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('notificationTest.channelsTitle')}</CardTitle>
          <CardDescription>
            {t('notificationTest.channelsDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          {targets === undefined && loadError === undefined ? (
            <div className='flex items-center gap-2 text-sm text-muted-foreground'>
              <Spinner />
              {t('notificationTest.loading')}
            </div>
          ) : null}

          {loadError !== undefined ? (
            <Alert variant='destructive'>
              <FlaskConical />
              <AlertTitle>{t('notificationTest.loadFailedTitle')}</AlertTitle>
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          ) : null}

          {targets !== undefined && targets.length === 0 ? (
            <Alert>
              <FlaskConical />
              <AlertTitle>{t('notificationTest.emptyTitle')}</AlertTitle>
              <AlertDescription>{t('notificationTest.empty')}</AlertDescription>
            </Alert>
          ) : null}

          {targets !== undefined && targets.length > 0 ? (
            <>
              <RadioGroup
                value={activeName ?? ''}
                onValueChange={setSelectedName}
              >
                {targets.map((target) => {
                  const id = `notification-test-${target.channel.name}`;
                  return (
                    <Field key={target.channel.name} orientation='horizontal'>
                      <RadioGroupItem value={target.channel.name} id={id} />
                      <FieldContent>
                        <FieldLabel htmlFor={id}>
                          {t('notificationTest.channelLabel', {
                            channel: target.channel.label,
                            provider: target.provider.label,
                          })}
                        </FieldLabel>
                        <FieldDescription>
                          {t('notificationTest.destination', {
                            destination: destination(target),
                          })}{' '}
                          {isControlledFailure(target)
                            ? t('notificationTest.failureHint')
                            : t('notificationTest.isolatedHint')}
                        </FieldDescription>
                      </FieldContent>
                    </Field>
                  );
                })}
              </RadioGroup>

              <Button
                type='button'
                onClick={send}
                disabled={!selected || sending}
              >
                {sending
                  ? t('notificationTest.sending')
                  : t('notificationTest.send')}
              </Button>
            </>
          ) : null}

          {result !== undefined ? (
            <Alert>
              <FlaskConical />
              <AlertTitle>{t('notificationTest.acceptedTitle')}</AlertTitle>
              <AlertDescription>
                {t('notificationTest.accepted', {
                  id: result.notificationId,
                  status: result.status,
                })}{' '}
                <Link
                  className='underline underline-offset-3'
                  to='/settings/notifications/logs'
                >
                  {t('notificationTest.viewLogs')}
                </Link>
              </AlertDescription>
            </Alert>
          ) : null}

          {sendError !== undefined ? (
            <Alert variant='destructive'>
              <FlaskConical />
              <AlertTitle>{t('notificationTest.failedTitle')}</AlertTitle>
              <AlertDescription>{sendError}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
