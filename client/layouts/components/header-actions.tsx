import { useTranslation } from '@nocobase/i18n/client';
import { MonitorCog, Settings } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip';

import { ThemeSettings } from '../../theme/index.js';
import { ACTION_LINK_CLASS, MessageBell } from './message-bell.js';
import { UserMenu } from './user-menu.js';

/** Keep header entries visible on their destination pages so navigation stays consistent across surfaces. */
export function HeaderActions({
  showSettings,
  showDev,
}: {
  readonly showSettings: boolean;
  readonly showDev: boolean;
}): ReactElement {
  const { t } = useTranslation();

  return (
    <TooltipProvider>
      <div className='flex shrink-0 items-center gap-2'>
        {/* The dev entry sits left of settings and exists only while developing: a production build evaluates this to
          false and drops the link along with the whole dev surface it points at. */}
        {showDev ? (
          <Tooltip>
            <TooltipTrigger
              render={<Link to='/dev' className={ACTION_LINK_CLASS} />}
              aria-label={t('dev.componentExamples', {
                defaultValue: 'Component examples',
              })}
            >
              <MonitorCog className='size-5' />
            </TooltipTrigger>
            <TooltipContent side='bottom'>
              {t('dev.componentExamples', {
                defaultValue: 'Component examples',
              })}
            </TooltipContent>
          </Tooltip>
        ) : null}
        {showSettings ? (
          <Tooltip>
            <TooltipTrigger
              render={<Link to='/settings' className={ACTION_LINK_CLASS} />}
              aria-label={t('settings.title', { defaultValue: 'Settings' })}
            >
              <Settings className='size-5' />
            </TooltipTrigger>
            <TooltipContent side='bottom'>
              {t('settings.title', { defaultValue: 'Settings' })}
            </TooltipContent>
          </Tooltip>
        ) : null}
        <ThemeSettings />
        {/* The message center is a signed-in surface, so the bell lives with the other account entries. */}
        <MessageBell />
        <UserMenu />
      </div>
    </TooltipProvider>
  );
}
