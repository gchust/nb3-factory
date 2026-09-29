/**
 * Shared visual contract for the square icon controls in the header bar.
 *
 * Kept apart from `header-actions.tsx` so the notification bell can use it
 * without importing the component that renders the bell.
 */
export const HEADER_ACTION_LINK_CLASS =
  'inline-flex size-10 items-center justify-center rounded-xl border border-border/70 bg-background/60 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';
