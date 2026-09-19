import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AppI18nConfig } from '@nocobase/app-server/i18n';

const i18n: AppConfigFactory<AppI18nConfig> = defineAppConfig((_runtime) => ({
  // The application is Chinese-first; English remains available from the language switcher.
  defaultLocale: 'zh-CN',
}));

export default i18n;
