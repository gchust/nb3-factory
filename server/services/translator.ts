import {
  APP_NS,
  type I18nRuntime,
  type Translator,
} from '@nocobase/i18n/server';

// Server-produced business text follows the language of the person who triggered the work, and falls back to the
// application default. Translation happens here rather than in the route so scheduled jobs and workflow run modules
// produce the same consistent records.
export interface ServerTranslator {
  translate(
    locale: string | undefined,
    key: string,
    params?: Record<string, unknown>,
  ): Promise<string>;
}

export function createServerTranslator(
  resolve: () => I18nRuntime | undefined,
): ServerTranslator {
  return {
    async translate(locale, key, params) {
      const runtime = resolve();
      if (!runtime) return key;
      try {
        const resolved = runtime.resolveLocale(locale);
        await runtime.ensureLocaleLoaded(resolved);
        const t: Translator = runtime.getFixedT(APP_NS, resolved);
        return t(key, params);
      } catch {
        return key;
      }
    },
  };
}
