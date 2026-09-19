import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AppI18nConfig } from '@nocobase/app-server/i18n';

const i18n: AppConfigFactory<AppI18nConfig> = defineAppConfig((_runtime) => ({
  // The application is presented in Chinese; a saved browser-local choice still
  // wins, and `config.yml` (or APP_DEFAULT_LOCALE) can override this default.
  defaultLocale: 'zh-CN',
}));

export default i18n;
