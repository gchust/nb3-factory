import { useTranslation } from '@nocobase/i18n/client';

export interface TransitionText {
  readonly label: string;
  readonly title: string;
  readonly description: string;
}

/**
 * The wording of a lifecycle transition, for the record page's buttons and the dialogs they open.
 *
 * The lifecycle's own `title` is English and the server does not know the reader's language, so each transition the
 * application defines is named here with a literal `t()` call. A transition added to the lifecycle without a locale
 * entry falls back to its name, so the page still works while its copy is being written.
 */
export function useTransitionText(): (name: string) => TransitionText {
  const { t } = useTranslation();
  return (name) => {
    switch (name) {
      case 'assign':
        return {
          label: t('serviceDesk.transition.assign.label'),
          title: t('serviceDesk.transition.assign.title'),
          description: t('serviceDesk.transition.assign.description'),
        };
      case 'reassign':
        return {
          label: t('serviceDesk.transition.reassign.label'),
          title: t('serviceDesk.transition.reassign.title'),
          description: t('serviceDesk.transition.reassign.description'),
        };
      case 'start':
        return {
          label: t('serviceDesk.transition.start.label'),
          title: t('serviceDesk.transition.start.title'),
          description: t('serviceDesk.transition.start.description'),
        };
      case 'rework':
        return {
          label: t('serviceDesk.transition.rework.label'),
          title: t('serviceDesk.transition.rework.title'),
          description: t('serviceDesk.transition.rework.description'),
        };
      case 'resolve':
        return {
          label: t('serviceDesk.transition.resolve.label'),
          title: t('serviceDesk.transition.resolve.title'),
          description: t('serviceDesk.transition.resolve.description'),
        };
      case 'confirm':
        return {
          label: t('serviceDesk.transition.confirm.label'),
          title: t('serviceDesk.transition.confirm.title'),
          description: t('serviceDesk.transition.confirm.description'),
        };
      case 'return':
        return {
          label: t('serviceDesk.transition.return.label'),
          title: t('serviceDesk.transition.return.title'),
          description: t('serviceDesk.transition.return.description'),
        };
      case 'cancel':
        return {
          label: t('serviceDesk.transition.cancel.label'),
          title: t('serviceDesk.transition.cancel.title'),
          description: t('serviceDesk.transition.cancel.description'),
        };
      default:
        return { label: name, title: name, description: '' };
    }
  };
}
