import { useEffect, useState } from 'react';

type ExpenseDataListener = () => void;

const listeners = new Set<ExpenseDataListener>();

/**
 * The expense list and detail stay mounted underneath the child routes that
 * cover them (`new`, `edit`, `:reportId`), so creating, editing, submitting,
 * approving, paying or removing a file does not remount the reader that
 * loaded the data first. Mutations announce themselves here so every mounted
 * reader refetches instead of showing the values from before the save.
 */
export function subscribeExpenseData(
  listener: ExpenseDataListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function invalidateExpenseData(): void {
  for (const listener of Array.from(listeners)) listener();
}

/**
 * Returns a revision that increases whenever expense data changes elsewhere.
 * Include it in a fetch effect's dependency list to refetch on mutation.
 */
export function useExpenseInvalidation(): number {
  const [revision, setRevision] = useState(0);
  useEffect(
    () => subscribeExpenseData(() => setRevision((value) => value + 1)),
    [],
  );
  return revision;
}
