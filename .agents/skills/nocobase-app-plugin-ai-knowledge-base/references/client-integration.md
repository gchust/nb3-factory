# Client Integration

## Contents

- [Standard service](#standard-service)
- [Service injection](#service-injection)
- [Hooks and UI states](#hooks-and-ui-states)
- [Routes and settings](#routes-and-settings)
- [Files and authentication](#files-and-authentication)

## Standard service

Use the exported authenticated adapter:

```ts
import { knowledgeBaseService } from '@nocobase/app-plugin-ai-knowledge-base/client';

const page = await knowledgeBaseService.listKnowledgeBases({
  mode: 'server',
  page: 1,
  pageSize: 20,
});
```

The adapter uses the App portal SDK's `nocobaseClient`, sends resource/action requests, keeps response unwrapping disabled, validates response fields, and normalizes envelopes. It is a user-side action adapter, not an administrator authorization layer.

## Service injection

```tsx
import {
  KnowledgeBaseServiceProvider,
  type KnowledgeBaseService,
} from '@nocobase/app-plugin-ai-knowledge-base/client';

export function KnowledgeBaseArea({
  service,
}: {
  service: KnowledgeBaseService;
}) {
  return (
    <KnowledgeBaseServiceProvider service={service}>
      {/* knowledge-base UI */}
    </KnowledgeBaseServiceProvider>
  );
}
```

Use this for tests or an application-owned proxy that enforces roles/ownership and returns the same positive DTOs. The provider requires `service` and React `children`. Do not inject a service that exposes raw database rows or secrets.

`createKnowledgeBaseService(client)` accepts an object with:

```ts
action<T>(
  resource: string,
  action: string,
  options?: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    query?: Record<string, string | number | boolean | Array<string | number | boolean> | undefined>;
    body?: unknown;
    signal?: AbortSignal;
    unwrap?: 'data' | 'deep-data' | 'none';
  },
): Promise<T>;
```

This is public, but it is version-coupled to the action contract. Prefer `knowledgeBaseService` unless a proxy/test is necessary.

## Hooks and UI states

The three exported hooks expose `loading`, optional `data/error`, and `retry`. They cancel old requests and never render stale data after base/document/segment/service changes. Directory/list requests are opt-in through their `mode` option; detail requests run only when IDs/keys are present.

Use explicit states:

```tsx
const model = useKnowledgeBase({
  directory: { mode: 'paginated', page: 1, pageSize: 20 },
});
const state = model.directory.paginated;
if (state.loading) return <Loading />;
if (state.error) return <ErrorState onRetry={state.retry} />;
if (!state.data?.rows.length) return <EmptyState />;
```

The component barrel exports common/loading/empty primitives, directory/document/retrieval/segment/upload components, i18n helpers, prerequisite helpers/gate, and `VectorDatabasesPage`. Read installed declarations before composing page-level components because page props are more version-coupled than the service DTOs.

## Routes and settings

Path helpers URL-encode dynamic values. Use them for links instead of hard-coded strings. The package re-exports AI settings route constants from AI Employee plus workspace/document/segment/upload/retrieval builders.

The registered client plugin contributes two independent Settings sidebar entries beneath AI Employee's `aiGroup`: **Knowledge bases** at `/settings/ai/knowledge-base` and **Vector databases** at `/settings/ai/vector-database`. Register AI Employee as the group owner. Both entries and all knowledge-base descendants retain the existing `{ resource: { type: 'page', id: 'ai.settings' }, action: 'access' }` client guard; this is not a new server authorization layer.

`KnowledgeBaseSettingsPage` renders the list at its exact route and an `Outlet` for descendants. Workspace, document, upload, retrieval, and segment routes use the host router, so direct links, refresh, and browser history retain their URLs. Retrieval and segment details stay nested over the workspace, while document and upload pages replace it, preserving the existing page presentation. `VectorDatabaseSettingsPage` renders only the vector page. No page adds cross-feature tabs or an employee heading. AI Employee redirects legacy `?tab=knowledge-base` and `?tab=vector-database` links (and `aiSettingsTab` location state) with replace while preserving unrelated query parameters and hashes. Use the exported path helpers for new links.

The public `/client/routes` default export remains the development-route contribution for compatibility; its named `settingsRoutes` export contains the production Settings contribution. The client plugin registers both automatically. Do not register either contribution twice. Exported settings components require the host router and declared child routes; they do not create an isolated memory router.

Translations load dynamically through the plugin's `locales` contribution. Do not duplicate its namespace strings unless an App-specific extension deliberately owns its own namespace.

## Files and authentication

A document `url` is server-issued. Resolve relative URLs against the NocoBase origin and fetch with the current authentication headers/cookies. The public DTO comment explicitly requires this behavior. Do not trust a file URL as publicly accessible.

The prerequisite hook/gate checks plugin availability and can show checking/unavailable/error/available states. It is an experience gate only. An application proxy must still reject unauthorized reads and writes server-side.
