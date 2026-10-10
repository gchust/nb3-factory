# server notes

## Registration entry points

- `server/providers/index.ts` registers `KnowledgeProvider`; `server/routes/index.ts` registers the knowledge API
  routes; `server/ai/index.ts` registers the assistant's tool and employee. `server/app.ts` and
  `server/runtime.ts` are scaffolding.
- The App's own providers boot **after** every plugin provider. `KnowledgeProvider.boot()` therefore finds the
  Authorization and AI Employee services already registered, and the assistant employee may name a tool the same
  boot registers.

## The knowledge feature

- `server/knowledge-resources.ts` declares the authorization model once and is the single source of truth:
  the `knowledge.documents` composite (actions `read` / `manage`), the `knowledge.publicDocuments` record access,
  the page ids, the visibility values and the document row type. `server/knowledge-service.ts` builds the
  identity-scoped `AuthorizationContext`, authorizes the composite action and runs the scoped Repository query;
  `server/routes/knowledge.ts` is the HTTP layer and `server/routes/schemas.ts` holds the response schemas.
- Declaration order matters: a record access must be defined before the composite that references it, or
  registration validates the reference against a missing option. `KnowledgeProvider.boot()` does this.
- `KnowledgeProvider.boot()` checks `container.has(token)` before resolving the Authorization and AI Employee
  tokens. This is deliberate: a composition that omits those plugins still boots, and an app that mounts the
  knowledge routes without Authorization still fails loudly when the route factory resolves the token.
- The assistant tool (`server/ai/tools/knowledge-search.ts`) reuses the same service and authorization context, so
  a document the asker cannot open is never scored, quoted or cited. The tool is read-only by construction; do not
  add a parameter that writes.
- Server title keys use the application i18n namespace `nb3-factory` and live in `server/locales/{en-US,zh-CN}.ts`.
  The two server locale files are the list of languages the server can answer in and must cover the same keys.
- Relative server imports use the `.js` extension; `tsc-alias` resolves them for the build.

## AI configuration

`server/config/ai.ts` declares a test-only LLM service (`llmServices.test`) whose API key and base URL come from
`AI_TEST_API_KEY` / `AI_TEST_BASE_URL`. It is intentionally left unconfigured by default: with no enabled model the
assistant page shows its "service unavailable" state while manual document reading keeps working. Do not add a
pre-written fallback answer — the requirement is to say the service is unavailable, never to fabricate.
