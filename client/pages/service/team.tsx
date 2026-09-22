import { useTranslation } from '@nocobase/i18n/client';
import { UserPlus } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  EmptyState,
  ErrorState,
  LoadingState,
} from './components/data-states.js';
import { REGION_OPTIONS, regionLabel } from './lib/format.js';
import type { ServiceMember } from './lib/types.js';
import { useCaller, useServiceClient } from './lib/use-service.js';
import { useServiceQuery } from './lib/use-service-query.js';

interface MemberForm {
  userId: string;
  region: string;
  teamName: string;
}

const EMPTY: MemberForm = { userId: '', region: 'east', teamName: '' };

export default function ServiceTeamPage(): ReactElement {
  const { t } = useTranslation();
  const client = useServiceClient();
  const caller = useCaller();
  const [form, setForm] = useState<MemberForm>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const canManage = caller.data?.caller.capabilities['members.manage'] === true;

  const members = useServiceQuery(() => client.listMembers(), 'members');
  const candidates = useServiceQuery(
    () => (canManage ? client.listMemberCandidates() : Promise.resolve([])),
    `candidates:${canManage}`,
  );

  const save = async () => {
    if (!form || !form.userId) {
      setError(t('service.team.userRequired'));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await client.saveMember({
        userId: form.userId,
        region: form.region,
        teamName: form.teamName.trim() || undefined,
      });
      setForm(undefined);
      members.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const editing = (member: ServiceMember): void => {
    setError(undefined);
    setForm({
      userId: member.userId,
      region: member.region,
      teamName: member.teamName ?? '',
    });
  };

  return (
    <PageContainer>
      <PageHeader
        actions={
          canManage ? (
            <Button onClick={() => setForm(EMPTY)}>
              <UserPlus aria-hidden='true' />
              {t('service.team.assign')}
            </Button>
          ) : null
        }
        description={t('service.team.description')}
        title={t('service.team.title')}
      />
      <Card className='py-0'>
        <CardContent className='px-0'>
          {members.loading && !members.data ? <LoadingState /> : null}
          {members.error ? (
            <ErrorState error={members.error} onRetry={members.reload} />
          ) : null}
          {members.data ? (
            members.data.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('service.team.member')}</TableHead>
                    <TableHead>{t('service.team.region')}</TableHead>
                    <TableHead>{t('service.team.teamName')}</TableHead>
                    {canManage ? <TableHead /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.data.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className='font-medium'>
                        {member.userName ?? member.userId}
                        <span className='block font-mono text-xs text-muted-foreground'>
                          {member.userId}
                        </span>
                      </TableCell>
                      <TableCell>{regionLabel(t, member.region)}</TableCell>
                      <TableCell>{member.teamName ?? '—'}</TableCell>
                      {canManage ? (
                        <TableCell className='text-right'>
                          <Button
                            onClick={() => editing(member)}
                            size='xs'
                            variant='ghost'
                          >
                            {t('service.common.edit')}
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState className='m-4' message={t('service.team.empty')} />
            )
          ) : null}
        </CardContent>
      </Card>
      <Dialog
        open={form !== undefined}
        onOpenChange={(next) => !next && setForm(undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('service.team.assign')}</DialogTitle>
          </DialogHeader>
          {form ? (
            <div className='space-y-4'>
              <div className='space-y-2'>
                <Label htmlFor='memberUser'>{t('service.team.member')}</Label>
                <Select
                  value={form.userId || null}
                  onValueChange={(value) =>
                    setForm({ ...form, userId: value ? String(value) : '' })
                  }
                >
                  <SelectTrigger className='w-full' id='memberUser'>
                    <SelectValue
                      placeholder={t('service.team.memberPlaceholder')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.data?.map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        {candidate.name ??
                          candidate.username ??
                          candidate.email ??
                          candidate.id}{' '}
                        ·{' '}
                        {candidate.username ?? candidate.email ?? candidate.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-2'>
                <Label htmlFor='memberRegion'>{t('service.team.region')}</Label>
                <Select
                  value={form.region}
                  onValueChange={(value) =>
                    setForm({ ...form, region: value ? String(value) : 'none' })
                  }
                >
                  <SelectTrigger className='w-full' id='memberRegion'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REGION_OPTIONS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {regionLabel(t, value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-2'>
                <Label htmlFor='memberTeam'>{t('service.team.teamName')}</Label>
                <Input
                  id='memberTeam'
                  onChange={(event) =>
                    setForm({ ...form, teamName: event.target.value })
                  }
                  value={form.teamName}
                />
              </div>
            </div>
          ) : null}
          {error ? <p className='text-sm text-destructive'>{error}</p> : null}
          <DialogFooter>
            <Button onClick={() => setForm(undefined)} variant='outline'>
              {t('service.common.cancel')}
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              {t('service.common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
