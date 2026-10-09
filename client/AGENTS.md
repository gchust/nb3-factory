# Client: materials assistant

The application adds one page, `client/pages/materials/`, declared in
`client/routes.ts` as `/materials` with the page id `materials` (the id the
server's permission sets grant).

- `index.tsx` — list page plus the assistant. Left column is the chat
  (`materials-assistant.tsx`); right column is the materials list. Both the list
  and the assistant read the same authorized set.
- `detail/index.tsx` — a material's own `RouteDrawer`, opened at
  `/materials/:materialId`.
- `new.tsx` / `edit.tsx` / `material-dialog.tsx` / `material-form.tsx` — the
  create and edit dialogs, as URL-addressable child routes. The edit dialog is
  declared both under the list (`edit/:materialId`) and under the drawer
  (`:materialId/edit`), so it stacks on whatever the user is looking at.
- `types.ts` — the response shape and `toMaterialId`, which converts a route
  param (text) to the integer the `id` column requires.

Create / edit / delete controls are gated by `useCan` on the composite
`app.materials` actions, which are the same grants the server enforces.

## The assistant

`materials-assistant.tsx` composes the application-owned chat UI from
`client/extensions/nocobase-ai/`. It gates the chat behind the AI
configuration: while loading it shows a spinner, and with no enabled model or
with a configuration error it shows a clear notice and points at the materials
list. It never fakes a reply. Per-page wrapping in `NocoBaseAIRootProvider` is
required because the AI client plugin does not mount it at the app root.

All user-visible text lives under `materials.*` in `client/locales/en-US.ts`
and `client/locales/zh-CN.ts`.
