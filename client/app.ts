import {
  ClientApplication,
  defineAppClientRenderConfig,
  readStoredLocale,
  writeStoredLocale,
  type AppClientConfig,
  type AppClientRenderConfig,
} from '@nocobase/app-client';
import { I18nProvider } from '@nocobase/i18n/client';
import type { I18nRuntime } from '@nocobase/i18n';
import type { ResolvedAppRuntime } from '@nocobase/app-client/runtime';
import {
  createElement,
  type PropsWithChildren,
  type ReactElement,
} from 'react';

import { AppRouter } from './routing/app-router.js';

/**
 * The deployment-independent interface language of this application.
 *
 * The SPA always publishes a resolved `i18n.defaultLocale`, and when the deployment config says nothing about i18n the
 * framework falls back to `en-US`. This application is built for a Chinese interface (the template's own `index.html`
 * and documented config example both say `zh-CN`), so when no deployment config and no visitor preference has chosen a
 * language, promote `zh-CN` instead of showing the framework's English fallback. An explicitly configured default or a
 * visitor's language switch is respected as-is.
 */
const INTERFACE_FALLBACK_LOCALE = 'zh-CN';
const FRAMEWORK_FALLBACK_LOCALE = 'en-US';

async function promoteInterfaceLocale(
  config: AppClientConfig,
  i18n: I18nRuntime,
): Promise<void> {
  if (readStoredLocale() !== undefined) {
    return;
  }
  if (config.get('i18n.defaultLocale') !== FRAMEWORK_FALLBACK_LOCALE) {
    return;
  }
  if (
    i18n.resolveLocale(INTERFACE_FALLBACK_LOCALE) !== INTERFACE_FALLBACK_LOCALE
  ) {
    return;
  }
  await i18n.changeLanguage(INTERFACE_FALLBACK_LOCALE);
  // The browser keeps its own copy in storage and treats it as the source of truth for what it renders, so persist the
  // choice to stay on the promoted language across reloads; an explicit switch later replaces it.
  writeStoredLocale(INTERFACE_FALLBACK_LOCALE);
}

export async function createApp(
  runtime: ResolvedAppRuntime,
): Promise<ClientApplication> {
  await promoteInterfaceLocale(runtime.config, runtime.i18n);

  // Outermost, so every provider and page below can translate.
  const AppI18nProvider = ({ children }: PropsWithChildren): ReactElement =>
    createElement(I18nProvider, { runtime: runtime.i18n }, children);

  return new ClientApplication({
    runtime,
    createRenderConfig: (): AppClientRenderConfig =>
      defineAppClientRenderConfig({
        basename: runtime.basename,
        reactProviders: [
          AppI18nProvider,
          ...runtime.reactProviders.map((provider) => provider.component),
        ],
        routes: createElement(AppRouter, {
          clientRoutes: runtime.routes,
          settingsRouteTree: runtime.settingsRouteTree,
          devRouteTree: runtime.devRouteTree,
        }),
      }),
  });
}
