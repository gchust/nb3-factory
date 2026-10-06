# Client and Server API

Most Apps need no code for the knowledge base: registering the plugin adds the settings pages, and configuration plus Manifests do the rest. Read this when App code must show knowledge-base data on its own pages, replace the management UI, or import documents from server code.

## Contents

- [Package exports](#package-exports)
- [What registration contributes](#what-registration-contributes)
- [The client service and hooks](#the-client-service-and-hooks)
- [Editable UI from the Registry](#editable-ui-from-the-registry)
- [Server code](#server-code)
- [Boundaries](#boundaries)

## Package exports

| Import                                                           | Contents                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nocobase/app-plugin-ai-knowledge-base/client`                  | Default client plugin factory (registration); `useKnowledgeBaseService`, `createKnowledgeBaseService`, `createKnowledgeBaseApiTransport`, `KnowledgeBaseServiceProvider`; hooks; DTO types and error/pagination utilities; components; route-path helpers |
| `@nocobase/app-plugin-ai-knowledge-base/client/settings-pages`   | `KnowledgeBaseSettingsPage`, `VectorDatabaseSettingsPage`                                                                                                                                                                                                 |
| `@nocobase/app-plugin-ai-knowledge-base/client/routes`           | named `settingsRoutes` (production) and a default development-route contribution; both are already registered by the client plugin                                                                                                                        |
| `@nocobase/app-plugin-ai-knowledge-base/client/vector-databases` | the vector-database page component                                                                                                                                                                                                                        |
| `@nocobase/app-plugin-ai-knowledge-base/server`                  | default server plugin (registration); `knowledgeBaseManifestServiceToken` and the Manifest types (`KnowledgeBaseManifest`, `KnowledgeBaseManifestApplyInput`, `ManifestRecord`, `ManifestFileRecord`, ...)                                                |
| `@nocobase/app-plugin-ai-knowledge-base`                         | the same client surface as `/client`                                                                                                                                                                                                                      |

## What registration contributes

The client plugin adds two entries under AI Employee's AI settings group, **Knowledge bases** at `/settings/ai/knowledge-base` and **Vector databases** at `/settings/ai/vector-database`, with child routes for a knowledge base's workspace, documents, uploads, retrieval results and segments. Every one is guarded by `page:ai.settings` / `access`, the same grant the server requires. The pages report results through the App's Base UI toast and fail to render without the `toaster` provider — see SKILL.md § Prerequisites. Do not register these routes again, and link to them with the exported helpers — `knowledgeBaseWorkspacePath(key)`, `knowledgeBaseDocumentPath(key, documentId)`, `knowledgeBaseUploadPath(key)`, `knowledgeBaseRetrievalPath(key, index)`, `knowledgeBaseSegmentPath(key, documentId, segmentUid)` — rather than spelling paths out.

The server plugin contributes the `/api/aiKnowledgeBases` and `/api/aiKnowledgeBase` routes, the vectorization job, the PGVector provider, config synchronization, Manifest processing, and the knowledge-base feature the AI Employee plugin's retrieval uses. It exports no service for App code other than the Manifest token.

An importable subpath is not a runtime contribution. Importing a component or the service from `/client` registers nothing; registration is the entry in `client/plugins.ts`.

## The client service and hooks

The knowledge-base service is an authenticated adapter over the HTTP routes, speaking through the App's `ApiClient` so requests follow its `api.baseURL` and session. It validates and normalizes responses into typed DTOs; it is not an authorization layer, and every call still needs AI settings access. Inside a component, `useKnowledgeBaseService()` returns it:

```tsx
import { useKnowledgeBaseService } from '@nocobase/app-plugin-ai-knowledge-base/client';

const service = useKnowledgeBaseService();
const page = await service.listKnowledgeBases({
  mode: 'server',
  page: 1,
  pageSize: 20,
});
```

Outside React, build one from the App's client: `createKnowledgeBaseService(createKnowledgeBaseApiTransport(api))`, with `api` resolved from `apiClientToken`. There is no module-level service instance. A failed call rejects with the client's `ApiClientError`; branch on its `reason`, such as `SEGMENT_CONTENT_CHANGED` or `KNOWLEDGE_BASE_NOT_FOUND`, never on its message — `normalizeKnowledgeBaseError` reads `status` and `reason` for you. Knowledge bases are updated and deleted by their `key`, as their URLs address them.

`useKnowledgeBase`, `useKnowledgeBaseDocument` and `useKnowledgeBaseSegment` wrap it with `loading`, `data`, `error` and `retry`, cancel stale requests when their keys change, and read the service from `KnowledgeBaseServiceProvider` when one is mounted. Mount that provider with another implementation of `KnowledgeBaseService` for tests, or for an App-owned proxy that enforces its own authorization. `createKnowledgeBaseService(client)` builds the adapter over any other `KnowledgeBaseApiTransport`, an object with one `request({ method, path, query, body, signal })` method that returns the response body.

Read the installed declarations (`node_modules/@nocobase/app-plugin-ai-knowledge-base/dist/client/**/*.d.ts`) for exact method signatures before calling them; copy names and shapes from there rather than from memory. Page-level components are more version-coupled than the service, the hooks and the DTOs.

A document's `url` is server-issued and protected: resolve it against the App origin and fetch it with the current session. It is not a public link.

## Editable UI from the Registry

When the App must own and modify the management UI instead of using the built-in pages, the package ships three shadcn Registry items, installed as App source and owned by the App afterwards:

| Item         | Target                                                    | Contents                                                               |
| ------------ | --------------------------------------------------------- | ---------------------------------------------------------------------- |
| `providers`  | `client/extensions/nocobase-ai-knowledge-base-providers`  | service adapter, DTOs, error/pagination normalization, provider, hooks |
| `components` | `client/extensions/nocobase-ai-knowledge-base-components` | controlled knowledge-base, document, upload, retrieval and segment UI  |
| `workspace`  | `client/extensions/nocobase-ai-knowledge-base-workspace`  | the complete management workspace composition                          |

Install in that order; `components` needs `providers`, and `workspace` needs both. The Registry JSON ships in the installed package at `node_modules/@nocobase/app-plugin-ai-knowledge-base/public/r/<item>.json`; install from there so the source matches the plugin version the App runs, using the same procedure the AI Employee Skill describes for its `nocobase-ai` item (`references/chat-surfaces.md` § Install the extension in `nocobase-app-plugin-ai-employee`). Installing an item registers no route and enables nothing, and it never overwrites an existing target. On a plugin upgrade, merge the new canonical source into the App's copy with a three-way merge; do not overwrite App edits.

## Server code

The only server-side contract is `knowledgeBaseManifestServiceToken`, for importing documents from App code with the same idempotency as startup Manifests — see [manifests.md § Apply a Manifest from server code](manifests.md#apply-a-manifest-from-server-code). Resolve it from the App container inside a `ServiceProvider`, and import it from `@nocobase/app-plugin-ai-knowledge-base/server`; a token recreated with the same name is a different key.

Retrieval for an agent is the AI Employee plugin's business: bind the knowledge base to the employee and it gets the `knowledge-base-retrieve` tool. An App does not call vector search itself.

## Boundaries

- Do not import unexported paths: repositories, managers, services, factories, the PGVector provider, the vectorization job and the migrations are private.
- Do not read or write the plugin's tables to create knowledge bases or documents; that bypasses storage, segmentation, vectorization and cleanup.
- There is no public API to register another vector-database provider or an external vector store from App code in this version.
