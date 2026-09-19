import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AppI18nConfig } from '@nocobase/app-server/i18n';

const i18n: AppConfigFactory<AppI18nConfig> = defineAppConfig((_runtime) => ({
  // The sales system's UI is authored in Chinese first; English remains a full
  // translation and a browser-local choice still wins over this default.
  defaultLocale: 'zh-CN',
}));

export default i18n;
