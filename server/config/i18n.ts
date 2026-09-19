import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AppI18nConfig } from '@nocobase/app-server/i18n';

const i18n: AppConfigFactory<AppI18nConfig> = defineAppConfig((_runtime) => ({
  // This application is Chinese-first; the language picker still offers the
  // other locales declared in client/locales and server/locales.
  defaultLocale: 'zh-CN',
}));

export default i18n;
