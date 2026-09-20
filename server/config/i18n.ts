import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AppI18nConfig } from '@nocobase/app-server/i18n';

// This application's interface is Chinese-first; `i18n.defaultLocale` in config.yml still overrides it.
const i18n: AppConfigFactory<AppI18nConfig> = defineAppConfig((_runtime) => ({
  defaultLocale: 'zh-CN',
}));

export default i18n;
