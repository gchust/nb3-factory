# client notes

## Pages and routes

- Routes are declared in `client/routes.ts` only. The `knowledge` navigation group holds the two pages, and each
  page carries its own `authz` page id (`knowledgeDocuments`, `knowledgeAssistant`). Those ids are the permission
  identifiers granted by the knowledge permission sets; renaming one requires migrating the stored grants.
- `client/pages/knowledge-documents/` lists documents and, for a supervisor, edits title and body through
  `edit-document-dialog.tsx`. Data access is isolated in `document-api.ts` and goes through `useApiClient`.
- `client/pages/knowledge-assistant/` is the read-only chat surface. `assistant-gate.tsx` gates it on the AI
  service being configured and the `document-assistant` employee existing; the page hides the employee, model,
  user-prompt, attachment and web-search controls so the surface cannot leave its document-only scope. When the
  service is unavailable the gate renders a localized message and a link to the documents page, which stays usable.
- All user-visible strings go through `client/locales/{en-US,zh-CN}.ts`. `en-US.ts` defines the shape, so a key
  present in one locale and missing in the other is a compile error.

## The `nocobase-ai` extension

`client/extensions/nocobase-ai/` is application-owned source installed from the NocoBase UI Library. It ships its
own locale dictionary (`locales/index.ts`, read through `useAITranslate`) under the `nocobase-ai` namespace, so its
`t('...')` calls are **not** application translation keys. `tests/logic/app-locale-coverage.test.ts` treats any
`client/extensions/<name>/` directory that owns a `locales/index.ts` as self-translating and skips its whole
subtree. Add application keys only for strings this application writes, and never edit the extension to add one.

## UI conventions

- Build with the shadcn/ui primitives already under `client/components/ui/`. Style with the semantic Tailwind
  tokens (`bg-card`, `text-muted-foreground`, `border-border`, ...) so light and dark themes both work; a fixed
  color breaks theme switching.
- The Base UI `Button` takes a `render` prop for links (`render={<Link to='...' />}`), not Radix's `asChild`.
- Pages use `PageContainer` + `PageHeader`; `@` resolves to `./client` and relative imports use the `.js`
  extension.
