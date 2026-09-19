import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AppI18nConfig } from '@nocobase/app-server/i18n';

// The delivery application is used in Chinese; a saved browser choice still wins.
const i18n: AppConfigFactory<AppI18nConfig> = defineAppConfig((_runtime) => ({
  defaultLocale: 'zh-CN',
}));

export default i18n;
