import type { LocaleResource } from '@nocobase/i18n';

// Empty on purpose, not merely unfinished.
//
// The `/api` error contract states that `message` is developer-facing English and is never shown to an end user; the
// browser branches on the stable `reason` code and renders its own translation (`client/locales/`, `expense.error.*`).
// The one prose the server really does hand a user — the export's CSV column headers — is deliberately bilingual, so a
// finance export reads correctly whether the reader's interface is English or Chinese.
//
// Add keys here only when the server starts producing text that a user reads and has to be translated. Reword a
// plugin's server text with an `overrides` block rather than editing the plugin.
const enUS = {};

export type AppServerResource = LocaleResource<typeof enUS>;

export default enUS;
