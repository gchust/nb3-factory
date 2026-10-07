import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useMemo, useState, type ReactElement } from 'react';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';

import { collaboratorName } from './format.js';
import type { Collaborator } from './types.js';

/**
 * The directory every member, assignee and share picker chooses from.
 *
 * The endpoint caps the list, so this is a plain select over the first page rather than a search-as-you-type
 * combobox. That is enough for a small team; a larger directory would page the same endpoint.
 */
export function CollaboratorPicker({
  value,
  onValueChange,
  placeholder,
  allowNone = false,
  disabled = false,
  excludeIds = [],
}: {
  readonly value: string | null;
  readonly onValueChange: (value: string | null) => void;
  readonly placeholder?: string;
  readonly allowNone?: boolean;
  readonly disabled?: boolean;
  /** People already chosen elsewhere (existing members, already-shared colleagues) to leave out of the list. */
  readonly excludeIds?: readonly string[];
}): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const [people, setPeople] = useState<readonly Collaborator[]>();
  const excluded = useMemo(() => new Set(excludeIds), [excludeIds]);

  useEffect(() => {
    const controller = new AbortController();
    api
      .request<{ data: Collaborator[] }>({
        path: 'projectCollaborators',
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted) setPeople(data);
        },
        () => {
          if (!controller.signal.aborted) setPeople([]);
        },
      );
    return () => controller.abort();
  }, [api]);

  const items = useMemo(
    () =>
      (people ?? [])
        .filter((person) => !excluded.has(person.id))
        .map((person) => ({
          value: person.id,
          label: collaboratorName(person),
        })),
    [people, excluded],
  );

  if (people === undefined) {
    return (
      <div className='flex h-9 items-center gap-2 text-sm text-muted-foreground'>
        <Spinner />
        {t('status.loading')}
      </div>
    );
  }

  const noneItem = allowNone
    ? [{ value: null, label: placeholder ?? t('projects.fields.unassigned') }]
    : [];

  return (
    <Select
      disabled={disabled}
      items={[...noneItem, ...items]}
      value={value}
      onValueChange={(next) => onValueChange(next)}
    >
      <SelectTrigger className='w-full' aria-label={placeholder}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {allowNone ? (
            <SelectItem value={null}>
              {placeholder ?? t('projects.fields.unassigned')}
            </SelectItem>
          ) : null}
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
