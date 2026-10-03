import { useTranslation } from '@nocobase/i18n/client';

/**
 * The translated label of an opportunity stage, defaulting to the follow-up wording for anything unknown. Kept out of
 * `ui.tsx` because a file that exports both components and plain functions breaks Fast Refresh.
 */
export function useStageLabel(): (stage: string) => string {
  const { t } = useTranslation();
  return (stage) => {
    if (stage === 'won') return t('crm.stage.won');
    if (stage === 'lost') return t('crm.stage.lost');
    return t('crm.stage.follow_up');
  };
}

/** A numeric amount as it reads in the interface, at two decimals. */
export function formatAmount(amount: number): string {
  return (Math.round(amount * 100) / 100).toFixed(2);
}
