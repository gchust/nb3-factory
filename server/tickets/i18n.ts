import { AsyncLocalStorage } from 'node:async_hooks';

import type { Translator } from '@nocobase/i18n/server';

const requestTranslator = new AsyncLocalStorage<Translator>();
let defaultTranslator: Translator | undefined;

/**
 * Binds the application's own language for work with no request behind it,
 * such as an overdue trigger or a transition validation.
 */
export const setTicketDefaultTranslator = (translator: Translator): void => {
  defaultTranslator = translator;
};

/**
 * Runs lifecycle work with the translator of the request that started it, so
 * guards and validation messages answer in the caller's language. Background
 * work has no request and falls back to the application's default language.
 */
export const withTicketTranslator = <T>(
  translator: Translator,
  callback: () => T,
): T => requestTranslator.run(translator, callback);

export const translateTicket = (
  fallback: Translator,
  key: string,
  params?: Record<string, unknown>,
): string => (requestTranslator.getStore() ?? fallback)(key, params);

/** For callbacks that only receive plain values, not the transition context. */
export const translateTicketDefault = (
  key: string,
  params?: Record<string, unknown>,
): string =>
  (requestTranslator.getStore() ?? defaultTranslator)?.(key, params) ?? key;
