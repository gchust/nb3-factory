import { useTranslation } from '@nocobase/i18n/client';
import { FileText, LoaderCircle, SearchX } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import type { AIToolRendererProps } from '@/extensions/nocobase-ai';

interface SourceDocument {
  readonly id: number;
  readonly title: string;
  readonly body: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * The persisted tool result, unwrapped to the tool's own payload.
 *
 * A stored message may carry the result as JSON text, and a backend tool wraps its payload as
 * `{ status, content }`, so a renderer has to accept both shapes. Anything else is treated as "no
 * documents", which renders no links rather than an error the user cannot act on.
 */
function readToolPayload(output: unknown): Record<string, unknown> {
  if (typeof output === 'string') {
    try {
      return readToolPayload(JSON.parse(output) as unknown);
    } catch {
      return {};
    }
  }
  if (!isRecord(output)) return {};
  if ('status' in output) {
    return output.status === 'success' ? readToolPayload(output.content) : {};
  }
  return output;
}

function readSources(output: unknown): readonly SourceDocument[] {
  const documents = readToolPayload(output).documents;
  if (!Array.isArray(documents)) return [];
  return documents.flatMap((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'number' ||
      typeof item.title !== 'string'
    ) {
      return [];
    }
    const body = typeof item.body === 'string' ? item.body : '';
    return [{ id: item.id, title: item.title, body }];
  });
}

/**
 * What the assistant read, as links the user can open.
 *
 * The answer cites documents by title, but a citation is only usable if the reader can reach the
 * source, so every document the tool returned is linked to its page. This is presentation only: it
 * never re-invokes the tool and never changes what the model saw.
 */
export function DocumentSourcesRenderer({
  part,
}: AIToolRendererProps): ReactElement {
  const { t } = useTranslation();
  const failed = part.state === 'output-error';
  const pending =
    part.state === 'input-streaming' || part.state === 'input-available';
  const sources = readSources('output' in part ? part.output : undefined);

  if (failed) return <></>;

  if (pending) {
    return (
      <p
        aria-live='polite'
        className='flex items-center gap-2 text-xs text-muted-foreground'
        role='status'
      >
        <LoaderCircle aria-hidden='true' className='size-3.5 animate-spin' />
        {t('tool.search-documents.searching')}
      </p>
    );
  }

  if (!sources.length) {
    return (
      <p className='flex items-center gap-2 text-xs text-muted-foreground'>
        <SearchX aria-hidden='true' className='size-3.5' />
        {t('tool.search-documents.empty')}
      </p>
    );
  }

  return (
    <div className='rounded-lg border border-border/70 bg-muted/30 p-3'>
      <div className='mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>
        {t('tool.search-documents.sources')}
      </div>
      <ul className='space-y-1'>
        {sources.map((source) => (
          <li key={source.id}>
            <Link
              className='inline-flex items-center gap-2 rounded-md text-sm text-primary underline-offset-4 hover:underline'
              to={`/documents/${source.id}`}
            >
              <FileText aria-hidden='true' className='size-3.5 shrink-0' />
              {source.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
