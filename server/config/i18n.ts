import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AppI18nConfig } from '@nocobase/app-server/i18n';

const i18n: AppConfigFactory<AppI18nConfig> = defineAppConfig((_runtime) => ({
  // This is a Chinese-first business application; deployments that prefer
  // another language override it with `i18n.defaultLocale` in config.yml.
  defaultLocale: 'zh-CN',
}));

export default i18n;
