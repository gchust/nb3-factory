import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { UploadIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ReactElement } from 'react';

import { BackButton } from '@/components/back-button';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { RouteChildPage } from '@/components/route-child-page';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

import { commitImport, previewImport } from '../api.js';
import { EmptyState, RequestError } from '../components.js';
import type { ImportPreview, ImportRowInput } from '../types.js';

const COLUMNS = [
  'name',
  'industry',
  'level',
  'phone',
  'email',
  'website',
  'address',
  'source',
  'notes',
] as const;

const EXAMPLE_CSV = [
  COLUMNS.join(','),
  'Nimbus Robotics,Manufacturing,A,+86 21 5555 0101,hello@nimbus.example,nimbus.example,Shanghai,Referral,Robotics supplier',
  'Nimbus Robotics,Manufacturing,A,,, , , ,',
  'Orbit Foods,Retail,B,not-a-phone,not-an-email,,Beijing,Exhibition,Snack distributor',
].join('\n');

interface ParsedRow {
  readonly index: number;
  readonly values: string[];
}

/** Splits one CSV line, honouring double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (let position = 0; position < line.length; position += 1) {
    const character = line[position];
    if (quoted) {
      if (character === '"') {
        if (line[position + 1] === '"') {
          current += '"';
          position += 1;
        } else {
          quoted = false;
        }
      } else {
        current += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      values.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  values.push(current);
  return values;
}

function parseCsv(text: string): ParsedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0]).map((cell) => cell.trim());
  const hasHeader = header.some((cell) => cell.toLowerCase() === 'name');
  const body = hasHeader ? lines.slice(1) : lines;
  return body.map((line, position) => ({
    index: position + 1,
    values: splitCsvLine(line),
  }));
}

function toRows(values: readonly string[][]): ImportRowInput[] {
  return values.map((cells) => {
    const row: Record<string, string | null> = {};
    COLUMNS.forEach((column, index) => {
      const value = (cells[index] ?? '').trim();
      row[column] = value.length > 0 ? value : null;
    });
    return row;
  });
}

export default function CustomerImportPage(): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [created, setCreated] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(undefined);

  const rows = parseCsv(text);

  const runPreview = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    setCreated(null);
    try {
      const result = await previewImport(
        api,
        toRows(rows.map((row) => row.values)),
      );
      setPreview(result);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const runCommit = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await commitImport(
        api,
        toRows(rows.map((row) => row.values)),
      );
      setPreview(result.preview);
      setCreated(result.created);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = (status: string): string => {
    if (status === 'valid') return t('crm.import.status.valid');
    if (status === 'duplicate') return t('crm.import.status.duplicate');
    return t('crm.import.status.error');
  };

  const statusVariant = (
    status: string,
  ): 'default' | 'secondary' | 'destructive' => {
    if (status === 'valid') return 'default';
    if (status === 'duplicate') return 'secondary';
    return 'destructive';
  };

  return (
    <RouteChildPage>
      <PageContainer>
        <BackButton />
        <PageHeader
          description={t('crm.import.description')}
          title={t('crm.import.title')}
        />

        <div className='space-y-3'>
          <div className='flex flex-col gap-2'>
            <label className='text-sm font-medium' htmlFor='crm-import-file'>
              {t('crm.import.file')}
            </label>
            <Input
              accept='.csv,text/csv,text/plain'
              id='crm-import-file'
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void file.text().then((content) => {
                  setText(content);
                  setPreview(null);
                  setCreated(null);
                });
              }}
              ref={fileRef}
              type='file'
            />
          </div>
          <div className='grid gap-2'>
            <label className='text-sm font-medium' htmlFor='crm-import-text'>
              {t('crm.import.text')}
            </label>
            <Textarea
              className='min-h-40 font-mono text-xs'
              id='crm-import-text'
              onChange={(event) => {
                setText(event.target.value);
                setPreview(null);
                setCreated(null);
              }}
              value={text}
            />
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button
              disabled={busy || rows.length === 0}
              onClick={() => void runPreview()}
              variant='outline'
            >
              {t('crm.import.preview')}
            </Button>
            <Button
              disabled={busy || !preview || preview.valid === 0}
              onClick={() => void runCommit()}
            >
              <UploadIcon data-icon='inline-start' />
              {t('crm.import.commit', { count: preview?.valid ?? 0 })}
            </Button>
            <Button
              onClick={() => {
                setText(EXAMPLE_CSV);
                setPreview(null);
                setCreated(null);
              }}
              variant='ghost'
            >
              {t('crm.import.example')}
            </Button>
            <Button
              onClick={() => {
                setText('');
                setPreview(null);
                setCreated(null);
              }}
              variant='ghost'
            >
              {t('crm.import.clear')}
            </Button>
          </div>
        </div>

        {error ? <RequestError error={error} /> : null}

        {created != null ? (
          <Alert>
            <AlertTitle>{t('crm.import.doneTitle')}</AlertTitle>
            <AlertDescription>
              {t('crm.import.doneDescription', { count: created })}
            </AlertDescription>
          </Alert>
        ) : null}

        {preview ? (
          <>
            <div className='flex flex-wrap gap-4 text-sm'>
              <span>
                {t('crm.import.summary.total', { count: preview.total })}
              </span>
              <span>
                {t('crm.import.summary.valid', { count: preview.valid })}
              </span>
              <span>
                {t('crm.import.summary.duplicate', {
                  count: preview.duplicate,
                })}
              </span>
              <span>
                {t('crm.import.summary.error', { count: preview.error })}
              </span>
            </div>
            <div className='rounded-xl border border-border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('crm.import.column.row')}</TableHead>
                    <TableHead>{t('crm.import.column.status')}</TableHead>
                    <TableHead>{t('crm.import.column.name')}</TableHead>
                    <TableHead>{t('crm.import.column.detail')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.length === 0 ? (
                    <EmptyState colSpan={4}>{t('crm.import.empty')}</EmptyState>
                  ) : (
                    preview.rows.map((row) => (
                      <TableRow key={row.index}>
                        <TableCell>{row.index}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(row.status)}>
                            {statusLabel(row.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>{row.name || '—'}</TableCell>
                        <TableCell>
                          {row.status === 'error'
                            ? row.errors
                                .map((field) => t(`crm.import.field.${field}`))
                                .join(', ')
                            : null}
                          {row.status === 'duplicate'
                            ? t('crm.import.duplicateOf', {
                                name: row.duplicateOf ?? row.name,
                              })
                            : null}
                          {row.status === 'valid' ? '—' : null}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        ) : null}
      </PageContainer>
    </RouteChildPage>
  );
}
