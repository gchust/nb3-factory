import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement } from 'react';
import { Link } from 'react-router';

import { Badge } from '@/components/ui/badge';
import type { AssistantCitation } from '@/pages/service/types.js';

/**
 * The passages an assistant answer is grounded in. A ticket citation links to
 * the work order the current user is allowed to open; a knowledge or manual
 * citation is shown as plain text because its page carries its own access.
 */
export function CitationList({
  citations,
}: {
  citations: readonly AssistantCitation[];
}): ReactElement | null {
  const { t } = useTranslation();
  if (citations.length === 0) return null;
  return (
    <ul className='mt-2 space-y-1'>
      {citations.map((citation) => (
        <li key={`${citation.type}-${citation.id}`} className='text-xs'>
          <Badge variant='outline' className='mr-2'>
            {t(`service.assistant.citation.${citation.type}`)}
          </Badge>
          {citation.type === 'ticket' ? (
            <Link
              to={citation.route}
              className='font-medium underline underline-offset-4'
            >
              {citation.title}
            </Link>
          ) : (
            <span className='font-medium'>{citation.title}</span>
          )}
          <span className='text-muted-foreground'> · {citation.snippet}</span>
        </li>
      ))}
    </ul>
  );
}
